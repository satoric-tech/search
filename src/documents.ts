import { createReadStream } from "fs";
import { createInterface } from "readline";
import { Command } from "commander";
import ora from "ora";
import { DEFAULT_BASE_URL } from "./constants.js";
import { apiRequest, ApiError } from "./client.js";
import { version } from "./version.js";
import type { Collection, Document } from "./types.js";

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

export const documentsCommand = new Command("documents").alias("docs").description("Manage documents");

const BATCH_BYTES = 5 * 1024 * 1024;
const SPINNER = {
  interval: 80,
  frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"].map(
    (f) => `\x1b[38;2;178;34;34m${f}\x1b[0m`
  ),
};

documentsCommand
  .command("upsert <collection>")
  .description("Insert or replace documents from NDJSON or JSON array")
  .option("-f, --file <path>", "input file (reads from stdin if omitted)")
  .option("--clean", "delete all existing documents before upserting")
  .addHelpText(
    "after",
    `
Examples:
  python index.py crawl | satoric docs upsert llms-txt
  satoric docs upsert my-docs --file docs.ndjson --clean
  python index.py crawl | satoric docs upsert llms-txt --clean`
  )
  .action(async (collection: string, options: { file?: string; clean?: boolean }) => {
    const baseUrl = DEFAULT_BASE_URL;
    const url = `${baseUrl}/collections/${encodeURIComponent(collection)}/documents/upsert`;
    const apiKey = process.env.SATORIC_API_KEY;

    if (options.clean) {
      const spinner = ora({ stream: process.stderr, spinner: SPINNER }).start("fetching schema…");
      try {
        const col = await apiRequest<Collection>(
          "GET",
          `${baseUrl}/collections/${encodeURIComponent(collection)}`
        );
        spinner.text = "dropping collection…";
        await apiRequest("DELETE", `${baseUrl}/collections/${encodeURIComponent(collection)}`);
        spinner.text = "recreating collection…";
        await apiRequest("PUT", `${baseUrl}/collections/${encodeURIComponent(collection)}`, { mappings: col.mappings });
        spinner.succeed("collection reset");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          spinner.info("collection does not exist, skipping reset");
        } else {
          spinner.fail(`Error: ${(e as Error).message}`);
          process.exit(1);
        }
      }
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

    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        for await (const doc of streamDocuments(options.file)) {
          const line = JSON.stringify(doc) + "\n";
          if (line.length > 1024 * 1024) { skipped++; continue; }
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
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: readable,
        // @ts-ignore duplex required for streaming request bodies in Node
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
