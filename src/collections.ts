import { readFileSync } from "fs";
import { createInterface } from "readline";
import { Command } from "commander";
import { load as parseYaml } from "js-yaml";
import { DEFAULT_BASE_URL } from "./constants.js";
import { apiRequest, ApiError } from "./client.js";
import { toPainless } from "./math.js";
import type { Collection, CollectionInfo } from "./types.js";

interface CollectionConfig {
  name?: string;
  mappings: Record<string, unknown>;
}

interface SnippetHint {
  field: string;
  size?: number;
  count?: number;
}

interface Hints {
  id?: string;
  search?: string[];
  filter?: string[];
  snippet?: SnippetHint;
  boost_script?: string;
}

function loadConfig(filePath: string): CollectionConfig {
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
  return parsed as CollectionConfig;
}

function parseSnippet(s: string): SnippetHint {
  const parts = s.split(":");
  return {
    field: parts[0],
    size: parts[1] ? parseInt(parts[1]) : undefined,
    count: parts[2] ? parseInt(parts[2]) : undefined,
  };
}

function parseFields(s: string): string[] {
  return s
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
}

function buildHints(options: {
  id?: string;
  search?: string;
  filter?: string;
  snippet?: string;
  boost?: string;
}): Hints | undefined {
  const hints: Hints = {};
  let hasHints = false;

  if (options.id) {
    hints.id = options.id;
    hasHints = true;
  }
  if (options.search) {
    hints.search = parseFields(options.search);
    hasHints = true;
  }
  if (options.filter) {
    hints.filter = parseFields(options.filter);
    hasHints = true;
  }
  if (options.snippet) {
    hints.snippet = parseSnippet(options.snippet);
    hasHints = true;
  }
  if (options.boost) {
    hints.boost_script = toPainless(options.boost);
    hasHints = true;
  }

  return hasHints ? hints : undefined;
}

function addHintOptions(cmd: Command): Command {
  return cmd
    .option("--id <field>", "field used as document ID")
    .option("-s, --search <fields>", "searchable text fields, e.g. title^2,body")
    .option("-f, --filter <fields>", "keyword fields for exact-match filtering, e.g. site,rank")
    .option("-n, --snippet <spec>", "snippet field and options, e.g. body:256:1")
    .option("-b, --boost <expr>", 'boost expression, e.g. "1 - rank/1000000"');
}

function addAuthOptions(cmd: Command): Command {
  return cmd
    .option("-c, --collection <name>", "collection name (default: $SATORIC_COLLECTION)")
    .option("-k, --api-key <key>", "API key (default: $SATORIC_API_KEY)");
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

function resolveCollection(options: { collection?: string }): string | undefined {
  return options.collection ?? process.env.SATORIC_COLLECTION;
}

function resolveApiKey(options: { apiKey?: string }): string | undefined {
  return options.apiKey ?? process.env.SATORIC_API_KEY;
}

function requireApiKey(options: { apiKey?: string }): string {
  const key = resolveApiKey(options);
  if (!key) {
    process.stderr.write("Error: -k/--api-key is required (or set SATORIC_API_KEY)\n");
    process.exit(1);
  }
  return key;
}

export const listCommand = new Command("list")
  .description("Print collection names")
  .option("-k, --api-key <key>", "API key (default: $SATORIC_API_KEY)")
  .action(async (options: { apiKey?: string }) => {
    const baseUrl = DEFAULT_BASE_URL;
    const apiKey = requireApiKey(options);
    try {
      const collections = await apiRequest<Collection[]>(
        "GET",
        `${baseUrl}/collections`,
        undefined,
        apiKey
      );
      if (collections.length === 0) {
        process.stdout.write("No collections.\n");
      } else {
        process.stdout.write(collections.map((c) => c.name).join("\n") + "\n");
      }
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });

export const infoCommand = addAuthOptions(
  new Command("info")
    .description("Show collection stats and optionally its schema")
    .option("-s, --schema", "also print full mappings")
).action(async (options: { collection?: string; apiKey?: string; schema?: boolean }) => {
  const baseUrl = DEFAULT_BASE_URL;
  const name = resolveCollection(options);
  if (!name) {
    process.stderr.write("Error: -c/--collection is required (or set SATORIC_COLLECTION)\n");
    process.exit(1);
  }
  const apiKey = requireApiKey(options);
  try {
    const info = await apiRequest<CollectionInfo>(
      "GET",
      `${baseUrl}/collections/${encodeURIComponent(name)}/info`,
      undefined,
      apiKey
    );
    const size =
      info.size_in_bytes > 1_000_000
        ? `${(info.size_in_bytes / 1_000_000).toFixed(1)} MB`
        : `${(info.size_in_bytes / 1_000).toFixed(1)} KB`;
    const properties = (info.mappings as Record<string, Record<string, unknown>>).properties ?? {};
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

export const createCommand = addHintOptions(
  addAuthOptions(
    new Command("create")
      .description("Create a collection")
      .option("-C, --config <file>", "path to JSON or YAML config file (advanced)")
      .addHelpText(
        "after",
        `
Examples:
  satoric create -c my-docs --id url --search title,body --filter site --snippet body:256
  satoric create -c my-docs --config my-docs.json`
      )
  )
).action(
  async (options: {
    collection?: string;
    apiKey?: string;
    config?: string;
    id?: string;
    search?: string;
    filter?: string;
    snippet?: string;
    boost?: string;
  }) => {
    const baseUrl = DEFAULT_BASE_URL;
    const name = resolveCollection(options);
    if (!name) {
      process.stderr.write("Error: -c/--collection is required (or set SATORIC_COLLECTION)\n");
      process.exit(1);
    }
    const apiKey = requireApiKey(options);
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
        const hints = buildHints(options);
        if (hints) body = { hints };
      } catch (e) {
        process.stderr.write(`Error: ${(e as Error).message}\n`);
        process.exit(1);
      }
    }

    try {
      await apiRequest("PUT", `${baseUrl}/collections/${encodeURIComponent(name)}`, body, apiKey);
      process.stdout.write(`Collection '${name}' created.\n`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        process.stderr.write(`Error: collection '${name}' already exists\n`);
      } else {
        process.stderr.write(`Error: ${(e as Error).message}\n`);
      }
      process.exit(1);
    }
  }
);

export const updateCommand = addHintOptions(
  addAuthOptions(
    new Command("update")
      .description("Update collection search configuration")
      .option("-C, --config <file>", "path to JSON or YAML config file (advanced)")
      .addHelpText(
        "after",
        `
Note: changing --snippet requires re-indexing documents for term vectors to take effect.

Examples:
  satoric update --search title^2,body --snippet body:256 --boost "1 - rank/1000000"
  satoric update -c my-docs --filter site,rank`
      )
  )
).action(
  async (options: {
    collection?: string;
    apiKey?: string;
    config?: string;
    id?: string;
    search?: string;
    filter?: string;
    snippet?: string;
    boost?: string;
  }) => {
    const baseUrl = DEFAULT_BASE_URL;
    const name = resolveCollection(options);
    if (!name) {
      process.stderr.write("Error: -c/--collection is required (or set SATORIC_COLLECTION)\n");
      process.exit(1);
    }
    const apiKey = requireApiKey(options);
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
        const hints = buildHints(options);
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
      await apiRequest("PATCH", `${baseUrl}/collections/${encodeURIComponent(name)}`, body, apiKey);
      process.stdout.write(`Collection '${name}' updated.\n`);
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

export const dropCommand = addAuthOptions(
  new Command("drop")
    .description("Delete a collection and all its documents")
    .option("-f, --force", "skip confirmation prompt")
).action(async (options: { collection?: string; apiKey?: string; force?: boolean }) => {
  const baseUrl = DEFAULT_BASE_URL;
  const name = resolveCollection(options);
  if (!name) {
    process.stderr.write("Error: -c/--collection is required (or set SATORIC_COLLECTION)\n");
    process.exit(1);
  }
  const apiKey = requireApiKey(options);
  if (!options.force) {
    process.stderr.write(
      `This will permanently delete collection '${name}' and all its documents.\n`
    );
    const ok = await confirm(name);
    if (!ok) {
      process.stderr.write("Aborted.\n");
      process.exit(0);
    }
  }
  try {
    await apiRequest(
      "DELETE",
      `${baseUrl}/collections/${encodeURIComponent(name)}`,
      undefined,
      apiKey
    );
    process.stdout.write(`Collection '${name}' deleted.\n`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      process.stderr.write(`Error: collection '${name}' not found\n`);
    } else {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
    }
    process.exit(1);
  }
});
