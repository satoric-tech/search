#!/usr/bin/env node
import { Command } from "commander";
import { version } from "./version.js";
import { makeSearchCommand } from "./search.js";
import { mcpCommand } from "./mcp.js";

const program = new Command("satoric")
  .version(version)
  .description("Search developer documentation")
  .addCommand(makeSearchCommand())
  .addCommand(mcpCommand);

await program.parseAsync();
