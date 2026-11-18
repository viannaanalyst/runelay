import type { Result } from "@runelay/shared";
import type { z } from "zod";
import type { SourceKey } from "@/modules/sources/types/source.types";

export interface GoogleOAuthState {
  scopes: string[];
  expiresAt?: number;
  email?: string;
  name?: string;
}

export interface GoogleTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface GoogleRequest {
  url: string;
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  body?: string | Uint8Array;
  contentType?: string;
  headers?: Record<string, string>;
  /** Return the raw bytes and headers instead of parsing the body as JSON. */
  raw?: boolean;
}

export interface GoogleRawResponse {
  bytes: Uint8Array;
  contentType: string | null;
  location: string | null;
}

export type GoogleApi = <T = Record<string, unknown>>(request: GoogleRequest) => Promise<Result<T>>;

export interface GoogleToolContext {
  key: SourceKey;
}

export type GoogleFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface GoogleToolDefinition<Schema extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: Schema;
  run: (api: GoogleApi, input: z.infer<Schema>, context: GoogleToolContext) => Promise<Result<unknown>>;
}
