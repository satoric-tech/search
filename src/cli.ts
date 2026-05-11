#!/usr/bin/env node
import { Command } from "commander";
import { version } from "./version.js";
import { searchCommand } from "./search.js";
import { collectionsCommand } from "./collections.js";
import { documentsCommand } from "./documents.js";
import { fetchCommand } from "./fetch.js";
import { mcpCommand } from "./mcp.js";

const program = new Command("satoric")
  .version(version)
  .description("Search, index, and manage Satoric collections")
  .addHelpText(
    "after",
    `
Environment:
  SATORIC_BASE_URL      Backend URL (default: https://api.satoric.ai)
  SATORIC_COLLECTION    Default collection for search (default: web)`
  )
  .addCommand(searchCommand)
  .addCommand(collectionsCommand)
  .addCommand(documentsCommand)
  .addCommand(fetchCommand)
  .addCommand(mcpCommand);

await program.parseAsync();
