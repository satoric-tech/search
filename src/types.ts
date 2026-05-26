export interface SearchResult {
  [key: string]: unknown;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuthorityResult {
  value: string;
  count: number;
}

export interface AuthorityResponse {
  results: AuthorityResult[];
}
