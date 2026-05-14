import { DEFAULT_BASE_URL, DEFAULT_INDEX, DEFAULT_LIMIT } from "./constants.js";
import { apiRequest } from "./client.js";
import type { Index, Document, SearchResponse, SearchResult } from "./types.js";

export type { Index, Document, SearchResult, SearchResponse };

export interface SearchOptions {
  index?: string;
  limit?: number;
  offset?: number;
  /** @internal */
  baseUrl?: string;
}

export async function search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
  const {
    index = DEFAULT_INDEX,
    limit = DEFAULT_LIMIT,
    offset = 0,
    baseUrl = DEFAULT_BASE_URL,
  } = options;

  const url = new URL(`${baseUrl}/indexes/${encodeURIComponent(index)}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  if (offset > 0) url.searchParams.set("offset", String(offset));

  return apiRequest<SearchResponse>("GET", url.toString());
}

export async function listIndexes(baseUrl = DEFAULT_BASE_URL): Promise<Index[]> {
  return apiRequest<Index[]>("GET", `${baseUrl}/indexes`);
}

export async function getIndex(name: string, baseUrl = DEFAULT_BASE_URL): Promise<Index> {
  return apiRequest<Index>("GET", `${baseUrl}/indexes/${encodeURIComponent(name)}`);
}

export async function createIndex(
  name: string,
  mappings: Record<string, unknown>,
  baseUrl = DEFAULT_BASE_URL
): Promise<void> {
  await apiRequest("PUT", `${baseUrl}/indexes/${encodeURIComponent(name)}`, { mappings });
}

export async function updateIndexMeta(
  name: string,
  meta: Record<string, unknown>,
  baseUrl = DEFAULT_BASE_URL
): Promise<void> {
  await apiRequest("PATCH", `${baseUrl}/indexes/${encodeURIComponent(name)}`, { meta });
}

export async function deleteIndex(name: string, baseUrl = DEFAULT_BASE_URL): Promise<void> {
  await apiRequest("DELETE", `${baseUrl}/indexes/${encodeURIComponent(name)}`);
}

export async function upsertDocuments(
  index: string,
  documents: Document[],
  baseUrl = DEFAULT_BASE_URL
): Promise<{ upserted: number }> {
  return apiRequest<{ upserted: number }>(
    "PUT",
    `${baseUrl}/indexes/${encodeURIComponent(index)}/documents/upsert`,
    { documents }
  );
}

export async function deleteDocuments(
  index: string,
  by: { id: string } | { query: string },
  baseUrl = DEFAULT_BASE_URL
): Promise<void> {
  await apiRequest("POST", `${baseUrl}/indexes/${encodeURIComponent(index)}/documents/delete`, by);
}
