import { DEFAULT_BASE_URL } from "./constants.js";
import { apiRequest, ApiError } from "./client.js";
import type { Collection, FieldSpec, FieldType, Tokenizer } from "./types.js";

function parseFieldSpec(spec: string): FieldSpec {
  const parts = spec.split(":");
  const name = parts[0]?.trim();
  const type = parts[1]?.trim() as FieldType;

  if (!name || !type || !["text", "integer"].includes(type)) {
    throw new Error(
      `Invalid field spec: "${spec}"\nFormat: name:type[:tokenizer][:options]\nTypes: text, integer\nTokenizers: default, en_stem, raw\nOptions: snippet, fast, nostore, nosearch`
    );
  }

  const fieldSpec: FieldSpec = { name, type };

  for (const part of parts.slice(2)) {
    const p = part.trim();
    if (p === "snippet") fieldSpec.snippet = true;
    else if (p === "fast") fieldSpec.fast = true;
    else if (p === "nostore") fieldSpec.stored = false;
    else if (p === "nosearch") fieldSpec.searchable = false;
    else if (["default", "en_stem", "raw"].includes(p)) fieldSpec.tokenizer = p as Tokenizer;
    else throw new Error(`Unknown field option: "${p}" in "${spec}"`);
  }

  return fieldSpec;
}

export async function runCollections(argv: string[]): Promise<void> {
  const baseUrl = process.env["SATORIC_BASE_URL"] ?? DEFAULT_BASE_URL;
  const [sub, ...rest] = argv;

  if (!sub || sub === "--help" || sub === "-h") {
    process.stdout.write(
      "Usage: satoric collections <command> [options]\n\n" +
        "Commands:\n" +
        "  list                   List all collections\n" +
        "  create <name>          Create a collection\n" +
        "  describe <name>        Show a collection's schema\n" +
        "  delete <name>          Delete a collection\n\n" +
        "Run satoric collections <command> --help for command options.\n"
    );
    return;
  }

  if (sub === "list") {
    try {
      const collections = await apiRequest<Collection[]>("GET", `${baseUrl}/collections`);
      process.stdout.write(JSON.stringify(collections, null, 2) + "\n");
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
    return;
  }

  if (sub === "describe") {
    const [name] = rest;
    if (!name || name === "--help" || name === "-h") {
      process.stdout.write("Usage: satoric collections describe <name>\n");
      if (!name) process.exit(1);
      return;
    }
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
    return;
  }

  if (sub === "create") {
    const fields: FieldSpec[] = [];
    let name: string | undefined;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "--help" || arg === "-h") {
        process.stdout.write(
          "Usage: satoric collections create <name> [options]\n\n" +
            "Options:\n" +
            "  --field, -f <spec>    Add a field. Format: name:type[:tokenizer][:options]\n" +
            "                        Types: text, integer\n" +
            "                        Tokenizers: default, en_stem, raw\n" +
            "                        Options: snippet, fast, nostore, nosearch\n\n" +
            "Examples:\n" +
            "  satoric collections create docs \\\n" +
            "    --field title:text:en_stem:snippet \\\n" +
            "    --field content:text:en_stem:snippet \\\n" +
            "    --field site:text:raw\n" +
            "  satoric collections create metrics --field name:text:raw --field value:integer:fast\n"
        );
        process.exit(0);
      } else if (arg === "--field" || arg === "-f") {
        const spec = rest[++i];
        if (!spec) {
          process.stderr.write("Error: --field requires a value\n");
          process.exit(1);
        }
        try {
          fields.push(parseFieldSpec(spec));
        } catch (e) {
          process.stderr.write(`Error: ${(e as Error).message}\n`);
          process.exit(1);
        }
      } else if (!arg.startsWith("-")) {
        name = arg;
      }
    }

    if (!name) {
      process.stderr.write(
        "Error: collection name is required\nUsage: satoric collections create <name>\n"
      );
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
    return;
  }

  if (sub === "delete") {
    const [name] = rest;
    if (!name || name === "--help" || name === "-h") {
      process.stdout.write("Usage: satoric collections delete <name>\n");
      if (!name) process.exit(1);
      return;
    }
    try {
      await apiRequest("DELETE", `${baseUrl}/collections/${encodeURIComponent(name)}`);
      process.stdout.write(`Collection '${name}' deleted.\n`);
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
    return;
  }

  process.stderr.write(`Unknown command: ${sub}\n\nRun satoric collections --help for usage.\n`);
  process.exit(1);
}
