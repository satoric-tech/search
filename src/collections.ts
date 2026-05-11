import { readFileSync } from "fs";
import { Command } from "commander";
import { load as parseYaml } from "js-yaml";
import { DEFAULT_BASE_URL } from "./constants.js";
import { apiRequest, ApiError } from "./client.js";
import type { Collection, FieldSpec } from "./types.js";

function parseFieldSpec(spec: string): FieldSpec {
  const parts = spec.split(":");
  const name = parts[0]?.trim();
  const type = parts[1]?.trim();

  if (!name || !type) {
    throw new Error(
      `Invalid field spec: "${spec}"\nFormat: name:type[:tokenizer][:options]\nOptions: snippet, fast, nostore, nosearch`
    );
  }

  const fieldSpec: FieldSpec = { name, type };

  for (const part of parts.slice(2)) {
    const p = part.trim();
    if (p === "snippet") fieldSpec.snippet = true;
    else if (p === "fast") fieldSpec.fast = true;
    else if (p === "nostore") fieldSpec.stored = false;
    else if (p === "nosearch") fieldSpec.searchable = false;
    else fieldSpec.tokenizer = p;
  }

  return fieldSpec;
}

function loadConfig(filePath: string): { name?: string; fields: FieldSpec[] } {
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
    !Array.isArray((parsed as Record<string, unknown>).fields)
  ) {
    throw new Error(`Config must have a "fields" array`);
  }
  return parsed as { name?: string; fields: FieldSpec[] };
}

export const collectionsCommand = new Command("collections").description("Manage collections");

collectionsCommand
  .command("list")
  .description("Print collection names")
  .action(async () => {
    const baseUrl = DEFAULT_BASE_URL;
    try {
      const collections = await apiRequest<Collection[]>("GET", `${baseUrl}/collections`);
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

collectionsCommand
  .command("info <name>")
  .description("Show doc count, size, created, and fields")
  .action(async (name: string) => {
    const baseUrl = DEFAULT_BASE_URL;
    try {
      const info = await apiRequest<{
        name: string;
        num_docs: number;
        size_in_bytes: number;
        created_at: number;
        fields: { name: string }[];
      }>("GET", `${baseUrl}/collections/${encodeURIComponent(name)}/info`);
      const size =
        info.size_in_bytes > 1_000_000
          ? `${(info.size_in_bytes / 1_000_000).toFixed(1)} MB`
          : `${(info.size_in_bytes / 1_000).toFixed(1)} KB`;
      process.stdout.write(
        `name:       ${info.name}\n` +
          `docs:       ${info.num_docs.toLocaleString()}\n` +
          `size:       ${size}\n` +
          `created:    ${new Date(info.created_at * 1000).toISOString()}\n` +
          `fields:     id, indexed_at, ${info.fields.map((f) => f.name).join(", ")}\n`
      );
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });

collectionsCommand
  .command("schema <name>")
  .description("Show full schema as JSON")
  .action(async (name: string) => {
    const baseUrl = DEFAULT_BASE_URL;
    try {
      const collection = await apiRequest<Collection>(
        "GET",
        `${baseUrl}/collections/${encodeURIComponent(name)}`
      );
      process.stdout.write(JSON.stringify(collection, null, 2) + "\n");
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });

collectionsCommand
  .command("create [name]")
  .description("Create a collection")
  .option("-C, --config <file>", "load fields from a JSON or YAML file")
  .option(
    "-f, --field <spec>",
    "add a field: name:type[:tokenizer][:options] (repeatable)",
    (v: string, acc: string[]) => [...acc, v],
    [] as string[]
  )
  .addHelpText(
    "after",
    `
Types:      text, integer
Tokenizers: default, en_stem, raw
Options:    snippet, fast, nostore, nosearch

Examples:
  satoric collections create --config llms-txt.json
  satoric collections create docs \\
    --field title:text:en_stem \\
    --field content:text:en_stem:snippet \\
    --field site:text:raw`
  )
  .action(async (nameArg: string | undefined, options: { config?: string; field: string[] }) => {
    const baseUrl = DEFAULT_BASE_URL;
    const fields: FieldSpec[] = [];
    let name = nameArg;

    if (options.config) {
      try {
        const config = loadConfig(options.config);
        if (config.name) name ??= config.name;
        fields.push(...config.fields);
      } catch (e) {
        process.stderr.write(`Error loading config: ${(e as Error).message}\n`);
        process.exit(1);
      }
    }

    for (const spec of options.field) {
      try {
        fields.push(parseFieldSpec(spec));
      } catch (e) {
        process.stderr.write(`Error: ${(e as Error).message}\n`);
        process.exit(1);
      }
    }

    if (!name) {
      process.stderr.write("Error: collection name is required\n");
      process.exit(1);
    }

    try {
      await apiRequest("PUT", `${baseUrl}/collections/${encodeURIComponent(name)}`, { fields });
      process.stdout.write(`Collection '${name}' created.\n`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        process.stderr.write(`Error: collection '${name}' already exists\n`);
      } else {
        process.stderr.write(`Error: ${(e as Error).message}\n`);
      }
      process.exit(1);
    }
  });

collectionsCommand
  .command("delete <name>")
  .description("Delete a collection")
  .action(async (name: string) => {
    const baseUrl = DEFAULT_BASE_URL;
    try {
      await apiRequest("DELETE", `${baseUrl}/collections/${encodeURIComponent(name)}`);
      process.stdout.write(`Collection '${name}' deleted.\n`);
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });
