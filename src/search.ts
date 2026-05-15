import { Command } from "commander";
import { version } from "./version.js";
import { DEFAULT_BASE_URL, DEFAULT_LIMIT } from "./constants.js";
import { toPainless } from "./math.js";

export function makeSearchCommand(): Command {
  return new Command("search")
    .description("Search an index")
    .argument("<query...>", "search query (Lucene syntax supported)")
    .option("-l, --limit <number>", "max results", String(DEFAULT_LIMIT))
    .option("-p, --page <number>", "page number (1-indexed)", "1")
    .option("--return <spec>", "return fields, e.g. url,title:128,body:~256,body:-256")
    .option("-b, --boost <expr>", 'boost expression, e.g. "1 - rank/1000000"')
    .option("-n, --name <name>", "index name (default: $SATORIC_INDEX)")
    .addHelpText(
      "after",
      `
Examples:
  satoric search "openai docs"
  satoric search "site:vercel.com deployment" --limit 20
  satoric search -n llms-txt "openai docs"`
    )
    .action(async (queryParts: string[], options: Record<string, string>) => {
      const index = options["name"] ?? process.env.SATORIC_INDEX;
      if (!index) {
        process.stderr.write("Error: -n/--name is required (or set SATORIC_INDEX)\n");
        process.exit(1);
      }
      const query = queryParts.join(" ").trim();
      const url = new URL(`${DEFAULT_BASE_URL}/indexes/${encodeURIComponent(index)}/search`);
      url.searchParams.set("q", query);
      url.searchParams.set("limit", options["limit"]!);
      const page = Math.max(1, parseInt(options["page"]!, 10));
      const offset = (page - 1) * parseInt(options["limit"]!, 10);
      if (offset > 0) url.searchParams.set("offset", String(offset));
      if (options["return"]) url.searchParams.set("fields", options["return"]!);
      if (options["boost"]) {
        try {
          url.searchParams.set("boost", toPainless(options["boost"]!));
        } catch (e) {
          process.stderr.write(`Error: ${(e as Error).message}\n`);
          process.exit(1);
        }
      }

      try {
        const res = await fetch(url.toString(), {
          headers: { "User-Agent": `satoric/${version}` },
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
}

export const searchCommand = makeSearchCommand();
