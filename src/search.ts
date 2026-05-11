import { version } from "./version.js";
import { DEFAULT_BASE_URL, DEFAULT_COLLECTION, DEFAULT_LIMIT } from "./constants.js";
import type { SearchResult } from "./types.js";

export async function runSearch(argv: string[]): Promise<void> {
  const positional: string[] = [];
  let limit = DEFAULT_LIMIT;
  let offset = 0;
  let collection = process.env["SATORIC_COLLECTION"] ?? DEFAULT_COLLECTION;
  const baseUrl = process.env["SATORIC_BASE_URL"] ?? DEFAULT_BASE_URL;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: satoric search <query> [options]\n\n" +
          "Query syntax:\n" +
          "  <query>              Search across title and content\n" +
          "  site:<domain>        Scope to a domain  e.g. site:stripe.com\n" +
          "  title:<term>         Match page title   e.g. title:authentication\n" +
          "  content:<term>       Match page body    e.g. content:webhook\n" +
          '  "phrase"             Exact phrase match e.g. "webhook signature"\n' +
          "  +term -term          Require / exclude terms\n\n" +
          "Options:\n" +
          "  --collection, -c <name>  Collection to search (default: $SATORIC_COLLECTION or web)\n" +
          "  --limit,  -l <n>         Max results (default: 10)\n" +
          "  --offset, -o <n>         Results to skip, for pagination (default: 0)\n" +
          "  --help,  -h              Show this help\n"
      );
      process.exit(0);
    } else if (arg === "--collection" || arg === "-c") {
      collection = argv[++i] ?? collection;
    } else if (arg === "--limit" || arg === "-l") {
      limit = parseInt(argv[++i] ?? "10", 10);
    } else if (arg === "--offset" || arg === "-o") {
      offset = parseInt(argv[++i] ?? "0", 10);
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  const query = positional.join(" ").trim();
  if (!query) {
    process.stderr.write("Error: query is required\nUsage: satoric search <query>\n");
    process.exit(1);
  }

  const url = new URL(`${baseUrl}/collections/${encodeURIComponent(collection)}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  if (offset > 0) url.searchParams.set("offset", String(offset));

  let data: { results: SearchResult[]; total: number };
  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": `satoric-cli/${version}` },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      const msg = body?.error ?? `HTTP ${res.status}`;
      process.stderr.write(`Error: ${msg}\n`);
      process.exit(1);
    }
    const raw = (await res.json()) as Record<string, unknown>;
    if (!raw || !Array.isArray(raw.results)) {
      process.stderr.write("Error: unexpected response format from server\n");
      process.exit(1);
    }
    data = raw as { results: SearchResult[]; total: number };
  } catch (e) {
    process.stderr.write(`Error: ${(e as Error).message}\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(data.results, null, 2) + "\n");
}
