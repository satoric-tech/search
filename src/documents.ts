import { createReadStream } from "fs";
import { createInterface } from "readline";
import { Command } from "commander";
import ora from "ora";
import { DEFAULT_BASE_URL } from "./constants.js";
import { apiRequest } from "./client.js";
import { version } from "./version.js";
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

const SPINNER = {
  interval: 80,
  frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"].map(
    (f) => `\x1b[38;2;178;34;34m${f}\x1b[0m`
  ),
};

function requireApiKey(options: { apiKey?: string }): string {
  const key = options.apiKey ?? process.env.SATORIC_API_KEY;
  if (!key) {
    process.stderr.write("Error: -k/--api-key is required (or set SATORIC_API_KEY)\n");
    process.exit(1);
  }
  return key;
}

export const upsertCommand = new Command("upsert")
  .description("Insert or replace documents from NDJSON or JSON array")
  .option("-c, --collection <name>", "collection name (default: $SATORIC_COLLECTION)")
  .option("-k, --api-key <key>", "API key (default: $SATORIC_API_KEY)")
  .option("-f, --file <path>", "input file (reads from stdin if omitted)")
  .addHelpText(
    "after",
    `
Examples:
  python index.py | satoric upsert
  python index.py | satoric upsert -c llms-txt
  satoric upsert -c my-docs --file docs.ndjson`
  )
  .action(async (options: { collection?: string; apiKey?: string; file?: string }) => {
    const collection = options.collection ?? process.env.SATORIC_COLLECTION;
    if (!collection) {
      process.stderr.write("Error: -c/--collection is required (or set SATORIC_COLLECTION)\n");
      process.exit(1);
    }
    const apiKey = requireApiKey(options);
    const baseUrl = DEFAULT_BASE_URL;
    const url = `${baseUrl}/collections/${encodeURIComponent(collection)}/documents/upsert`;

    const start = Date.now();
    let docs = 0;
    let skipped = 0;
    let streamEnd: number | null = null;

    const elapsed = (from = start) => {
      const s = Math.floor((Date.now() - from) / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };

    const spinner = ora({ stream: process.stderr, spinner: SPINNER }).start();

    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        for await (const doc of streamDocuments(options.file)) {
          const line = JSON.stringify(doc) + "\n";
          if (line.length > 1024 * 1024) {
            skipped++;
            continue;
          }
          docs++;
          await writer.write(encoder.encode(line));
          const rate = Math.round(docs / Math.max((Date.now() - start) / 1000, 0.001));
          spinner.text = `${docs.toLocaleString()} docs  ${skipped} skipped  ${rate.toLocaleString()} docs/s  [${elapsed()}]`;
        }
        streamEnd = Date.now();
        spinner.text = `indexing ${docs.toLocaleString()} docs…`;
        await writer.close();
      } catch (e) {
        await writer.abort(e);
      }
    })();

    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/x-ndjson",
          "User-Agent": `satoric/${version}`,
          Authorization: `Bearer ${apiKey}`,
        },
        body: readable,
        duplex: "half",
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        spinner.fail(`Error: ${err?.error ?? `HTTP ${res.status}`}`);
        process.exit(1);
      }

      const result = (await res.json()) as { upserted: number; failed: number };
      const streamSecs = Math.max((streamEnd! - start) / 1000, 0.001);
      const rate = Math.round(result.upserted / streamSecs);
      spinner.succeed(
        `${result.upserted.toLocaleString()} indexed  ` +
          `${result.failed + skipped} skipped  ` +
          `${rate.toLocaleString()} docs/s  ` +
          `[${elapsed()}]`
      );
    } catch (e) {
      spinner.fail(`Error: ${(e as Error).message}`);
      process.exit(1);
    }
  });

export const deleteCommand = new Command("delete")
  .description("Delete documents by id or query")
  .option("-c, --collection <name>", "collection name (default: $SATORIC_COLLECTION)")
  .option("-k, --api-key <key>", "API key (default: $SATORIC_API_KEY)")
  .option("--id <id>", "delete a document by id")
  .option("-q, --query <query>", "delete all documents matching a query")
  .addHelpText(
    "after",
    `
Examples:
  satoric delete --id "https://example.com/page"
  satoric delete -c my-docs --query 'site:example.com'`
  )
  .action(
    async (options: { collection?: string; apiKey?: string; id?: string; query?: string }) => {
      const collection = options.collection ?? process.env.SATORIC_COLLECTION;
      if (!collection) {
        process.stderr.write("Error: -c/--collection is required (or set SATORIC_COLLECTION)\n");
        process.exit(1);
      }
      const apiKey = requireApiKey(options);
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
          body,
          apiKey
        );
        process.stdout.write("Deleted.\n");
      } catch (e) {
        process.stderr.write(`Error: ${(e as Error).message}\n`);
        process.exit(1);
      }
    }
  );
