import { Command } from "commander";
import { version } from "./version.js";
import {
  DEFAULT_BASE_URL,
  DEFAULT_LIMIT,
  DEFAULT_SNIPPETS,
  DEFAULT_SNIPPET_SIZE,
} from "./constants.js";

export const searchCommand = new Command("search")
  .description("Search a collection")
  .argument("<query...>", "search query (Lucene syntax supported)")
  .option("-c, --collection <name>", "collection name (default: $SATORIC_COLLECTION)")
  .option("-l, --limit <number>", "max results", String(DEFAULT_LIMIT))
  .option("-p, --page <number>", "page number (1-indexed)", "1")
  .option(
    "-n, --snippets <number>",
    "snippets per snippet field (0 to disable)",
    String(DEFAULT_SNIPPETS)
  )
  .option("-N, --snippet-size <number>", "characters per snippet", String(DEFAULT_SNIPPET_SIZE))
  .addHelpText(
    "after",
    `
Examples:
  satoric search "openai docs"
  satoric search "site:vercel.com deployment" --limit 20
  satoric search -c llms-txt "openai docs"`
  )
  .action(async (queryParts: string[], options: Record<string, string>) => {
    const baseUrl = DEFAULT_BASE_URL;
    const collection = options["collection"] ?? process.env.SATORIC_COLLECTION;
    if (!collection) {
      process.stderr.write("Error: -c/--collection is required (or set SATORIC_COLLECTION)\n");
      process.exit(1);
    }
    const query = queryParts.join(" ").trim();
    const url = new URL(`${baseUrl}/collections/${encodeURIComponent(collection)}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", options["limit"]!);
    url.searchParams.set("snippets", options["snippets"]!);
    const page = Math.max(1, parseInt(options["page"]!, 10));
    const offset = (page - 1) * parseInt(options["limit"]!, 10);
    if (offset > 0) url.searchParams.set("offset", String(offset));
    if (options["snippetSize"] !== String(DEFAULT_SNIPPET_SIZE))
      url.searchParams.set("snippet_size", options["snippetSize"]!);

    try {
      const res = await fetch(url.toString(), {
        headers: { "User-Agent": `satoric-cli/${version}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        process.stderr.write(`Error: ${body?.error ?? `HTTP ${res.status}`}\n`);
        process.exit(1);
      }
      const raw = (await res.json()) as Record<string, unknown>;
      if (!raw || !Array.isArray(raw["results"])) {
        process.stderr.write("Error: unexpected response format from server\n");
        process.exit(1);
      }
      process.stdout.write(JSON.stringify(raw, null, 2) + "\n");
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });
