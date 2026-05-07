<br>

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/satoric-tech/search/main/assets/logo_light.png" />
    <img src="https://raw.githubusercontent.com/satoric-tech/search/main/assets/logo_dark.png" alt="Satoric" width="400" />
  </picture>
</div>

<div align="center">

<br>

[![CI](https://github.com/satoric-tech/search/actions/workflows/ci.yml/badge.svg)](https://github.com/satoric-tech/search/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40satoric%2Fsearch?style=flat-square&color=CB3837)](https://www.npmjs.com/package/@satoric/search)
[![License](https://img.shields.io/badge/license-MIT-007ec6?style=flat-square)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/6kc2N9S3)
[![X](https://img.shields.io/badge/satoric__tech-black?style=flat-square&logo=x&logoColor=white)](https://x.com/satoric_tech)

</div>

---

**Website: [https://satoric.ai](https://satoric.ai/)**

---

Satoric is a full-text web search engine for developer docs, APIs, and technical references from [llms.txt](https://llmstxt.org/) sites. Available as a CLI, SDK, MCP server, and agent skill.

## Installation

```bash
npm install @satoric/search
```

## Query syntax

Plain queries search across all fields and sites:

```
mcp server setup
rate limiting middleware
oauth2 token refresh
```

Field prefixes scope queries to a specific domain or field:

| Prefix | Description | Example |
| --- | --- | --- |
| `site:` | Scope to a domain | `site:stripe.com webhook` |
| `title:` | Search page titles | `title:authentication` |
| `content:` | Search page body | `content:webhook` |

Tantivy-style syntax enables precise queries:

| Syntax | Description | Example |
| --- | --- | --- |
| `"…"` | Exact phrase | `"webhook signature"` |
| `+` / `-` | Must appear / exclude | `+stripe -deprecated` |
| `AND` / `OR` / `NOT` | Boolean operators | `stripe AND webhook` |
| `( )` | Group expressions | `(auth OR oauth) site:clerk.com` |
| `^` | Boost a term | `title:auth^2.0 content:auth` |
| `~` | Fuzzy / phrase slop | `webhook~1` / `"big wolf"~1` |

Agents can help you combine operators for expressive queries:

```
+site:stripe.com "webhook signature" -title:deprecated content:verification^2.0
site:supabase.com (edge functions OR "row level security") -title:changelog
title:quickstart^2.0 content:authentication site:clerk.com
```

## CLI

Search documentation from the command line: `npx @satoric/search search <query> [options]`

```bash
npx @satoric/search search "mcp server setup"
npx @satoric/search search "site:stripe.com webhook verification" --limit 5
npx @satoric/search search "redis connection pooling" --limit 10 --offset 3
```

Supported flags:

| Flag           | Short | Default | Max  | Description                      |
| -------------- | ----- | ------- | ---- | -------------------------------- |
| `--limit <n>`  | `-l`  | `10`    | `50` | Max results to return            |
| `--offset <n>` | `-o`  | `0`     | —    | Results to skip (for pagination) |

## SDK

Import and call `search()` directly from TypeScript or JavaScript.

```typescript
import { search } from '@satoric/search';

const results = await search("mcp server setup");
const results = await search("site:stripe.com webhook verification", { limit: 5 });
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
