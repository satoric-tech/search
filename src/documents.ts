import { createReadStream } from "fs";
import { createInterface } from "readline";
import { Command } from "commander";
import ora from "ora";
import { DEFAULT_BASE_URL, DEFAULT_INGEST_URL } from "./constants.js";
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
    if (isArray === undefined) isArray = trimmed.startsWith("[");
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
  .option("-f, --file <path>", "input file (reads from stdin if omitted)")
  .option("-n, --name <name>", "index name (default: $SATORIC_INDEX)")
  .option("-k, --api-key <key>", "API key (default: $SATORIC_API_KEY)")
  .addHelpText(
    "after",
    `
Examples:
  python index.py | satoric index doc upsert
  python index.py | satoric index doc upsert -n llms-txt
  satoric index doc upsert -n my-docs --file docs.ndjson`
  )
  .action(async (options: { name?: string; apiKey?: string; file?: string }) => {
    const index = options.name ?? process.env.SATORIC_INDEX;
    if (!index) {
      process.stderr.write("Error: -n/--name is required (or set SATORIC_INDEX)\n");
      process.exit(1);
    }
    const apiKey = requireApiKey(options);

    try {
      await apiRequest("GET", `${DEFAULT_BASE_URL}/indexes/${encodeURIComponent(index)}`, undefined, apiKey);
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }

    const start = Date.now();
    let docs = 0;
    let skipped = 0;
    let streamEnd: number | null = null;

    const elapsed = (from = start) => {
      const s = Math.floor((Date.now() - from) / 1000);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };

    const spinner = ora({ stream: process.stderr, spinner: SPINNER }).start();

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
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
      const url = `${DEFAULT_INGEST_URL}/indexes/${encodeURIComponent(index)}/documents/upsert`;
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/x-ndjson",
          "User-Agent": `satoric/${version}`,
          Authorization: `Bearer ${apiKey}`,
        },
        body: readable,
        duplex: "half",
      } as RequestInit);

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
  .option("--id <id>", "delete a document by id")
  .option("-q, --query <query>", "delete all documents matching a query")
  .option("-n, --name <name>", "index name (default: $SATORIC_INDEX)")
  .option("-k, --api-key <key>", "API key (default: $SATORIC_API_KEY)")
  .addHelpText(
    "after",
    `
Examples:
  satoric index doc delete --id "https://example.com/page"
  satoric index doc delete -n my-docs --query 'site:example.com'`
  )
  .action(async (options: { name?: string; apiKey?: string; id?: string; query?: string }) => {
    const index = options.name ?? process.env.SATORIC_INDEX;
    if (!index) {
      process.stderr.write("Error: -n/--name is required (or set SATORIC_INDEX)\n");
      process.exit(1);
    }
    const apiKey = requireApiKey(options);
    if (!options.id && !options.query) {
      process.stderr.write("Error: --id or --query is required\n");
      process.exit(1);
    }
    const body = options.id ? { id: options.id } : { query: options.query };
    try {
      await apiRequest(
        "POST",
        `${DEFAULT_BASE_URL}/indexes/${encodeURIComponent(index)}/documents/delete`,
        body,
        apiKey
      );
      process.stdout.write("Deleted.\n");
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });
