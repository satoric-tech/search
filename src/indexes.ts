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

interface SnippetHint {
  field: string;
  size?: number;
}

interface ReturnField {
  field: string;
  max_len?: number;
}

interface Hints {
  id?: string;
  language?: string;
  snippet?: SnippetHint[];
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

function parseSnippetParam(s: string): SnippetHint[] {
  return s
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [field, sizeStr] = part.split(":");
      const size = sizeStr ? parseInt(sizeStr) : undefined;
      return { field: field.trim(), ...(size !== undefined ? { size } : {}) };
    });
}

function parseReturnParam(s: string): ReturnField[] {
  return s
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [field, maxLenStr] = part.split(":");
      const max_len = maxLenStr ? parseInt(maxLenStr) : undefined;
      return { field: field.trim(), ...(max_len !== undefined ? { max_len } : {}) };
    });
}

function buildCreateHints(options: {
  id?: string;
  language?: string;
  snippet?: string;
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
  if (options.snippet) {
    hints.snippet = parseSnippetParam(options.snippet);
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

function buildUpdateHints(options: {
  snippet?: string;
  return?: string;
  boost?: string;
}): Hints | undefined {
  const hints: Hints = {};
  let hasHints = false;

  if (options.snippet) {
    hints.snippet = parseSnippetParam(options.snippet);
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
  .option("--snippet <spec>", "snippet fields, e.g. body:256,title:128")
  .option("--return <spec>", "return fields, e.g. url,title,description:128")
  .option("-b, --boost <expr>", 'boost expression, e.g. "1 - rank/1000000"')
  .option("-C, --config <file>", "path to JSON or YAML config file (advanced)")
  .option("-n, --name <name>", "index name (default: $SATORIC_INDEX)")
  .option("-k, --api-key <key>", "API key (default: $SATORIC_API_KEY)")
  .addHelpText(
    "after",
    `
Examples:
  satoric index create -n my-docs --id url --language english --snippet body:256,title:128
  satoric index create -n my-docs --config my-docs.json`
  )
  .action(
    async (options: {
      name?: string;
      apiKey?: string;
      config?: string;
      id?: string;
      language?: string;
      snippet?: string;
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
  .option("--snippet <spec>", "snippet fields, e.g. body:256,title:128")
  .option("--return <spec>", "return fields, e.g. url,title,description:128")
  .option("-b, --boost <expr>", 'boost expression, e.g. "1 - rank/1000000"')
  .option("-C, --config <file>", "path to JSON or YAML config file (advanced)")
  .option("-n, --name <name>", "index name (default: $SATORIC_INDEX)")
  .option("-k, --api-key <key>", "API key (default: $SATORIC_API_KEY)")
  .addHelpText(
    "after",
    `
Note: changing --snippet requires re-indexing documents for term vectors to take effect.

Examples:
  satoric index update -n my-docs --snippet body:256,title:128 --boost "1 - rank/1000000"
  satoric index update -n my-docs --return url,title,description:128`
  )
  .action(
    async (options: {
      name?: string;
      apiKey?: string;
      config?: string;
      snippet?: string;
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
        if (options.snippet) {
          process.stderr.write(
            `Note: snippet field changed — re-index documents for term vectors to take effect.\n`
          );
        }
      } catch (e) {
        process.stderr.write(`Error: ${(e as Error).message}\n`);
        process.exit(1);
      }
    }
  );

const dropCommand = new Command("drop")
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
  .addCommand(deleteCommand)
  .addCommand(makeSearchCommand());

export const indexCommand = new Command("index")
  .description("Manage indexes")
  .action((_opts, cmd: Command) => cmd.help())
  .addCommand(listCommand)
  .addCommand(createCommand)
  .addCommand(updateCommand)
  .addCommand(infoCommand)
  .addCommand(dropCommand)
  .addCommand(docGroup);
