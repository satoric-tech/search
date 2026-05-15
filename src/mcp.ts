import { Command } from "commander";
import { version } from "./version.js";
import { DEFAULT_BASE_URL, DEFAULT_INDEX, DEFAULT_LIMIT } from "./constants.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "http";

function buildServer(baseUrl: string): Server {
  const server = new Server({ name: "satoric", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "search",
        description:
          "Full-text search across developer docs, APIs, and technical references indexed from llms.txt sites.\n\n" +
          "Run plain queries to search across all fields and sites:\n" +
          "  mcp server setup\n" +
          "  rate limiting middleware\n" +
          "  oauth2 token refresh\n\n" +
          "Use field prefixes to scope to a specific domain or field:\n" +
          "  site:<domain>   e.g. site:stripe.com webhook\n" +
          "  title:<term>    e.g. title:authentication\n" +
          "  content:<term>  e.g. content:webhook\n\n" +
          "Write precise queries with Lucene query syntax:\n" +
          '  "..."          exact phrase         "webhook signature"\n' +
          "  + / -          must / exclude       +stripe -deprecated\n" +
          "  AND / OR / NOT boolean operators    stripe AND webhook\n" +
          "  ( )            group expressions    (auth OR oauth) site:clerk.com\n" +
          "  ^              boost a term         title:auth^2.0 content:auth\n" +
          '  ~              fuzzy / phrase slop  webhook~1 / "big wolf"~1\n\n' +
          "Combine operators for expressive queries:\n" +
          '  +site:stripe.com "webhook signature" -title:deprecated content:verification^2.0\n' +
          '  site:supabase.com (edge functions OR "row level security") -title:changelog\n' +
          "  title:quickstart^2.0 content:authentication site:clerk.com",
        inputSchema: {
          type: "object" as const,
          properties: {
            q: {
              type: "string",
              description:
                "Search query. Supports plain queries, field prefixes (site:, title:, content:), Lucene query syntax (quoted phrases, +/-, AND/OR/NOT, grouping, boosting, fuzzy).",
            },
            limit: {
              type: "integer",
              description: "Max results to return (default: 10, max: 50)",
              default: 10,
            },
            offset: {
              type: "integer",
              description: "Number of results to skip for pagination (default: 0)",
              default: 0,
            },
          },
          required: ["q"],
        },
      },
      {
        name: "authority",
        description:
          "Find which sites have the most coverage for a topic. Aggregates top field values across documents matching a query.\n\n" +
          "Use this to discover authoritative sources before searching for specifics:\n" +
          "  authority('mcp server', { field: 'site' })  → which sites write most about MCP\n" +
          "  authority('payments api', { field: 'site' }) → top payment documentation sites",
        inputSchema: {
          type: "object" as const,
          properties: {
            q: {
              type: "string",
              description: "Search query to find matching documents.",
            },
            field: {
              type: "string",
              description: "Field to aggregate on. Use 'site' to find top domains.",
            },
            limit: {
              type: "integer",
              description: "Max results to return (default: 10)",
              default: 10,
            },
          },
          required: ["q", "field"],
        },
      },
      {
        name: "related",
        description:
          "Find terms statistically associated with a query. Uses significant text aggregation to surface terms overrepresented in matching documents vs. the whole index.\n\n" +
          "Useful for query expansion and discovering related concepts:\n" +
          "  related('mcp', { field: 'body' })  → terms that co-occur with 'mcp' across docs",
        inputSchema: {
          type: "object" as const,
          properties: {
            q: {
              type: "string",
              description: "Seed query.",
            },
            field: {
              type: "string",
              description: "Text field to analyze (e.g. 'body', 'title').",
            },
            limit: {
              type: "integer",
              description: "Max terms to return (default: 10)",
              default: 10,
            },
          },
          required: ["q", "field"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const rawQ = args?.["q"];
    if (typeof rawQ !== "string" || !rawQ.trim()) {
      return {
        content: [{ type: "text" as const, text: "Error: q is required" }],
        isError: true,
      };
    }
    const q = rawQ.trim();

    const index = DEFAULT_INDEX;
    const rawLimit = args?.["limit"];
    const limit = Math.max(1, Math.floor(Number(rawLimit) || DEFAULT_LIMIT));

    async function mcpFetch(url: URL): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
      try {
        const response = await fetch(url.toString(), {
          headers: { "User-Agent": `satoric-mcp/${version}` },
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          return {
            content: [{ type: "text" as const, text: `Error: ${body?.error ?? `HTTP ${response.status}`}` }],
            isError: true,
          };
        }
        const data = await response.json();
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
          isError: true,
        };
      }
    }

    if (name === "search") {
      const rawOffset = args?.["offset"];
      const offset = Math.max(0, Math.floor(Number(rawOffset) || 0));
      const url = new URL(`${baseUrl}/indexes/${encodeURIComponent(index)}/search`);
      url.searchParams.set("q", q);
      url.searchParams.set("limit", String(Math.min(50, limit)));
      if (offset > 0) url.searchParams.set("offset", String(offset));
      return mcpFetch(url);
    }

    if (name === "authority" || name === "related") {
      const rawField = args?.["field"];
      if (typeof rawField !== "string" || !rawField.trim()) {
        return {
          content: [{ type: "text" as const, text: "Error: field is required" }],
          isError: true,
        };
      }
      const endpoint = name === "authority" ? "authorities" : "related";
      const url = new URL(`${baseUrl}/indexes/${encodeURIComponent(index)}/${endpoint}`);
      url.searchParams.set("q", q);
      url.searchParams.set("field", rawField.trim());
      url.searchParams.set("limit", String(limit));
      return mcpFetch(url);
    }

    return {
      content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
      isError: true,
    };
  });

  return server;
}

export async function runMcp(transport: string, port: number): Promise<void> {
  const baseUrl = DEFAULT_BASE_URL;

  if (transport === "sse") {
    const sessions = new Map<string, SSEServerTransport>();

    const httpServer = createServer(async (req, res) => {
      if (req.method === "GET" && req.url === "/sse") {
        const t = new SSEServerTransport("/message", res);
        sessions.set(t.sessionId, t);
        res.on("close", () => sessions.delete(t.sessionId));
        try {
          await buildServer(baseUrl).connect(t);
        } catch (e) {
          process.stderr.write(`SSE connect error: ${(e as Error).message}\n`);
          sessions.delete(t.sessionId);
          if (!res.headersSent) res.writeHead(500).end("internal error");
        }
      } else if (req.method === "POST" && req.url?.startsWith("/message")) {
        const sessionId = new URL(req.url, "http://x").searchParams.get("sessionId") ?? "";
        const t = sessions.get(sessionId);
        if (t) {
          try {
            await t.handlePostMessage(req, res);
          } catch (e) {
            process.stderr.write(`SSE message error: ${(e as Error).message}\n`);
            if (!res.headersSent) res.writeHead(500).end("internal error");
          }
        } else {
          res.writeHead(404).end("session not found");
        }
      } else {
        res.writeHead(404).end();
      }
    });

    httpServer.listen(port, () => {
      process.stderr.write(`MCP SSE server listening on :${port}\n`);
    });
  } else {
    await buildServer(baseUrl).connect(new StdioServerTransport());
  }
}

export const mcpCommand = new Command("mcp")
  .description("Start the MCP server")
  .option("--transport <mode>", "transport mode: stdio or sse", "stdio")
  .option("--port <n>", "port for SSE transport", "4000")
  .action(async (options: { transport: string; port: string }) => {
    await runMcp(options.transport, parseInt(options.port, 10));
  });
