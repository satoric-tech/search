export interface Index {
  name: string;
  mappings: Record<string, unknown>;
}

export interface IndexInfo {
  name: string;
  num_docs: number;
  size_in_bytes: number;
  created_at: number;
  mappings: Record<string, unknown>;
}

export interface SearchResult {
  [key: string]: unknown;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  limit: number;
  offset: number;
}

export interface Document {
  [key: string]: unknown;
}

export interface AuthorityResult {
  value: string;
  count: number;
}

export interface AuthorityResponse {
  results: AuthorityResult[];
}

export interface RelatedTerm {
  term: string;
  score: number;
}

export interface RelatedResponse {
  results: RelatedTerm[];
}
