Search Markdown and .txt pages from [llms.txt](https://llmstxt.org/) sites. Available as a CLI, SDK, MCP server, and agent skill.

## Installation

```bash
npm install @satoric/search
```

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

Search documentation from the command line: `npx @satoric/search search <query> [options]`

```bash
npx @satoric/search search "mcp server setup"
npx @satoric/search search "stripe: webhook verification" --limit 5
npx @satoric/search search "redis connection pooling" --limit 10 --offset 3
npx @satoric/search search "anthropic: tool function calling" --limit 5 --human
```

| Flag           | Short | Default | Max  | Description                           |
| -------------- | ----- | ------- | ---- | ------------------------------------- |
| `--limit <n>`  | `-l`  | `10`    | `50` | Max results to return                 |
| `--offset <n>` | `-o`  | `0`     | —    | Results to skip (for pagination)      |
| `--human`      | —     | —       | —    | Human-readable output instead of JSON |

## SDK

Import and call `search()` directly from TypeScript or JavaScript.

```typescript
import { search } from '@satoric/search';

const results = await search("mcp server setup");
const results = await search("stripe: webhook verification", { limit: 5 });
const results = await search("redis connection pooling", { limit: 10, offset: 3 });
```

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

## Agent skill

See [SKILL.md](SKILL.md)

## Requirements

Node.js 18+

## Community

- **Discord**: Join our [community server](https://discord.gg/6kc2N9S3) for real-time help and discussions
- **Issues**: Report bugs or request features on [GitHub Issues](https://github.com/satoric-tech/search/issues)

## License

MIT
