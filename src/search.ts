import { Command } from "commander";
import { version } from "./version.js";
import {
  DEFAULT_BASE_URL,
  DEFAULT_COLLECTION,
  DEFAULT_LIMIT,
  DEFAULT_SNIPPETS,
  DEFAULT_SNIPPET_SIZE,
} from "./constants.js";

export const searchCommand = new Command("search")
  .description("Search a collection")
  .argument("<query...>", "search query (Lucene syntax supported)")
  .option("-c, --collection <name>", "collection to search", DEFAULT_COLLECTION)
  .option("-l, --limit <n>", "max results", String(DEFAULT_LIMIT))
  .option("-o, --offset <n>", "results to skip", "0")
  .option(
    "-s, --snippets <n>",
    "snippets per snippet field (0 to disable)",
    String(DEFAULT_SNIPPETS)
  )
  .option("-S, --snippet-size <n>", "characters per snippet", String(DEFAULT_SNIPPET_SIZE))
  .action(async (queryParts: string[], options: Record<string, string>) => {
    const baseUrl = DEFAULT_BASE_URL;
    const query = queryParts.join(" ").trim();
    const url = new URL(
      `${baseUrl}/collections/${encodeURIComponent(options["collection"]!)}/search`
    );
    url.searchParams.set("q", query);
    url.searchParams.set("limit", options["limit"]!);
    url.searchParams.set("snippets", options["snippets"]!);
    if (parseInt(options["offset"]!, 10) > 0) url.searchParams.set("offset", options["offset"]!);
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
