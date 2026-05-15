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

Satoric is a full-text search engine for developer docs, APIs, and technical references. It indexes llms.txt sites across the web and is available as a CLI, SDK, and MCP server.

## Installation

```bash
npm install @satoric/search
# or run without installing
npx @satoric/search <command>
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

Lucene query syntax enables precise queries:

| Syntax | Description | Example |
| --- | --- | --- |
| `"…"` | Exact phrase | `"webhook signature"` |
| `+` / `-` | Must appear / exclude | `+stripe -deprecated` |
| `AND` / `OR` / `NOT` | Boolean operators | `stripe AND webhook` |
| `( )` | Group expressions | `(auth OR oauth) site:clerk.com` |
| `^` | Boost a term | `title:auth^2.0 content:auth` |
| `~` | Fuzzy / phrase slop | `webhook~1` / `"big wolf"~1` |

---

## CLI

### search

Search across all indexed docs. Use `site:` to scope to a specific domain:

```bash
satoric search "mcp server setup"
satoric search "site:stripe.com webhook" --limit 5
satoric search "oauth2 token refresh" --return url,title,body:256
```

### authority

Find which sites have the most coverage for a topic:

```bash
satoric authority "mcp server" --field site
satoric authority "payments api" --field site --limit 20
satoric authority "kubernetes deployment" --field site
```

### related

Find terms statistically associated with a query:

```bash
satoric related "mcp" --field body
satoric related "payments api" --field body --limit 20
satoric related "kubernetes deployment" --field body
```

Run any command with `--help` for the full list of flags.

---

## SDK

Import and call directly from TypeScript or JavaScript:

```typescript
import { search, authority, related } from '@satoric/search';

// Full-text search
const results = await search("mcp server setup");
const results = await search("site:stripe.com webhook", { limit: 5 });
const results = await search("oauth2 token refresh", { fields: "url,title,body:256" });

// Top sites for a topic
const top = await authority("mcp server", { field: "site" });
// top.results → [{ value: "modelcontextprotocol.io", count: 42 }, ...]

// Statistically related terms
const terms = await related("mcp", { field: "body" });
// terms.results → [{ term: "server", score: 12.4 }, ...]
```

All three functions accept an optional `index` (default: `llms-txt`) and `limit` (default: `10`).

---

## MCP

Add to your MCP config to expose `search`, `authority`, and `related` tools to your agents:

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

### Tools

| Tool | Description |
| --- | --- |
| `search` | Full-text search. Args: `q`, `limit`, `offset` |
| `authority` | Top field values for a query. Args: `q`, `field`, `limit` |
| `related` | Statistically associated terms. Args: `q`, `field`, `limit` |

---

## Build your own full-text search (beta)

Index your own documents. Accepts technical references, internal docs, or any content in NDJSON or JSON array format.

```bash
# Create an index
satoric index create -n my-docs --language english

# Upsert documents (NDJSON or JSON array, streamed)
satoric index doc upsert -n my-docs --file docs.ndjson
# or pipe directly
python index.py | satoric index doc upsert -n my-docs

# Search
satoric search "webhook signature" -n my-docs --return "title,body:~256"
```

Contact us on [Discord](https://discord.gg/6kc2N9S3) to get started.

---

## Requirements

Node.js 18+

## Community

- **Discord**: Join our [community server](https://discord.gg/6kc2N9S3) for real-time help and discussions
- **Issues**: Report bugs or request features on [GitHub Issues](https://github.com/satoric-tech/search/issues)

## License

MIT
