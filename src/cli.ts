#!/usr/bin/env node
import { Command } from "commander";
import { version } from "./version.js";
import { searchCommand } from "./search.js";
import { collectionsCommand } from "./collections.js";
import { upsertCommand, fetchCommand, deleteCommand } from "./documents.js";
import { mcpCommand } from "./mcp.js";

const program = new Command("satoric")
  .version(version)
  .description("Search, index, and manage Satoric collections")
  .addHelpText(
    "after",
    `
Environment:
  SATORIC_BASE_URL      Backend URL (default: https://api.satoric.ai)
  SATORIC_API_KEY       API key for write operations
  SATORIC_COLLECTION    Default collection for search (default: llms-txt)`
  )
  .addCommand(searchCommand)
  .addCommand(upsertCommand)
  .addCommand(fetchCommand)
  .addCommand(deleteCommand)
  .addCommand(collectionsCommand)
  .addCommand(mcpCommand);

await program.parseAsync();
