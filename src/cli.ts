#!/usr/bin/env node
import { Command } from "commander";
import { version } from "./version.js";
import { makeSearchCommand } from "./search.js";
import { indexCommand } from "./indexes.js";
import { mcpCommand } from "./mcp.js";

const program = new Command("satoric")
  .version(version)
  .description("Search, index, and manage Satoric indexes")
  .addHelpText(
    "after",
    `
Environment:
  SATORIC_API_KEY    API key for authenticated operations
  SATORIC_INDEX      Default index name`
  )
  .addCommand(makeSearchCommand())
  .addCommand(indexCommand)
  .addCommand(mcpCommand);

await program.parseAsync();
