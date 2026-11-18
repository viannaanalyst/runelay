import { Hono } from "hono";
import { GOOGLE_API } from "@/modules/google/constants/google.constants";
import { getGoogleAccessToken } from "@/modules/google/services/google-auth.service";
import { verifyDriveLink } from "@/modules/google/utils/drive-link";
import { googleFetch } from "@/modules/google/utils/google-fetch";
import { respondError } from "@/shared/http";

const PASSED_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];

const attachment = (name: string) =>
  `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;

// The signed link is the credential: agents and scripts download big Drive files with plain curl
// instead of pulling the bytes through a tool call.
export const googleFilesRoutes = new Hono().get("/files/:token", async (c) => {
  const link = verifyDriveLink(c.req.param("token"));
  if (link.error) return respondError(c, "NOT_FOUND", link.error.message);
  const access = await getGoogleAccessToken(link.data.key);
  if (access.error) return respondError(c, "NEEDS_AUTH", access.error.message);
  const authorization = `Bearer ${access.data}`;
  const fileUrl = `${GOOGLE_API.driveFiles}/${encodeURIComponent(link.data.fileId)}`;
  const meta = await googleFetch(`${fileUrl}?fields=name&supportsAllDrives=true`, {
    headers: { authorization, accept: "application/json" },
  }).catch(() => null);
  if (!meta?.ok) return respondError(c, "NOT_FOUND", "Arquivo não encontrado no Drive.");
  const { name } = (await meta.json().catch(() => ({}))) as { name?: string };
  const range = c.req.header("range");
  const upstream = await googleFetch(`${fileUrl}?alt=media&supportsAllDrives=true`, {
    headers: { authorization, ...(range ? { range } : {}) },
  }).catch(() => null);
  if (!upstream?.ok) {
    return respondError(c, "TOOL_FAILED", `Google: HTTP ${upstream?.status ?? "sem resposta"}`);
  }
  const headers = new Headers({ "content-disposition": attachment(name ?? link.data.fileId) });
  for (const header of PASSED_HEADERS) {
    const value = upstream.headers.get(header);
    if (value) headers.set(header, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
});
