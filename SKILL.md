---
name: satoric
description: Search developer docs, APIs, and technical pages from across the web.
---

# Satoric Search Skill

Satoric searches Markdown and .txt pages from [llms.txt](https://llmstxt.org/) sites.

**Agent guidance:**
- Use the default limit (10) unless there's a clear reason to fetch more
- Prefer scoped queries (`site: query`) when the target site is known
- Never use `--human` — always parse JSON output

## Query syntax

Plain queries search across all sites:

```
mcp server setup
vector database embeddings
rate limiting middleware
oauth2 token refresh
websocket reconnection strategy
```

Scope a query to a specific site with `site: query`:

```
stripe: webhook verification
supabase: edge functions auth
vercel: edge middleware caching
mistral.ai: function calling               # match by domain
docs.aws.amazon.com: s3 presigned urls     # match by subdomain
```

Use quotes for exact phrase matching:

```
"context window limit"
vector database "semantic search"
stripe: "webhook signature verification"
```

## CLI

Search llms.txt pages from the command line: `npx @satoric/search search <query> [options]`

```bash
npx @satoric/search search "mcp server setup"
npx @satoric/search search "stripe: webhook verification" --limit 5
npx @satoric/search search "redis connection pooling" --limit 10 --offset 3
npx @satoric/search search "anthropic: tool function calling" --limit 5 --human
```

| Flag              | Short | Default | Max  | Description                            |
| ----------------- | ----- | ------- | ---- | -------------------------------------- |
| `--limit <n>`     | `-l`  | `10`    | `50` | Max results to return                  |
| `--offset <n>`    | `-o`  | `0`     | —    | Results to skip (for pagination)       |
| `--human`         | —     | —       | —    | Human-readable output instead of JSON  |

## SDK

Import and call `search()` directly from TypeScript or JavaScript.

```typescript
import { search } from '@satoric/search';

const results = await search("mcp server setup");
const results = await search("stripe: webhook verification", { limit: 5 });
const results = await search("redis connection pooling", { limit: 10, offset: 3 });
```

| Option   | Type     | Default | Max  | Description                      |
| -------- | -------- | ------- | ---- | -------------------------------- |
| `limit`  | `number` | `10`    | `50` | Max results to return            |
| `offset` | `number` | `0`     | —    | Results to skip (for pagination) |

## MCP

Add to your MCP config to expose a `search` tool to your agents:

```json
{
  "mcpServers": {
    "satoric": {
      "command": "npx",
      "args": ["@satoric/search", "mcp"]
    }
  }
}
```

| Parameter | Required | Default | Max  | Description                      |
| --------- | -------- | ------- | ---- | -------------------------------- |
| `q`       | yes      | —       | —    | Search query                     |
| `limit`   | no       | `10`    | `50` | Max results to return            |
| `offset`  | no       | `0`     | —    | Results to skip (for pagination) |

## API

`GET https://search.satoric.ai/search` — returns a JSON object with `results` and `total`.

```bash
curl "https://search.satoric.ai/search?q=mcp+server+setup"
curl "https://search.satoric.ai/search?q=stripe%3A+webhook+verification&limit=5"
curl "https://search.satoric.ai/search?q=redis+connection+pooling&limit=10&offset=3"
```

| Parameter | Required | Default | Max  | Description                      |
| --------- | -------- | ------- | ---- | -------------------------------- |
| `q`       | yes      | —       | —    | Search query                     |
| `limit`   | no       | `10`    | `50` | Max results to return            |
| `offset`  | no       | `0`     | —    | Results to skip (for pagination) |

## Output

Results are returned as a JSON array:

```json
[
  {
    "url": "https://upstash.com/docs/redis/quickstart",
    "site": "Upstash",
    "title": "Redis Quickstart",
    "snippet": "Connect to your Upstash Redis database using the REST API or a compatible client."
  }
]
```

Use `site`, `title`, and `snippet` to decide relevance. Use `url` to fetch the full page.
