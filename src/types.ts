export type FieldType = "text" | "integer";
export type Tokenizer = "default" | "en_stem" | "raw";

export interface FieldSpec {
  name: string;
  type: FieldType;
  tokenizer?: Tokenizer;
  searchable?: boolean;
  stored?: boolean;
  snippet?: boolean;
  fast?: boolean;
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
