import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { GoogleConfig } from "@runelay/shared";
import { connectSource, disconnectSource, findTool } from "@/modules/connectors/services/connection.service";
import { connectGoogle } from "@/modules/google/clients/google.client";
import { scopesFor } from "@/modules/google/utils/google-scopes";
import { findSourceView, updateOAuth, upsertSource } from "@/modules/sources/repositories/source.repository";
import { type FakeGoogle, startFakeGoogle } from "../../../../../test/google-helpers";
import { signUp, type TestAccount } from "../../../../../test/helpers";

const CONFIG: GoogleConfig = { kind: "google", services: ["calendar", "docs", "gmail"] };

let account: TestAccount;
let google: FakeGoogle;
let restore: () => void;

const key = () => ({ organizationId: account.organizationId, name: "google" });

const grant = (services = CONFIG.services) =>
  updateOAuth(key(), {
    tokens: { access_token: "mcp-token", token_type: "Bearer" },
    google: { scopes: scopesFor(services) },
  });

beforeAll(async () => {
  google = startFakeGoogle();
  restore = google.install();
  account = await signUp("Google Client");
});

beforeEach(async () => {
  await disconnectSource(key());
  upsertSource(account.organizationId, { name: "google", config: CONFIG });
  updateOAuth(key(), { tokens: undefined, google: undefined });
  google.failingHosts.clear();
});

afterAll(() => {
  restore();
  google.stop();
});

test("needs auth until every selected service is granted", async () => {
  const result = await connectGoogle(key(), CONFIG);
  expect(result.error).toMatchObject({
    code: "NEEDS_AUTH",
    message: "Conecte o Google para liberar: Agenda, Docs, Gmail.",
  });
  grant(["gmail"]);
  expect((await connectGoogle(key(), CONFIG)).error?.message).toBe("Conecte o Google para liberar: Agenda, Docs.");
  await connectSource(key());
  expect(findSourceView(key()).data).toMatchObject({
    status: "needs_auth",
    error: "Conecte o Google para liberar: Agenda, Docs.",
    google: { email: null, grantedServices: ["gmail"] },
  });
  expect((await connectGoogle({ organizationId: account.organizationId, name: "nope" }, CONFIG)).error?.code).toBe(
    "SOURCE_NOT_FOUND",
  );
});

test("fails when the token cannot be refreshed", async () => {
  updateOAuth(key(), {
    tokens: { access_token: "old", token_type: "Bearer" },
    google: { scopes: scopesFor(CONFIG.services), expiresAt: 1 },
  });
  expect((await connectGoogle(key(), CONFIG)).error?.code).toBe("NEEDS_AUTH");
});

test("loads runelay's REST tools for the selected services without any Google MCP server", async () => {
  grant();
  const connection = await connectGoogle(key(), CONFIG);
  if (connection.error) throw new Error(connection.error.message);
  const names = connection.data.tools.map((tool) => tool.name).sort();
  expect(names).toEqual([
    "account_whoami",
    "calendar_create_event",
    "calendar_delete_event",
    "calendar_list_calendars",
    "calendar_list_events",
    "docs_append_text",
    "docs_create_document",
    "docs_read_document",
    "gmail_get_message",
    "gmail_get_thread",
    "gmail_list_labels",
    "gmail_modify_labels",
    "gmail_reply",
    "gmail_search_messages",
    "gmail_search_threads",
    "gmail_send_email",
  ]);
  google.routes.set("GET www.googleapis.com/calendar/v3/users/me/calendarList", () => ({
    body: { items: [{ id: "primary", summary: "Ana", primary: true }] },
  }));
  const calendar = connection.data.tools.find((tool) => tool.name === "calendar_list_calendars");
  expect((await calendar?.call({}))?.data).toMatchObject({ calendars: [{ id: "primary", primary: true }] });
  expect(google.last()).toMatchObject({ host: "www.googleapis.com", authorization: "Bearer mcp-token" });
  expect(google.requests.some((request) => request.host.includes("mcp."))).toBe(false);
  updateOAuth(key(), { tokens: undefined });
  const revoked = await calendar?.call({});
  expect(revoked?.error?.message).toContain("Conecte o Google");
  await connection.data.close();
});

test("a connected source reports every tool and no error", async () => {
  grant();
  expect((await connectSource(key())).error).toBeNull();
  const view = findSourceView(key()).data;
  expect(view).toMatchObject({ status: "ok", error: null, toolCount: 16 });
  const tool = await findTool(account.organizationId, "google.docs_read_document");
  expect(tool.data?.source).toBe("google");
});
