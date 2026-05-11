import { version } from "./version.js";
import { DEFAULT_BASE_URL } from "./constants.js";

const FETCH_DEFAULT_LIMIT = 5;

export async function runFetch(argv: string[]): Promise<void> {
  const positional: string[] = [];
  let limit = FETCH_DEFAULT_LIMIT;
  const baseUrl = process.env["SATORIC_BASE_URL"] ?? DEFAULT_BASE_URL;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: satoric fetch <url> <query> [options]\n\n" +
          "Fetches a URL, splits it into passages, and returns the most relevant ones.\n\n" +
          "Arguments:\n" +
          "  <url>            The page URL to fetch\n" +
          "  <query>          Search terms to match within the page\n\n" +
          "Options:\n" +
          "  --limit,  -l <n>    Max passages (default: 5)\n" +
          "  --help,  -h         Show this help\n"
      );
      process.exit(0);
    } else if (arg === "--limit" || arg === "-l") {
      limit = parseInt(argv[++i] ?? "5", 10);
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  const [pageUrl, ...queryParts] = positional;
  const query = queryParts.join(" ").trim();

  if (!pageUrl || !query) {
    process.stderr.write("Error: url and query are required\nUsage: satoric fetch <url> <query>\n");
    process.exit(1);
  }

  const url = new URL(`${baseUrl}/fetch`);
  url.searchParams.set("url", pageUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));

  let results: { title: string; content: string }[];
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
    results = raw.results as { title: string; content: string }[];
  } catch (e) {
    process.stderr.write(`Error: ${(e as Error).message}\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
}
