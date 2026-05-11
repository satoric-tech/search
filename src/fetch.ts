import { Command } from "commander";
import { version } from "./version.js";
import { DEFAULT_BASE_URL } from "./constants.js";

export const fetchCommand = new Command("fetch")
  .description("Fetch passages from a URL matching a query")
  .argument("<url>", "page URL to fetch")
  .argument("<query...>", "search terms to match within the page")
  .option("-l, --limit <n>", "max passages", "5")
  .action(async (pageUrl: string, queryParts: string[], options: { limit: string }) => {
    const baseUrl = DEFAULT_BASE_URL;
    const query = queryParts.join(" ").trim();
    const url = new URL(`${baseUrl}/fetch`);
    url.searchParams.set("url", pageUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", options.limit);

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
      process.stdout.write(JSON.stringify(raw["results"], null, 2) + "\n");
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });
