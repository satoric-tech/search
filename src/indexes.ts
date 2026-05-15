import { readFileSync } from "fs";
import { createInterface } from "readline";
import { Command } from "commander";
import { load as parseYaml } from "js-yaml";
import { DEFAULT_BASE_URL } from "./constants.js";
import { apiRequest, ApiError } from "./client.js";
import { toPainless } from "./math.js";
import type { Index, IndexInfo } from "./types.js";
import { upsertCommand, deleteCommand } from "./documents.js";
import { makeSearchCommand } from "./search.js";

interface IndexConfig {
  name?: string;
  mappings: Record<string, unknown>;
}

type ReturnKind = "full" | "head" | "tail" | "snippet";

interface ReturnField {
  field: string;
  kind: ReturnKind;
  size?: number;
}

interface Hints {
  id?: string;
  language?: string;
  return_fields?: ReturnField[];
  boost_script?: string;
}

function loadConfig(filePath: string): IndexConfig {
  const raw = readFileSync(filePath, "utf8");
  const ext = filePath.split(".").pop()?.toLowerCase();
  let parsed: unknown;
  if (ext === "yaml" || ext === "yml") {
    parsed = parseYaml(raw);
  } else {
    parsed = JSON.parse(raw);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as Record<string, unknown>).mappings !== "object"
  ) {
    throw new Error(`Config must have a "mappings" object`);
  }
  return parsed as IndexConfig;
}

function parseReturnParam(s: string): ReturnField[] {
  return s
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): ReturnField | null => {
      const colonIdx = part.indexOf(":");
      if (colonIdx === -1) {
        return { field: part, kind: "full" };
      }
      const field = part.slice(0, colonIdx).trim();
      const rest = part.slice(colonIdx + 1).trim();
      if (!field) return null;
      if (rest.startsWith("~")) {
        const size = parseInt(rest.slice(1));
        return isNaN(size) ? null : { field, kind: "snippet", size };
      }
      if (rest.startsWith("-")) {
        const size = parseInt(rest.slice(1));
        return isNaN(size) ? null : { field, kind: "tail", size };
      }
      const size = parseInt(rest);
      return isNaN(size) ? null : { field, kind: "head", size };
    })
    .filter((f): f is ReturnField => f !== null);
}

function buildCreateHints(options: {
  id?: string;
  language?: string;
  return?: string;
  boost?: string;
}): Hints | undefined {
  const hints: Hints = {};
  let hasHints = false;

  if (options.id) {
    hints.id = options.id;
    hasHints = true;
  }
  if (options.language) {
    hints.language = options.language;
    hasHints = true;
  }
  if (options.return) {
    hints.return_fields = parseReturnParam(options.return);
    hasHints = true;
  }
  if (options.boost) {
    hints.boost_script = toPainless(options.boost);
    hasHints = true;
  }

  return hasHints ? hints : undefined;
}

function buildUpdateHints(options: { return?: string; boost?: string }): Hints | undefined {
  const hints: Hints = {};
  let hasHints = false;

  if (options.return) {
    hints.return_fields = parseReturnParam(options.return);
    hasHints = true;
  }
  if (options.boost) {
    hints.boost_script = toPainless(options.boost);
    hasHints = true;
  }

  return hasHints ? hints : undefined;
}

async function confirm(name: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`  Type "${name}" to confirm: `, (answer: string) => {
      rl.close();
      resolve(answer.trim() === name);
    });
  });
}

function requireApiKey(options: { apiKey?: string }): string {
  const key = options.apiKey ?? process.env.SATORIC_API_KEY;
  if (!key) {
    process.stderr.write("Error: -k/--api-key is required (or set SATORIC_API_KEY)\n");
    process.exit(1);
  }
  return key;
}

function requireName(options: { name?: string }): string {
  const name = options.name ?? process.env.SATORIC_INDEX;
  if (!name) {
    process.stderr.write("Error: -n/--name is required (or set SATORIC_INDEX)\n");
    process.exit(1);
  }
  return name;
}

const listCommand = new Command("list")
  .description("List indexes")
  .option("-k, --api-key <key>", "API key (default: $SATORIC_API_KEY)")
  .action(async (options: { apiKey?: string }) => {
    const apiKey = requireApiKey(options);
    try {
      const indexes = await apiRequest<Index[]>(
        "GET",
        `${DEFAULT_BASE_URL}/indexes`,
        undefined,
        apiKey
      );
      if (indexes.length === 0) {
        process.stdout.write("No indexes.\n");
      } else {
        process.stdout.write(indexes.map((i) => i.name).join("\n") + "\n");
      }
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });

const infoCommand = new Command("info")
  .description("Show index stats and optionally its schema")
  .option("--schema", "also print full mappings")
  .option("-n, --name <name>", "index name (default: $SATORIC_INDEX)")
  .option("-k, --api-key <key>", "API key (default: $SATORIC_API_KEY)")
  .action(async (options: { name?: string; apiKey?: string; schema?: boolean }) => {
    const apiKey = requireApiKey(options);
    const name = requireName(options);
    try {
      const info = await apiRequest<IndexInfo>(
        "GET",
        `${DEFAULT_BASE_URL}/indexes/${encodeURIComponent(name)}`,
        undefined,
        apiKey
      );
      const size =
        info.size_in_bytes > 1_000_000
          ? `${(info.size_in_bytes / 1_000_000).toFixed(1)} MB`
          : `${(info.size_in_bytes / 1_000).toFixed(1)} KB`;
      const properties =
        (info.mappings as Record<string, Record<string, unknown>>).properties ?? {};
      process.stdout.write(
        `name:       ${info.name}\n` +
          `docs:       ${info.num_docs.toLocaleString()}\n` +
          `size:       ${size}\n` +
          `created:    ${new Date(info.created_at * 1000).toISOString()}\n` +
          `fields:     ${Object.keys(properties).join(", ")}\n`
      );
      if (options.schema) {
        process.stdout.write("\n" + JSON.stringify(info.mappings, null, 2) + "\n");
      }
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });

const createCommand = new Command("create")
  .description("Create an index")
  .option("--id <field>", "field used as document ID")
  .option("--language <lang>", "default analyzer language, e.g. english")
  .option("--return <spec>", "return fields, e.g. url,title:128,body:~256,body:-256")
  .option("-b, --boost <expr>", 'boost expression, e.g. "1 - rank/1000000"')
  .option("-C, --config <file>", "path to JSON or YAML config file (advanced)")
  .option("-n, --name <name>", "index name (default: $SATORIC_INDEX)")
  .option("-k, --api-key <key>", "API key (default: $SATORIC_API_KEY)")
  .addHelpText(
    "after",
    `
Return field syntax:
  url              full field value
  title:128        first 128 chars  → title_head
  body:-256        last 256 chars   → body_tail
  body:~256        snippet (highlighted excerpt, 256 chars) → body_snippet

Examples:
  satoric index create -n my-docs --id url --language english --return "url,title:128,body:~256"
  satoric index create -n my-docs --config my-docs.json`
  )
  .action(
    async (options: {
      name?: string;
      apiKey?: string;
      config?: string;
      id?: string;
      language?: string;
      return?: string;
      boost?: string;
    }) => {
      const apiKey = requireApiKey(options);
      const name = requireName(options);
      let body: Record<string, unknown> = {};

      if (options.config) {
        try {
          const config = loadConfig(options.config);
          body = { mappings: config.mappings };
        } catch (e) {
          process.stderr.write(`Error loading config: ${(e as Error).message}\n`);
          process.exit(1);
        }
      } else {
        try {
          const hints = buildCreateHints(options);
          if (hints) body = { hints };
        } catch (e) {
          process.stderr.write(`Error: ${(e as Error).message}\n`);
          process.exit(1);
        }
      }

      try {
        await apiRequest(
          "PUT",
          `${DEFAULT_BASE_URL}/indexes/${encodeURIComponent(name)}`,
          body,
          apiKey
        );
        process.stdout.write(`Index '${name}' created.\n`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          process.stderr.write(`Error: index '${name}' already exists\n`);
        } else {
          process.stderr.write(`Error: ${(e as Error).message}\n`);
        }
        process.exit(1);
      }
    }
  );

const updateCommand = new Command("update")
  .description("Update index search configuration")
  .option("--return <spec>", "return fields, e.g. url,title:128,body:~256,body:-256")
  .option("-b, --boost <expr>", 'boost expression, e.g. "1 - rank/1000000"')
  .option("-C, --config <file>", "path to JSON or YAML config file (advanced)")
  .option("-n, --name <name>", "index name (default: $SATORIC_INDEX)")
  .option("-k, --api-key <key>", "API key (default: $SATORIC_API_KEY)")
  .addHelpText(
    "after",
    `
Note: adding :~N (snippet) requires re-indexing documents for term vectors to take effect.

Examples:
  satoric index update -n my-docs --return "url,title:128,body:~256" --boost "1 - rank/1000000"
  satoric index update -n my-docs --return "url,title:128,body:-256"`
  )
  .action(
    async (options: {
      name?: string;
      apiKey?: string;
      config?: string;
      return?: string;
      boost?: string;
    }) => {
      const apiKey = requireApiKey(options);
      const name = requireName(options);
      let body: Record<string, unknown>;

      if (options.config) {
        try {
          const config = loadConfig(options.config);
          const meta = (config.mappings._meta ?? {}) as Record<string, unknown>;
          body = { meta };
        } catch (e) {
          process.stderr.write(`Error loading config: ${(e as Error).message}\n`);
          process.exit(1);
        }
      } else {
        try {
          const hints = buildUpdateHints(options);
          if (!hints) {
            process.stderr.write("Error: at least one option is required\n");
            process.exit(1);
          }
          body = { hints };
        } catch (e) {
          process.stderr.write(`Error: ${(e as Error).message}\n`);
          process.exit(1);
        }
      }

      try {
        await apiRequest(
          "PATCH",
          `${DEFAULT_BASE_URL}/indexes/${encodeURIComponent(name)}`,
          body,
          apiKey
        );
        process.stdout.write(`Index '${name}' updated.\n`);
      } catch (e) {
        process.stderr.write(`Error: ${(e as Error).message}\n`);
        process.exit(1);
      }
    }
  );

const deleteIndexCommand = new Command("delete")
  .description("Delete an index and all its documents")
  .option("-f, --force", "skip confirmation prompt")
  .option("-n, --name <name>", "index name (default: $SATORIC_INDEX)")
  .option("-k, --api-key <key>", "API key (default: $SATORIC_API_KEY)")
  .action(async (options: { name?: string; apiKey?: string; force?: boolean }) => {
    const apiKey = requireApiKey(options);
    const name = requireName(options);
    if (!options.force) {
      process.stderr.write(`This will permanently delete index '${name}' and all its documents.\n`);
      const ok = await confirm(name);
      if (!ok) {
        process.stderr.write("Aborted.\n");
        process.exit(0);
      }
    }
    try {
      await apiRequest(
        "DELETE",
        `${DEFAULT_BASE_URL}/indexes/${encodeURIComponent(name)}`,
        undefined,
        apiKey
      );
      process.stdout.write(`Index '${name}' deleted.\n`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        process.stderr.write(`Error: index '${name}' not found\n`);
      } else {
        process.stderr.write(`Error: ${(e as Error).message}\n`);
      }
      process.exit(1);
    }
  });

const docGroup = new Command("doc")
  .description("Manage documents within an index")
  .action((_opts, cmd: Command) => cmd.help())
  .addCommand(upsertCommand)
  .addCommand(makeSearchCommand())
  .addCommand(deleteCommand);

export const indexCommand = new Command("index")
  .description("Manage indexes")
  .action((_opts, cmd: Command) => cmd.help())
  .addCommand(docGroup)
  .addCommand(createCommand)
  .addCommand(listCommand)
  .addCommand(infoCommand)
  .addCommand(updateCommand)
  .addCommand(deleteIndexCommand);
