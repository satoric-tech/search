import { readFile } from "fs/promises";
import { DEFAULT_BASE_URL } from "./constants.js";
import { apiRequest, ApiError } from "./client.js";
import type { Document } from "./types.js";

async function readDocuments(filePath?: string): Promise<Document[]> {
  let content: string;
  if (filePath) {
    content = await readFile(filePath, "utf-8");
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    content = Buffer.concat(chunks).toString("utf-8");
  }
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as Document[];
  }
  return trimmed
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Document);
}

export async function runDocuments(argv: string[]): Promise<void> {
  const baseUrl = process.env["SATORIC_BASE_URL"] ?? DEFAULT_BASE_URL;
  const [sub, ...rest] = argv;

  if (!sub || sub === "--help" || sub === "-h") {
    process.stdout.write(
      "Usage: satoric documents <command> [options]\n\n" +
        "Commands:\n" +
        "  upsert <collection>    Insert or replace documents\n" +
        "  fetch <collection>     Fetch a document by id\n" +
        "  delete <collection>    Delete documents by id or query\n\n" +
        "Run satoric documents <command> --help for command options.\n"
    );
    return;
  }

  if (sub === "upsert") {
    let collection: string | undefined;
    let filePath: string | undefined;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "--help" || arg === "-h") {
        process.stdout.write(
          "Usage: satoric documents upsert <collection> [options]\n\n" +
            "Reads JSONL or a JSON array from --file or stdin. Each document must have an 'id' field.\n\n" +
            "Options:\n" +
            "  --file, -f <path>    Input file (JSONL or JSON array). Reads from stdin if omitted.\n\n" +
            "Examples:\n" +
            "  satoric documents upsert my-docs --file docs.jsonl\n" +
            "  cat docs.json | satoric documents upsert my-docs\n"
        );
        process.exit(0);
      } else if (arg === "--file" || arg === "-f") {
        filePath = rest[++i];
      } else if (!arg.startsWith("-")) {
        collection = arg;
      }
    }

    if (!collection) {
      process.stderr.write(
        "Error: collection name is required\nUsage: satoric documents upsert <collection>\n"
      );
      process.exit(1);
    }

    let documents: Document[];
    try {
      documents = await readDocuments(filePath);
    } catch (e) {
      process.stderr.write(`Error reading documents: ${(e as Error).message}\n`);
      process.exit(1);
    }

    if (documents.length === 0) {
      process.stderr.write("Error: no documents to upsert\n");
      process.exit(1);
    }

    try {
      const result = await apiRequest<{ upserted: number }>(
        "PUT",
        `${baseUrl}/collections/${encodeURIComponent(collection)}/documents/upsert`,
        { documents }
      );
      process.stdout.write(`Upserted ${result.upserted} document(s).\n`);
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
    return;
  }

  if (sub === "fetch") {
    let collection: string | undefined;
    let id: string | undefined;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "--help" || arg === "-h") {
        process.stdout.write(
          "Usage: satoric documents fetch <collection> --id <id>\n\n" +
            "Options:\n" +
            "  --id <id>    Document id to fetch\n"
        );
        process.exit(0);
      } else if (arg === "--id") {
        id = rest[++i];
      } else if (!arg.startsWith("-")) {
        collection = arg;
      }
    }

    if (!collection || !id) {
      process.stderr.write(
        "Error: collection and --id are required\nUsage: satoric documents fetch <collection> --id <id>\n"
      );
      process.exit(1);
    }

    try {
      const url = new URL(
        `${baseUrl}/collections/${encodeURIComponent(collection)}/documents/fetch`
      );
      url.searchParams.set("id", id);
      const doc = await apiRequest<Document>("GET", url.toString());
      process.stdout.write(JSON.stringify(doc, null, 2) + "\n");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        process.stderr.write("Error: document not found\n");
      } else {
        process.stderr.write(`Error: ${(e as Error).message}\n`);
      }
      process.exit(1);
    }
    return;
  }

  if (sub === "delete") {
    let collection: string | undefined;
    let id: string | undefined;
    let query: string | undefined;

    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg === "--help" || arg === "-h") {
        process.stdout.write(
          "Usage: satoric documents delete <collection> (--id <id> | --query <query>)\n\n" +
            "Options:\n" +
            "  --id <id>          Delete a document by id\n" +
            "  --query, -q <q>    Delete all documents matching a query\n\n" +
            "Examples:\n" +
            '  satoric documents delete my-docs --id "https://example.com/page"\n' +
            "  satoric documents delete my-docs --query 'site:\"example.com\"'\n"
        );
        process.exit(0);
      } else if (arg === "--id") {
        id = rest[++i];
      } else if (arg === "--query" || arg === "-q") {
        query = rest[++i];
      } else if (!arg.startsWith("-")) {
        collection = arg;
      }
    }

    if (!collection) {
      process.stderr.write(
        "Error: collection name is required\nUsage: satoric documents delete <collection>\n"
      );
      process.exit(1);
    }

    if (!id && !query) {
      process.stderr.write("Error: --id or --query is required\n");
      process.exit(1);
    }

    const body = id ? { id } : { query };

    try {
      await apiRequest(
        "POST",
        `${baseUrl}/collections/${encodeURIComponent(collection)}/documents/delete`,
        body
      );
      process.stdout.write("Deleted.\n");
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
    return;
  }

  process.stderr.write(`Unknown command: ${sub}\n\nRun satoric documents --help for usage.\n`);
  process.exit(1);
}
