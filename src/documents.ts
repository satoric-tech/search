import { createReadStream } from "fs";
import { createInterface } from "readline";
import { Command } from "commander";
import { DEFAULT_BASE_URL } from "./constants.js";
import { apiRequest, ApiError } from "./client.js";
import type { Document } from "./types.js";

async function* streamDocuments(filePath?: string): AsyncGenerator<Document> {
  const input = filePath ? createReadStream(filePath) : process.stdin;
  const rl = createInterface({ input, crlfDelay: Infinity });
  const lines: string[] = [];
  let isArray: boolean | undefined;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (isArray === undefined) {
      isArray = trimmed.startsWith("[");
    }

    if (isArray) {
      lines.push(line);
    } else {
      yield JSON.parse(trimmed) as Document;
    }
  }

  if (isArray && lines.length > 0) {
    const docs = JSON.parse(lines.join("\n")) as Document[];
    for (const doc of docs) yield doc;
  }
}

const MAX_BATCH_BYTES = 8 * 1024 * 1024;

export const documentsCommand = new Command("documents").description("Manage documents");

documentsCommand
  .command("upsert <collection>")
  .description("Insert or replace documents from NDJSON or JSON array")
  .option("-f, --file <path>", "input file (reads from stdin if omitted)")
  .addHelpText(
    "after",
    `
Examples:
  python index.py crawl | satoric documents upsert llms-txt
  satoric documents upsert my-docs --file docs.jsonl`
  )
  .action(async (collection: string, options: { file?: string }) => {
    const baseUrl = DEFAULT_BASE_URL;
    const url = `${baseUrl}/collections/${encodeURIComponent(collection)}/documents/upsert`;
    let batch: Document[] = [];
    let batchBytes = 0;
    let total = 0;
    let batches = 0;

    const flush = async () => {
      if (batch.length === 0) return;
      await apiRequest<{ upserted: number }>("PUT", url, { documents: batch });
      total += batch.length;
      batches++;
      process.stderr.write(`\rupserted ${total.toLocaleString()} docs (${batches} batches)`);
      batch = [];
      batchBytes = 0;
    };

    try {
      for await (const doc of streamDocuments(options.file)) {
        const docBytes = Buffer.byteLength(JSON.stringify(doc));
        if (docBytes > MAX_BATCH_BYTES) {
          process.stderr.write(
            `\nwarn: skipping "${doc.id}" (${(docBytes / 1024 / 1024).toFixed(1)}MB exceeds limit)\n`
          );
          continue;
        }
        if (batch.length > 0 && batchBytes + docBytes > MAX_BATCH_BYTES) await flush();
        batch.push(doc);
        batchBytes += docBytes;
      }
      await flush();
    } catch (e) {
      process.stderr.write(`\nError: ${(e as Error).message}\n`);
      process.exit(1);
    }

    if (total === 0) {
      process.stderr.write("Error: no documents to upsert\n");
      process.exit(1);
    }

    process.stderr.write(`\nDone. ${total.toLocaleString()} documents upserted.\n`);
  });

documentsCommand
  .command("fetch <collection>")
  .description("Fetch a document by id")
  .requiredOption("--id <id>", "document id")
  .action(async (collection: string, options: { id: string }) => {
    const baseUrl = DEFAULT_BASE_URL;
    try {
      const url = new URL(
        `${baseUrl}/collections/${encodeURIComponent(collection)}/documents/fetch`
      );
      url.searchParams.set("id", options.id);
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
  });

documentsCommand
  .command("delete <collection>")
  .description("Delete documents by id or query")
  .option("--id <id>", "delete a document by id")
  .option("-q, --query <query>", "delete all documents matching a query")
  .addHelpText(
    "after",
    `
Examples:
  satoric documents delete my-docs --id "https://example.com/page"
  satoric documents delete my-docs --query 'site:"example.com"'`
  )
  .action(async (collection: string, options: { id?: string; query?: string }) => {
    const baseUrl = DEFAULT_BASE_URL;
    if (!options.id && !options.query) {
      process.stderr.write("Error: --id or --query is required\n");
      process.exit(1);
    }
    const body = options.id ? { id: options.id } : { query: options.query };
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
  });
