import { readFileSync } from "fs";
import { Command } from "commander";
import { load as parseYaml } from "js-yaml";
import { DEFAULT_BASE_URL } from "./constants.js";
import { apiRequest, ApiError } from "./client.js";
import type { Collection, CollectionInfo } from "./types.js";

interface CollectionConfig {
  name?: string;
  mappings: Record<string, unknown>;
}

function loadConfig(filePath: string): CollectionConfig {
  const raw = readFileSync(filePath, "utf8");
  const ext = filePath.split(".").pop()?.toLowerCase();
  let parsed: unknown;
  if (ext === "yaml" || ext === "yml") {
    parsed = parseYaml(raw);
  } else {
    parsed = JSON.parse(raw);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as Record<string, unknown>).mappings !== "object"
  ) {
    throw new Error(`Config must have a "mappings" object`);
  }
  return parsed as CollectionConfig;
}

export const collectionsCommand = new Command("collections").description("Manage collections");

collectionsCommand
  .command("list")
  .description("Print collection names")
  .action(async () => {
    const baseUrl = DEFAULT_BASE_URL;
    try {
      const collections = await apiRequest<Collection[]>("GET", `${baseUrl}/collections`);
      if (collections.length === 0) {
        process.stdout.write("No collections.\n");
      } else {
        process.stdout.write(collections.map((c) => c.name).join("\n") + "\n");
      }
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });

collectionsCommand
  .command("describe <name>")
  .description("Show collection config as JSON")
  .action(async (name: string) => {
    const baseUrl = DEFAULT_BASE_URL;
    try {
      const collection = await apiRequest<Collection>(
        "GET",
        `${baseUrl}/collections/${encodeURIComponent(name)}`
      );
      const config: CollectionConfig = {
        name: collection.name,
        mappings: collection.mappings as Record<string, unknown>,
      };
      process.stdout.write(JSON.stringify(config, null, 2) + "\n");
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });

collectionsCommand
  .command("stats <name>")
  .description("Show doc count, size, and created date")
  .action(async (name: string) => {
    const baseUrl = DEFAULT_BASE_URL;
    try {
      const info = await apiRequest<CollectionInfo>(
        "GET",
        `${baseUrl}/collections/${encodeURIComponent(name)}/info`
      );
      const size =
        info.size_in_bytes > 1_000_000
          ? `${(info.size_in_bytes / 1_000_000).toFixed(1)} MB`
          : `${(info.size_in_bytes / 1_000).toFixed(1)} KB`;
      const properties =
        (info.mappings as Record<string, Record<string, unknown>>).properties ?? {};
      process.stdout.write(
        `name:       ${info.name}\n` +
          `docs:       ${info.num_docs.toLocaleString()}\n` +
          `size:       ${size}\n` +
          `created:    ${new Date(info.created_at * 1000).toISOString()}\n` +
          `fields:     ${Object.keys(properties).join(", ")}\n`
      );
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });

collectionsCommand
  .command("create [name]")
  .description("Create a collection from a JSON or YAML config file")
  .option("-C, --config <file>", "path to JSON or YAML config file")
  .action(async (nameArg: string | undefined, options: { config?: string }) => {
    const baseUrl = DEFAULT_BASE_URL;
    let name = nameArg;
    let config: CollectionConfig | undefined;

    if (options.config) {
      try {
        config = loadConfig(options.config);
        if (config.name) name ??= config.name;
      } catch (e) {
        process.stderr.write(`Error loading config: ${(e as Error).message}\n`);
        process.exit(1);
      }
    }

    if (!name) {
      process.stderr.write("Error: collection name is required\n");
      process.exit(1);
    }
    if (!config) {
      process.stderr.write("Error: --config is required\n");
      process.exit(1);
    }

    try {
      await apiRequest("PUT", `${baseUrl}/collections/${encodeURIComponent(name)}`, {
        mappings: config.mappings,
      });
      process.stdout.write(`Collection '${name}' created.\n`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        process.stderr.write(`Error: collection '${name}' already exists\n`);
      } else {
        process.stderr.write(`Error: ${(e as Error).message}\n`);
      }
      process.exit(1);
    }
  });

collectionsCommand
  .command("configure <name>")
  .description("Update search config for an existing collection")
  .option("-C, --config <file>", "path to JSON or YAML config file")
  .action(async (name: string, options: { config?: string }) => {
    const baseUrl = DEFAULT_BASE_URL;
    let config: CollectionConfig | undefined;

    if (options.config) {
      try {
        config = loadConfig(options.config);
      } catch (e) {
        process.stderr.write(`Error loading config: ${(e as Error).message}\n`);
        process.exit(1);
      }
    }

    if (!config) {
      process.stderr.write("Error: --config is required\n");
      process.exit(1);
    }

    try {
      const meta = (config.mappings._meta ?? {}) as Record<string, unknown>;
      await apiRequest("PATCH", `${baseUrl}/collections/${encodeURIComponent(name)}`, { meta });
      process.stdout.write(`Collection '${name}' configured.\n`);
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });

collectionsCommand
  .command("delete <name>")
  .description("Delete a collection")
  .action(async (name: string) => {
    const baseUrl = DEFAULT_BASE_URL;
    try {
      await apiRequest("DELETE", `${baseUrl}/collections/${encodeURIComponent(name)}`);
      process.stdout.write(`Collection '${name}' deleted.\n`);
    } catch (e) {
      process.stderr.write(`Error: ${(e as Error).message}\n`);
      process.exit(1);
    }
  });
