export interface FieldSpec {
  name: string;
  type: string;
  /** Convenience: true → record: "position" in Quickwit */
  snippet?: boolean;
  /** Convenience: false → indexed: false in Quickwit */
  searchable?: boolean;
  /** Any other Quickwit field option passed through verbatim */
  [key: string]: unknown;
}

export interface Collection {
  name: string;
  fields: FieldSpec[];
}

export interface SearchResult {
  id: string;
  title?: string;
  description?: string;
  snippet?: string;
  [key: string]: unknown;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  limit: number;
  offset: number;
}

export interface Document {
  id: string;
  [key: string]: unknown;
}
