import { env } from "@/config/env";
import { googleTransport } from "@/modules/google/utils/google-fetch";
import { guardedFetch } from "@/modules/sources/utils/guarded-fetch";

export const GOOGLE_CODE = "google-code";
export const GOOGLE_ACCESS = "google-access";
export const GOOGLE_REFRESH = "google-refresh";

export interface RecordedRequest {
  method: string;
  host: string;
  path: string;
  query: URLSearchParams;
  authorization: string | null;
  contentType: string | null;
  body: string;
}

export type FakeReply = {
  status?: number;
  body?: unknown;
  text?: string;
  bytes?: Uint8Array;
  headers?: Record<string, string>;
};

export interface FakeGoogle {
  base: string;
  requests: RecordedRequest[];
  tokenForms: Record<string, string>[];
  grantedScope: string;
  tokenReply: ((form: Record<string, string>) => FakeReply) | null;
  routes: Map<string, (request: RecordedRequest) => FakeReply>;
  failingHosts: Set<string>;
  last: (host?: string) => RecordedRequest;
  install: () => () => void;
  stop: () => void;
}

const reply = ({ status = 200, body = {}, text, bytes, headers }: FakeReply) => {
  if (bytes) return new Response(bytes, { status, headers });
  return text === undefined ? Response.json(body, { status, headers }) : new Response(text, { status, headers });
};

export const startFakeGoogle = (): FakeGoogle => {
  const fake = {
    requests: [],
    tokenForms: [],
    grantedScope: "",
    tokenReply: null,
    routes: new Map(),
    failingHosts: new Set(),
  } as unknown as FakeGoogle;

  const tokenEndpoint = (form: Record<string, string>): FakeReply => {
    fake.tokenForms.push(form);
    if (fake.tokenReply) return fake.tokenReply(form);
    const granted =
      (form.grant_type === "authorization_code" && form.code === GOOGLE_CODE) ||
      (form.grant_type === "refresh_token" && form.refresh_token === GOOGLE_REFRESH);
    if (!granted) return { status: 400, body: { error: "invalid_grant", error_description: "Bad Request" } };
    return {
      body: {
        access_token: GOOGLE_ACCESS,
        token_type: "Bearer",
        expires_in: 3600,
        scope: fake.grantedScope,
        ...(form.grant_type === "authorization_code" ? { refresh_token: GOOGLE_REFRESH } : {}),
      },
    };
  };

  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/broker/google/token" || url.pathname === "/oauth2.googleapis.com/token") {
        return reply(tokenEndpoint(Object.fromEntries(new URLSearchParams(await request.text()))));
      }
      const [, host = "", ...rest] = url.pathname.split("/");
      const path = `/${rest.join("/")}`;
      if (fake.failingHosts.has(host)) return new Response("down", { status: 500 });
      const recorded: RecordedRequest = {
        method: request.method,
        host,
        path,
        query: url.searchParams,
        authorization: request.headers.get("authorization"),
        contentType: request.headers.get("content-type"),
        body: await request.text(),
      };
      fake.requests.push(recorded);
      const handler = fake.routes.get(`${request.method} ${host}${path}`);
      return reply(handler ? handler(recorded) : {});
    },
  });

  fake.base = `http://127.0.0.1:${server.port}`;
  fake.last = (host?: string) => {
    const matching = fake.requests.filter((request) => !host || request.host === host);
    const found = matching.at(-1);
    if (!found) throw new Error(`no request to ${host ?? "google"}`);
    return found;
  };
  fake.install = () => {
    const previousFetch = googleTransport.fetch;
    const previousBroker = env.RUNELAY_OAUTH_BROKER_URL;
    const previousPrivate = env.RUNELAY_ALLOW_PRIVATE_URLS;
    env.RUNELAY_OAUTH_BROKER_URL = `${fake.base}/broker`;
    env.RUNELAY_ALLOW_PRIVATE_URLS = true;
    googleTransport.fetch = (input, init) => {
      const url = new URL(input);
      return guardedFetch(`${fake.base}/${url.host}${url.pathname}${url.search}`, init);
    };
    return () => {
      googleTransport.fetch = previousFetch;
      env.RUNELAY_OAUTH_BROKER_URL = previousBroker;
      env.RUNELAY_ALLOW_PRIVATE_URLS = previousPrivate;
    };
  };
  fake.stop = () => server.stop(true);
  return fake;
};
