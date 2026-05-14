#!/usr/bin/env node
import { Command } from "commander";
import { version } from "./version.js";
import { searchCommand } from "./search.js";
import {
  createCommand,
  updateCommand,
  infoCommand,
  listCommand,
  dropCommand,
} from "./collections.js";
import { upsertCommand, deleteCommand } from "./documents.js";
import { mcpCommand } from "./mcp.js";

const program = new Command("satoric")
  .version(version)
  .description("Search, index, and manage Satoric collections")
  .addHelpText(
    "after",
    `
Environment:
  SATORIC_API_KEY       API key for authenticated operations
  SATORIC_COLLECTION    Default collection name`
  )
  .addCommand(listCommand)
  .addCommand(searchCommand)
  .addCommand(createCommand)
  .addCommand(upsertCommand)
  .addCommand(updateCommand)
  .addCommand(deleteCommand)
  .addCommand(infoCommand)
  .addCommand(dropCommand)
  .addCommand(mcpCommand);

await program.parseAsync();
