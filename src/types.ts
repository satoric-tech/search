export interface Collection {
  name: string;
  mappings: Record<string, unknown>;
}

export interface CollectionInfo {
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
