import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import type { OAuthStartView, SourceView } from "@runelay/shared";
import { GOOGLE_SERVICE_SCOPES, GOOGLE_SERVICES } from "@/modules/google/constants/google.constants";
import { googleTransport } from "@/modules/google/utils/google-fetch";
import { scopesFor } from "@/modules/google/utils/google-scopes";
import { encodeBrokerState } from "@/modules/oauth/utils/oauth-broker";
import { findSource, updateOAuth } from "@/modules/sources/repositories/source.repository";
import { connectGateway, textOf } from "../../../../../test/gateway-helpers";
import { type FakeGoogle, GOOGLE_ACCESS, GOOGLE_CODE, startFakeGoogle } from "../../../../../test/google-helpers";
import { body, call, createApiKey, signUp, type TestAccount } from "../../../../../test/helpers";

let account: TestAccount;
let google: FakeGoogle;
let restore: () => void;

const key = () => ({ organizationId: account.organizationId, name: "google" });

beforeAll(async () => {
  google = startFakeGoogle();
  restore = google.install();
  account = await signUp("Google Routes");
});

afterAll(() => {
  restore();
  google.stop();
});

const view = async () => (await body<SourceView>(await call("/v1/sources/google", { cookie: account.cookie }))).data;

const start = async () => {
  const response = await call("/v1/sources/google/oauth", { method: "POST", cookie: account.cookie });
  return (await body<OAuthStartView>(response)).data.authorizationUrl;
};

test("a Google source with several services waits for one login", async () => {
  const response = await call("/v1/sources", {
    method: "POST",
    cookie: account.cookie,
    json: { name: "google", config: { kind: "google", services: ["gmail", "meet"] } },
  });
  expect(response.status).toBe(201);
  const { data } = await body<SourceView>(response);
  expect(data).toMatchObject({
    name: "google",
    config: { kind: "google", services: ["gmail", "meet"] },
    status: "needs_auth",
    icon: "google",
    auth: "oauth",
    google: { email: null, grantedServices: [] },
  });
});

test("login asks Google for the selected services and the callback connects", async () => {
  const url = new URL((await start()) ?? "");
  expect(url.searchParams.get("scope")?.split(" ")).toEqual(scopesFor(["gmail", "meet"]));
  expect(url.searchParams.get("prompt")).toBe("consent select_account");
  google.grantedScope = scopesFor(["gmail", "meet"]).join(" ");
  google.routes.set("GET openidconnect.googleapis.com/v1/userinfo", () => ({ body: { email: "ana@example.com" } }));
  const response = await call(`/v1/oauth/callback?state=${encodeBrokerState("google")}&code=${GOOGLE_CODE}`, {
    cookie: account.cookie,
  });
  expect(response.headers.get("location")).toBe("/connectors/google?oauth=done");
  expect(await view()).toMatchObject({
    status: "ok",
    toolCount: 10,
    google: { email: "ana@example.com", grantedServices: ["gmail", "meet"] },
  });
  const repeated = await call(`/v1/oauth/callback?state=${encodeBrokerState("google")}&code=used`, {
    cookie: account.cookie,
  });
  expect(repeated.headers.get("location")).toBe("/connectors/google?oauth=done");
});

test("adding services asks for an incremental login with only the new scopes", async () => {
  const patched = await call("/v1/sources/google", {
    method: "PATCH",
    cookie: account.cookie,
    json: { config: { kind: "google", services: ["gmail", "meet", "forms"] } },
  });
  expect((await body<SourceView>(patched)).data).toMatchObject({
    status: "needs_auth",
    error: "Conecte o Google para liberar: Formulários.",
  });
  const url = new URL((await start()) ?? "");
  expect(url.searchParams.get("scope")).toBe(GOOGLE_SERVICE_SCOPES.forms.join(" "));
  expect(url.searchParams.has("prompt")).toBe(false);
  expect(url.searchParams.get("include_granted_scopes")).toBe("true");
  google.grantedScope = GOOGLE_SERVICE_SCOPES.forms.join(" ");
  google.tokenReply = () => ({ body: { access_token: "after-forms", expires_in: 3600, scope: google.grantedScope } });
  await call(`/v1/oauth/callback?state=${encodeBrokerState("google")}&code=${GOOGLE_CODE}`, { cookie: account.cookie });
  google.tokenReply = null;
  expect(findSource(key()).data?.oauth.tokens).toMatchObject({ access_token: "after-forms" });
  expect(findSource(key()).data?.oauth.tokens?.refresh_token).toBeTruthy();
  expect(await view()).toMatchObject({ status: "ok", toolCount: 12, error: null });
});

test("a failed exchange redirects with the error", async () => {
  await call("/v1/sources/google", {
    method: "PATCH",
    cookie: account.cookie,
    json: { config: { kind: "google", services: ["calendar"] } },
  });
  google.tokenReply = () => ({ status: 400, body: { error: "invalid_grant", error_description: "Code expired" } });
  const response = await call(`/v1/oauth/callback?state=${encodeBrokerState("google")}&code=old`, {
    cookie: account.cookie,
  });
  google.tokenReply = null;
  expect(response.headers.get("location")).toBe(
    "/connectors/google?oauth=done&oauth_error=O+Google+recusou+o+login%3A+Code+expired",
  );
});

