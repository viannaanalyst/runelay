import { attempt, fail, ok, type Result } from "@runelay/shared";
import { GOOGLE_ERROR_PREVIEW } from "@/modules/google/constants/google.constants";
import type { GoogleApi, GoogleRawResponse, GoogleRequest } from "@/modules/google/types/google.types";
import { googleFetch } from "@/modules/google/utils/google-fetch";

const parseBody = (text: string): unknown => {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const errorText = (data: unknown, status: number) => {
  const error = (data as { error?: { message?: string } | string } | null)?.error;
  const message = typeof error === "string" ? error : error?.message;
  if (message) return message;
  return typeof data === "string" && data ? data.slice(0, GOOGLE_ERROR_PREVIEW) : `HTTP ${status}`;
};

const buildUrl = ({ url, query }: GoogleRequest) => {
  const target = new URL(url);
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined) target.searchParams.set(name, String(value));
  }
  return target;
};

export const createGoogleApi =
  (token: () => Promise<Result<string>>): GoogleApi =>
  async <T>(request: GoogleRequest): Promise<Result<T>> => {
    const access = await token();
    if (access.error) return access;
    const headers: Record<string, string> = {
      accept: request.raw ? "*/*" : "application/json",
      ...request.headers,
      authorization: `Bearer ${access.data}`,
    };
    const json = request.json !== undefined;
    if (json) headers["content-type"] = "application/json";
    if (request.contentType) headers["content-type"] = request.contentType;
    const response = await attempt(
      () =>
        googleFetch(buildUrl(request), {
          method: request.method ?? "GET",
          headers,
          body: json ? JSON.stringify(request.json) : request.body,
        }),
      "TOOL_FAILED",
    );
    if (response.error) return response;
    if (request.raw && response.data.ok) {
      const raw: GoogleRawResponse = {
        bytes: new Uint8Array(await response.data.arrayBuffer()),
        contentType: response.data.headers.get("content-type"),
        location: response.data.headers.get("location"),
      };
      return ok(raw as T);
    }
    const data = parseBody(await response.data.text());
    if (!response.data.ok) {
      return fail("TOOL_FAILED", `Google: ${errorText(data, response.data.status)}`, {
        status: response.data.status,
      });
    }
    return ok(data as T);
  };
