import { DEFAULT_BASE_URL, DEFAULT_INDEX, DEFAULT_LIMIT } from "./constants.js";
import { apiRequest } from "./client.js";
import type {
  SearchResponse,
  SearchResult,
  AuthorityResponse,
  AuthorityResult,
} from "./types.js";

export type {
  SearchResponse,
  SearchResult,
  AuthorityResponse,
  AuthorityResult,
};

export interface SearchOptions {
  index?: string;
  limit?: number;
  offset?: number;
  fields?: string;
  /** @internal */
  baseUrl?: string;
}

export async function search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
  const {
    index = DEFAULT_INDEX,
    limit = DEFAULT_LIMIT,
    offset = 0,
    fields,
    baseUrl = DEFAULT_BASE_URL,
  } = options;

  const url = new URL(`${baseUrl}/indexes/${encodeURIComponent(index)}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  if (offset > 0) url.searchParams.set("offset", String(offset));
  if (fields) url.searchParams.set("fields", fields);

  return apiRequest<SearchResponse>("GET", url.toString());
}

export interface AuthorityOptions {
  index?: string;
  field: string;
  limit?: number;
  /** @internal */
  baseUrl?: string;
}

export async function authority(
  query: string,
  options: AuthorityOptions
): Promise<AuthorityResponse> {
  const {
    index = DEFAULT_INDEX,
    field,
    limit = DEFAULT_LIMIT,
    baseUrl = DEFAULT_BASE_URL,
  } = options;

  const url = new URL(`${baseUrl}/indexes/${encodeURIComponent(index)}/authorities`);
  url.searchParams.set("q", query);
  url.searchParams.set("field", field);
  url.searchParams.set("limit", String(limit));

  return apiRequest<AuthorityResponse>("GET", url.toString());
}

