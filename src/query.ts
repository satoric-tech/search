import { Command } from "commander";
import { DEFAULT_BASE_URL, DEFAULT_LIMIT } from "./constants.js";
import { version } from "./version.js";

function requireName(options: { name?: string }): string {
  const name = options.name ?? process.env.SATORIC_INDEX;
  if (!name) {
    process.stderr.write("Error: -n/--name is required (or set SATORIC_INDEX)\n");
    process.exit(1);
  }
  return name;
}

async function queryGet(url: URL): Promise<unknown> {
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": `satoric/${version}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    process.stderr.write(`Error: ${body?.error ?? `HTTP ${res.status}`}\n`);
    process.exit(1);
  }
  return res.json();
}

export const authorityCommand = new Command("authority")
  .description("Find top field values across documents matching a query")
  .argument("<query...>", "search query")
  .option("-n, --name <name>", "index name (default: $SATORIC_INDEX)")
  .option("--field <field>", "field to aggregate on (e.g. site, url)")
  .option("-l, --limit <n>", "max results", String(DEFAULT_LIMIT))
  .addHelpText(
    "after",
    `
Examples:
  satoric authority "mcp" -n llms-txt --field site
  satoric authority "payments api" -n llms-txt --field site --limit 20`
  )
  .action(
    async (queryParts: string[], options: { name?: string; field?: string; limit?: string }) => {
      const name = requireName(options);
      if (!options.field) {
        process.stderr.write("Error: --field is required (e.g. --field site)\n");
        process.exit(1);
      }
      const query = queryParts.join(" ").trim();
      const url = new URL(`${DEFAULT_BASE_URL}/indexes/${encodeURIComponent(name)}/authorities`);
      url.searchParams.set("q", query);
      url.searchParams.set("field", options.field);
      url.searchParams.set("limit", options.limit ?? String(DEFAULT_LIMIT));

      try {
        const raw = await queryGet(url);
        process.stdout.write(JSON.stringify(raw, null, 2) + "\n");
      } catch (e) {
        process.stderr.write(`Error: ${(e as Error).message}\n`);
        process.exit(1);
      }
    }
  );