test("starting a login with every scope granted reconnects without a url", async () => {
  updateOAuth(key(), {
    tokens: { access_token: GOOGLE_ACCESS, token_type: "Bearer", refresh_token: "r" },
    google: { scopes: scopesFor(GOOGLE_SERVICES) },
  });
  expect(await start()).toBeNull();
  expect((await view())?.status).toBe("ok");
});

test("api keys see the Google config as is", async () => {
  const apiKey = await createApiKey(account, "google");
  const response = await call("/v1/sources/google", { bearer: apiKey.key });
  expect((await body<SourceView>(response)).data.config).toEqual({ kind: "google", services: ["calendar"] });
});

test("switching to Sheets loads its REST tools without calling Google", async () => {
  const spy = spyOn(googleTransport, "fetch").mockImplementation(() => Promise.reject(new Error("offline")));
  try {
    await call("/v1/sources/google", {
      method: "PATCH",
      cookie: account.cookie,
      json: { config: { kind: "google", services: ["sheets"] } },
    });
    expect(await view()).toMatchObject({ status: "ok", error: null, toolCount: 5 });
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});

test("login stays unsupported for non remote sources", async () => {
  await call("/v1/sources", {
    method: "POST",
    cookie: account.cookie,
    json: { name: "local", config: { kind: "openapi", spec: '{"openapi":"3.0.0","paths":{}}' } },
  });
  const response = await call("/v1/sources/local/oauth", { method: "POST", cookie: account.cookie });
  expect((await body(response)).error?.code).toBe("OAUTH_UNSUPPORTED");
  const missing = await call("/v1/sources/ghost/oauth", { method: "POST", cookie: account.cookie });
  expect((await body(missing)).error?.code).toBe("SOURCE_NOT_FOUND");
});

test.each([
  ["gmail", "gmail"],
  ["google_drive", "drive"],
  ["google_meet", "meet"],
] as const)("two %s accounts have independent OAuth and gateway tools", async (id, service) => {
  const names = [`${id}_pessoal`, `${id}_trabalho`];
  const apiKey = await createApiKey(account, `${id}-accounts`);
  const gateway = await connectGateway(apiKey.key);
  const previousProfile = google.routes.get("GET openidconnect.googleapis.com/v1/userinfo");
  google.routes.set("GET openidconnect.googleapis.com/v1/userinfo", ({ authorization }) => ({
    body: { email: `${authorization?.replace("Bearer ", "")}@example.com` },
  }));
  google.tokenReply = ({ code, code_verifier }) => ({
    body: {
      access_token: code,
      refresh_token: `refresh-${code}`,
      expires_in: 3600,
      scope: scopesFor([service]).join(" "),
    },
    status: code && code_verifier ? 200 : 400,
  });
  try {
    const authorizations = await Promise.all(
      names.map(async (name) => {
        const installed = await call("/v1/catalog/install", {
          method: "POST",
          cookie: account.cookie,
          json: { id, name },
        });
        expect(installed.status).toBe(201);
        const response = await call(`/v1/sources/${name}/oauth`, { method: "POST", cookie: account.cookie });
        return new URL((await body<OAuthStartView>(response)).data.authorizationUrl ?? "");
      }),
    );
    expect(new Set(authorizations.map((url) => url.searchParams.get("code_challenge"))).size).toBe(2);
    for (const [index, url] of authorizations.entries()) {
      const name = names[index];
      const query = new URLSearchParams({ state: url.searchParams.get("state") ?? "", code: name ?? "" });
      const completed = await call(`/v1/oauth/callback?${query}`, { cookie: account.cookie });
      expect(completed.headers.get("location")).toBe(`/connectors/${name}?oauth=done`);
    }
    const connections = await gateway.callTool({ name: "list_connections" });
    expect(JSON.parse(textOf(connections))).toEqual(
      expect.arrayContaining(
        names.map((name) =>
          expect.objectContaining({
            name,
            status: "ok",
            google: { email: `${name}@example.com`, grantedServices: [service] },
          }),
        ),
      ),
    );
    expect(textOf(connections)).not.toContain(`refresh-${id}`);
    for (const name of names) {
      const tool = `${name}.account_whoami`;
      const discovered = await gateway.callTool({ name: "search_tools", arguments: { source: name } });
      expect(JSON.parse(textOf(discovered))).toContainEqual(expect.objectContaining({ name: tool }));
      const called = await gateway.callTool({ name: "call_tool", arguments: { name: tool } });
      expect(called.isError).not.toBe(true);
      expect(JSON.parse(textOf(called))).toMatchObject({ email: `${name}@example.com` });
      expect(findSource({ organizationId: account.organizationId, name }).data?.oauth.tokens?.refresh_token).toBe(
        `refresh-${name}`,
      );
    }
  } finally {
    google.tokenReply = null;
    if (previousProfile) google.routes.set("GET openidconnect.googleapis.com/v1/userinfo", previousProfile);
    else google.routes.delete("GET openidconnect.googleapis.com/v1/userinfo");
    await gateway.close();
  }
});
