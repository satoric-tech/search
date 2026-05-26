import { DEFAULT_BASE_URL, DEFAULT_LIMIT } from "./constants.js";
import { apiRequest } from "./client.js";
import type { SearchResponse, SearchResult } from "./types.js";

export type { SearchResponse, SearchResult };

export interface SearchOptions {
  limit?: number;
  offset?: number;
  /** @internal */
  baseUrl?: string;
}

export async function search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const { limit = DEFAULT_LIMIT, offset = 0, baseUrl = DEFAULT_BASE_URL } = options;

  const url = new URL(`${baseUrl}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  if (offset > 0) url.searchParams.set("offset", String(offset));

  const response = await apiRequest<SearchResponse>("GET", url.toString());
  return response.results;
}
