import { afterAll, beforeAll, expect, test } from "bun:test";
import { env } from "@/config/env";
import { connectGoogle } from "@/modules/google/clients/google.client";
import { DRIVE_FILES_PATH, DRIVE_LINK_TTL_MS } from "@/modules/google/constants/google.constants";
import { signDriveLink, verifyDriveLink } from "@/modules/google/utils/drive-link";
import { googleTransport } from "@/modules/google/utils/google-fetch";
import { scopesFor } from "@/modules/google/utils/google-scopes";
import { updateOAuth, upsertSource } from "@/modules/sources/repositories/source.repository";
import { type FakeGoogle, startFakeGoogle } from "../../../../../test/google-helpers";
import { call, signUp, type TestAccount } from "../../../../../test/helpers";

let google: FakeGoogle;
let restore: () => void;
let account: TestAccount;

const key = () => ({ organizationId: account.organizationId, name: "drive" });
const pathOf = (url: string) => new URL(url).pathname;

beforeAll(async () => {
  google = startFakeGoogle();
  restore = google.install();
  account = await signUp("Drive Links");
  upsertSource(account.organizationId, { name: "drive", config: { kind: "google", services: ["drive"] } });
  updateOAuth(key(), {
    tokens: { access_token: "drive-token", token_type: "Bearer" },
    google: { scopes: scopesFor(["drive"]) },
  });
  google.routes.set("GET www.googleapis.com/drive/v3/files/v1", (request) =>
    request.query.get("alt") === "media"
      ? {
          status: request.authorization === "Bearer drive-token" ? 200 : 401,
          bytes: new Uint8Array([1, 2, 3]),
          headers: { "content-type": "video/mp4" },
        }
      : { body: { id: "v1", name: "Culto ação.mp4", mimeType: "video/mp4", size: "3" } },
  );
});

afterAll(() => {
  restore();
  google.stop();
});

test("drive_download_link signs a link that streams the file without a session", async () => {
  const connection = await connectGoogle(key(), { kind: "google", services: ["drive"] });
  const tool = connection.data?.tools.find((candidate) => candidate.name === "drive_download_link");
  const result = await tool?.call({ fileId: "v1" });
  const data = result?.data as { url: string; name: string; expiresAt: string };
  expect(data.name).toBe("Culto ação.mp4");
  expect(data.url.startsWith(`${env.PUBLIC_URL}${DRIVE_FILES_PATH}/`)).toBe(true);
  expect(Date.parse(data.expiresAt)).toBeGreaterThan(Date.now());

  const response = await call(pathOf(data.url));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("video/mp4");
  expect(response.headers.get("content-disposition")).toBe(
    `attachment; filename="Culto a__o.mp4"; filename*=UTF-8''Culto%20a%C3%A7%C3%A3o.mp4`,
  );
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  expect(google.last().query.get("alt")).toBe("media");
});

test("tampered, expired or unknown links are refused", async () => {
  const { url } = signDriveLink(key(), "v1");
  const token = pathOf(url).split("/").at(-1) ?? "";
  const [payload] = token.split(".");
  expect((await call(`${DRIVE_FILES_PATH}/${payload}.bad`)).status).toBe(404);
  expect((await call(`${DRIVE_FILES_PATH}/nothing`)).status).toBe(404);
  const old = signDriveLink(key(), "v1", Date.now() - DRIVE_LINK_TTL_MS - 1);
  expect(verifyDriveLink(pathOf(old.url).split("/").at(-1) ?? "").error?.message).toBe("Link expirado. Peça um novo.");
  expect((await call(pathOf(old.url))).status).toBe(404);
  const missing = signDriveLink(key(), "gone");
  google.routes.set("GET www.googleapis.com/drive/v3/files/gone", () => ({ status: 404, body: {} }));
  expect((await call(pathOf(missing.url))).status).toBe(404);
  const otherSource = signDriveLink({ organizationId: account.organizationId, name: "nope" }, "v1");
  expect((await call(pathOf(otherSource.url))).status).toBe(409);
});

test("a link reports Google failures without leaking the file", async () => {
  google.routes.set("GET www.googleapis.com/drive/v3/files/v2", (request) =>
    request.query.get("alt") === "media" ? { status: 500, body: {} } : { text: "not json" },
  );
  const { url } = signDriveLink(key(), "v2");
  expect((await call(pathOf(url))).ok).toBe(false);
  const { fetch } = googleTransport;
  try {
    googleTransport.fetch = (input, init) =>
      String(input).includes("alt=media") ? Promise.reject(new Error("down")) : fetch(input, init);
    expect((await call(pathOf(url))).ok).toBe(false);
    googleTransport.fetch = () => Promise.reject(new Error("down"));
    expect((await call(pathOf(url))).status).toBe(404);
  } finally {
    googleTransport.fetch = fetch;
  }
});
