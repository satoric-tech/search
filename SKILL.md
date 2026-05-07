---
name: satoric
description: Full-text web search engine for developer docs.
---

# Satoric Search Skill

Satoric is a full-text web search engine for developer docs, APIs, and technical references from [llms.txt](https://llmstxt.org/) sites.

## Query syntax

Run plain queries to search across all fields and sites:

```
mcp server setup
rate limiting middleware
oauth2 token refresh
```

Use field prefixes to scope to a specific domain or field:

| Prefix | Description | Example |
| --- | --- | --- |
| `site:` | Scope to a domain | `site:stripe.com webhook` |
| `title:` | Search page titles | `title:authentication` |
| `content:` | Search page body | `content:webhook` |

Write precise queries with Lucene query syntax:

| Syntax | Description | Example |
| --- | --- | --- |
| `"…"` | Exact phrase | `"webhook signature"` |
| `+` / `-` | Must appear / exclude | `+stripe -deprecated` |
| `AND` / `OR` / `NOT` | Boolean operators | `stripe AND webhook` |
| `( )` | Group expressions | `(auth OR oauth) site:clerk.com` |
| `^` | Boost a term | `title:auth^2.0 content:auth` |
| `~` | Fuzzy / phrase slop | `webhook~1` / `"big wolf"~1` |

Combine operators for expressive queries:

```
+site:stripe.com "webhook signature" -title:deprecated content:verification^2.0
site:supabase.com (edge functions OR "row level security") -title:changelog
title:quickstart^2.0 content:authentication site:clerk.com
```

## CLI

Search llms.txt pages from the command line: `npx @satoric/search search <query> [options]`

```bash
npx @satoric/search search "mcp server setup"
npx @satoric/search search "site:stripe.com webhook verification" --limit 5
npx @satoric/search search '+redis "connection pooling" content:pool^1.5' --limit 10 --offset 3
```

Supported flags:

| Flag           | Short | Default | Max  | Description                      |
| -------------- | ----- | ------- | ---- | -------------------------------- |
| `--limit <n>`  | `-l`  | `10`    | `50` | Max results to return            |
| `--offset <n>` | `-o`  | `0`     | —    | Results to skip (for pagination) |

## Output

Each API call returns a list of results with metadata and a relevant snippet, along with pagination info:

```json
{
  "results": [
    {
      "url": "https://upstash.com/docs/redis/quickstart",
      "site": "upstash.com",
      "site_name": "Upstash",
      "title": "Redis Quickstart",
      "description": "A short summary of the page content.",
      "snippet": "The passage most relevant to your query."
    },
    ...
  ],
  "total": 42,
  "limit": 10,
  "offset": 0
}
```

