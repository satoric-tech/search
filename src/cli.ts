#!/usr/bin/env node
import { runSearch } from "./search.js";
import { runFetch } from "./fetch.js";
import { runMcp } from "./mcp.js";
import { runCollections } from "./collections.js";
import { runDocuments } from "./documents.js";

const [sub, ...rest] = process.argv.slice(2);

if (sub === "search") {
  await runSearch(rest);
} else if (sub === "fetch") {
  await runFetch(rest);
} else if (sub === "mcp") {
  await runMcp(rest);
} else if (sub === "collections") {
  await runCollections(rest);
} else if (sub === "documents") {
  await runDocuments(rest);
} else {
  const help =
    "Usage: satoric <command> [options]\n\n" +
    "Commands:\n" +
    "  search <query>           Search a collection\n" +
    "  collections <command>    Manage collections\n" +
    "  documents <command>      Manage documents\n" +
    "  fetch <url> <query>      Fetch passages from a specific page\n" +
    "  mcp                      Start the MCP server\n\n" +
    "Environment:\n" +
    "  SATORIC_BASE_URL         Backend URL (default: https://api.satoric.ai)\n" +
    "  SATORIC_COLLECTION       Default collection for search (default: web)\n\n" +
    "Run satoric <command> --help for command options.\n";
  if (sub) {
    process.stderr.write(`Unknown command: ${sub}\n\n${help}`);
    process.exit(1);
  }
  process.stdout.write(help);
}
