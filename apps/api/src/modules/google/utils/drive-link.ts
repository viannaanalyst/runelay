import { createHmac, timingSafeEqual } from "node:crypto";
import { attemptSync, fail, ok, type Result } from "@runelay/shared";
import { env } from "@/config/env";
import { DRIVE_FILES_PATH, DRIVE_LINK_TTL_MS } from "@/modules/google/constants/google.constants";
import type { SourceKey } from "@/modules/sources/types/source.types";

interface DriveLinkClaims {
  o: string;
  n: string;
  f: string;
  e: number;
}

export interface DriveLink {
  key: SourceKey;
  fileId: string;
}

const signature = (payload: string) =>
  createHmac("sha256", env.RUNELAY_SECRET).update(`google-drive-link:${payload}`).digest("base64url");

export const signDriveLink = (key: SourceKey, fileId: string, now = Date.now()) => {
  const expiresAt = now + DRIVE_LINK_TTL_MS;
  const claims: DriveLinkClaims = { o: key.organizationId, n: key.name, f: fileId, e: expiresAt };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { url: `${env.PUBLIC_URL}${DRIVE_FILES_PATH}/${payload}.${signature(payload)}`, expiresAt };
};

const sameSignature = (expected: string, received: string) => {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const verifyDriveLink = (token: string, now = Date.now()): Result<DriveLink> => {
  const [payload = "", received = ""] = token.split(".");
  if (!payload || !sameSignature(signature(payload), received)) return fail("NOT_FOUND", "Link inválido.");
  const parsed = attemptSync(
    () => JSON.parse(Buffer.from(payload, "base64url").toString()) as DriveLinkClaims,
    "NOT_FOUND",
  );
  if (parsed.error) return parsed;
  const { o, n, f, e } = parsed.data;
  if (typeof e !== "number" || e < now) return fail("NOT_FOUND", "Link expirado. Peça um novo.");
  return ok({ key: { organizationId: o, name: n }, fileId: f });
};
