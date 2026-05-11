import { DEFAULT_BASE_URL, DEFAULT_COLLECTION, DEFAULT_LIMIT } from "./constants.js";
import { apiRequest } from "./client.js";
import type { Collection, Document, FieldSpec, SearchResponse, SearchResult } from "./types.js";

export type { Collection, Document, FieldSpec, SearchResult };

export interface SearchOptions {
  collection?: string;
  limit?: number;
  offset?: number;
  /** @internal */
  baseUrl?: string;
}

export async function search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const {
    collection = DEFAULT_COLLECTION,
    limit = DEFAULT_LIMIT,
    offset = 0,
    baseUrl = DEFAULT_BASE_URL,
  } = options;

  const url = new URL(`${baseUrl}/collections/${encodeURIComponent(collection)}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  if (offset > 0) url.searchParams.set("offset", String(offset));

  const data = await apiRequest<SearchResponse>("GET", url.toString());
  return data.results;
}

export async function listCollections(baseUrl = DEFAULT_BASE_URL): Promise<Collection[]> {
  return apiRequest<Collection[]>("GET", `${baseUrl}/collections`);
}

export async function getCollection(name: string, baseUrl = DEFAULT_BASE_URL): Promise<Collection> {
  return apiRequest<Collection>("GET", `${baseUrl}/collections/${encodeURIComponent(name)}`);
}

export async function createCollection(
  name: string,
  fields: FieldSpec[],
  baseUrl = DEFAULT_BASE_URL
): Promise<void> {
  await apiRequest("PUT", `${baseUrl}/collections/${encodeURIComponent(name)}`, { fields });
}

export async function deleteCollection(name: string, baseUrl = DEFAULT_BASE_URL): Promise<void> {
  await apiRequest("DELETE", `${baseUrl}/collections/${encodeURIComponent(name)}`);
}

export async function upsertDocuments(
  collection: string,
  documents: Document[],
  baseUrl = DEFAULT_BASE_URL
): Promise<{ upserted: number }> {
  return apiRequest<{ upserted: number }>(
    "PUT",
    `${baseUrl}/collections/${encodeURIComponent(collection)}/documents/upsert`,
    { documents }
  );
}

export async function fetchDocument(
  collection: string,
  id: string,
  baseUrl = DEFAULT_BASE_URL
): Promise<Document> {
  const url = new URL(`${baseUrl}/collections/${encodeURIComponent(collection)}/documents/fetch`);
  url.searchParams.set("id", id);
  return apiRequest<Document>("GET", url.toString());
}

export async function deleteDocuments(
  collection: string,
  by: { id: string } | { query: string },
  baseUrl = DEFAULT_BASE_URL
): Promise<void> {
  await apiRequest(
    "POST",
    `${baseUrl}/collections/${encodeURIComponent(collection)}/documents/delete`,
    by
  );
}
