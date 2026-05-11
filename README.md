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

Satoric is a full-text search engine for developer docs, APIs, and technical references. Available as a CLI, SDK, MCP server, and agent skill.

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

Lucene query syntax enables precise queries:

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

Install once or run with `npx`:

```bash
npm install -g @satoric/search
# or
npx @satoric/search <command>
```

### Search

```bash
satoric search "mcp server setup"
satoric search "site:stripe.com webhook" --limit 5
satoric search "redis connection pooling" --collection my-docs
```

Flags:

| Flag | Short | Default | Description |
| --- | --- | --- | --- |
| `--collection <name>` | `-c` | `web` | Collection to search |
| `--limit <n>` | `-l` | `10` | Max results (max 50) |
| `--offset <n>` | `-o` | `0` | Pagination offset |

### Collections

```bash
satoric collections list
satoric collections describe my-docs
satoric collections create my-docs \
  --field title:text:en_stem:snippet \
  --field content:text:en_stem:snippet \
  --field site:text:raw
satoric collections delete my-docs
```

Field spec format: `name:type[:tokenizer][:options]`

| Part | Values |
| --- | --- |
| `type` | `text`, `integer` |
| `tokenizer` | `default`, `en_stem`, `raw` |
| options | `snippet`, `fast`, `nostore`, `nosearch` |

### Documents

```bash
# Upsert from file (JSONL or JSON array)
satoric documents upsert my-docs --file docs.jsonl
cat docs.json | satoric documents upsert my-docs

# Fetch a document by id
satoric documents fetch my-docs --id "https://example.com/page"

# Delete by id or query
satoric documents delete my-docs --id "https://example.com/page"
satoric documents delete my-docs --query 'site:"example.com"'
```

Each document must have an `id` field. Documents with the same `id` are replaced on upsert.

### Environment

| Variable | Default | Description |
| --- | --- | --- |
| `SATORIC_BASE_URL` | `https://api.satoric.ai` | Backend URL |
| `SATORIC_COLLECTION` | `web` | Default collection for search |

## SDK

Import and call directly from TypeScript or JavaScript.

```typescript
import {
  search,
  listCollections, getCollection, createCollection, deleteCollection,
  upsertDocuments, fetchDocument, deleteDocuments,
} from '@satoric/search';

// Search the default public collection
const results = await search("mcp server setup");
const results = await search("site:stripe.com webhook", { limit: 5 });

// Search a specific collection
const results = await search("query", { collection: "my-docs" });

// Manage collections
await createCollection("my-docs", [
  { name: "title", type: "text", tokenizer: "en_stem", snippet: true },
  { name: "content", type: "text", tokenizer: "en_stem", snippet: true },
  { name: "site", type: "text", tokenizer: "raw" },
]);
const collections = await listCollections();
await deleteCollection("my-docs");

// Manage documents
await upsertDocuments("my-docs", [
  { id: "https://example.com/page", title: "Example", content: "..." }
]);
const doc = await fetchDocument("my-docs", "https://example.com/page");
await deleteDocuments("my-docs", { id: "https://example.com/page" });
await deleteDocuments("my-docs", { query: 'site:"example.com"' });
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
