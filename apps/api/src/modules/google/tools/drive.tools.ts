import { fail, ok } from "@runelay/shared";
import { z } from "zod";
import {
  DRIVE_READ_DEFAULT_BYTES,
  DRIVE_READ_MAX_BYTES,
  GOOGLE_API,
} from "@/modules/google/constants/google.constants";
import type { GoogleApi, GoogleRawResponse } from "@/modules/google/types/google.types";
import { signDriveLink } from "@/modules/google/utils/drive-link";
import { defineGoogleTool } from "@/modules/google/utils/google-tool";

const FILE_FIELDS = "id,name,mimeType,size,parents,modifiedTime,webViewLink";

const FOLDER_MIME = "application/vnd.google-apps.folder";

const GOOGLE_APPS_PREFIX = "application/vnd.google-apps.";

const SCOPE_NOTE =
  "With the default drive.file scope it only reaches files runelay created; a connection with its own OAuth client and the drive scope reaches the whole Drive.";

const DEFAULT_EXPORTS: Record<string, string> = {
  [`${GOOGLE_APPS_PREFIX}document`]: "text/plain",
  [`${GOOGLE_APPS_PREFIX}spreadsheet`]: "text/csv",
  [`${GOOGLE_APPS_PREFIX}presentation`]: "text/plain",
  [`${GOOGLE_APPS_PREFIX}drawing`]: "image/png",
};

const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|x-yaml|yaml|csv|sql|x-sh)|.*\+(json|xml)$)/;

const fileUrl = (fileId: string) => `${GOOGLE_API.driveFiles}/${encodeURIComponent(fileId)}`;

const quoted = (value: string) => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

const multipartBody = (
  boundary: string,
  metadata: unknown,
  mimeType: string,
  content: string,
  encoding: "text" | "base64",
) =>
  [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    ...(encoding === "base64" ? ["Content-Transfer-Encoding: base64"] : []),
    "",
    content,
    `--${boundary}--`,
    "",
  ].join("\r\n");

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

const getFile = (api: GoogleApi, fileId: string, fields = FILE_FIELDS) =>
  api<DriveFile>({ url: fileUrl(fileId), query: { fields, supportsAllDrives: true } });

const listQuery = (query: string | undefined, folderId: string | undefined, includeTrashed: boolean) =>
  [query, folderId ? `${quoted(folderId)} in parents` : undefined, includeTrashed ? undefined : "trashed = false"]
    .filter(Boolean)
    .map((part) => `(${part})`)
    .join(" and ");

export const driveTools = [
  defineGoogleTool({
    name: "create_file",
    description:
      "Upload a file of up to a few MB to Google Drive and return its id and link. Send text as is, or binary files (images, PDFs) as base64 with encoding base64. For bigger files use drive_upload_session. Scope: drive.file.",
    input: z.object({
      name: z.string().min(1),
      content: z.string(),
      mimeType: z.string().min(1).default("text/plain"),
      encoding: z.enum(["text", "base64"]).default("text"),
      parentId: z.string().min(1).optional().describe("Folder id. Defaults to My Drive's root."),
    }),
    run: (api, { name, content, mimeType, encoding, parentId }) => {
      const boundary = `runelay_${crypto.randomUUID()}`;
      const metadata = { name, mimeType, ...(parentId ? { parents: [parentId] } : {}) };
      return api({
        url: GOOGLE_API.driveUpload,
        method: "POST",
        query: { uploadType: "multipart", fields: FILE_FIELDS, supportsAllDrives: true },
        contentType: `multipart/related; boundary=${boundary}`,
        body: multipartBody(boundary, metadata, mimeType, content, encoding),
      });
    },
  }),
  defineGoogleTool({
    name: "list_files",
    description: `Search or list Google Drive files and folders, newest first. Filter with folderId and/or a Drive query such as "name contains 'reel'" or "mimeType contains 'video/'". Trashed files are left out unless includeTrashed. ${SCOPE_NOTE} Scope: drive.file.`,
    input: z.object({
      pageSize: z.number().int().min(1).max(100).default(20),
      query: z
        .string()
        .optional()
        .describe("Drive search query (q), see developers.google.com/drive/api/guides/search-files"),
      folderId: z.string().min(1).optional().describe("Only list what is directly inside this folder."),
      orderBy: z.string().default("modifiedTime desc"),
      includeTrashed: z.boolean().default(false),
      pageToken: z.string().optional(),
    }),
    run: (api, { pageSize, query, folderId, orderBy, includeTrashed, pageToken }) =>
      api({
        url: GOOGLE_API.driveFiles,
        query: {
          pageSize,
          q: listQuery(query, folderId, includeTrashed) || undefined,
          orderBy,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          fields: `nextPageToken,files(${FILE_FIELDS})`,
        },
      }),
  }),
  defineGoogleTool({
    name: "get_file",
    description: `Read a Drive file's metadata: name, type, size in bytes, parent folders and link. ${SCOPE_NOTE} Scope: drive.file.`,
    input: z.object({ fileId: z.string().min(1) }),
    run: (api, { fileId }) => getFile(api, fileId),
  }),
  defineGoogleTool({
    name: "read_file",
    description: `Read a Drive file's content. Text comes back as text, anything else as base64. Google Docs, Sheets and Slides are exported (plain text, CSV and plain text by default; pick another format with exportMimeType, such as application/pdf). Files over maxBytes fail: use drive_download_link for videos and other big files. ${SCOPE_NOTE} Scope: drive.file.`,
    input: z.object({
      fileId: z.string().min(1),
      exportMimeType: z.string().min(1).optional(),
      maxBytes: z.number().int().min(1).max(DRIVE_READ_MAX_BYTES).default(DRIVE_READ_DEFAULT_BYTES),
    }),
    run: async (api, { fileId, exportMimeType, maxBytes }) => {
      const meta = await getFile(api, fileId, "id,name,mimeType,size");
      if (meta.error) return meta;
      const { name, mimeType, size } = meta.data;
      const isGoogleApp = mimeType.startsWith(GOOGLE_APPS_PREFIX);
      const format = exportMimeType ?? (isGoogleApp ? DEFAULT_EXPORTS[mimeType] : undefined);
      if (isGoogleApp && !format) {
        return fail("INVALID_INPUT", `${mimeType} não tem formato padrão de exportação. Envie exportMimeType.`);
      }
      if (!isGoogleApp && Number(size ?? 0) > maxBytes) {
        return fail(
          "INVALID_INPUT",
          `${name} tem ${size} bytes, mais que maxBytes (${maxBytes}). Use drive_download_link para baixar.`,
        );
      }
      const content = await api<GoogleRawResponse>(
        format
          ? { url: `${fileUrl(fileId)}/export`, query: { mimeType: format }, raw: true }
          : { url: fileUrl(fileId), query: { alt: "media", supportsAllDrives: true }, raw: true },
      );
      if (content.error) return content;
      const { bytes } = content.data;
      if (bytes.byteLength > maxBytes) {
        return fail("INVALID_INPUT", `${name} passou de maxBytes (${maxBytes}) ao exportar. Aumente maxBytes.`);
      }
      const type = format ?? mimeType;
      const text = TEXT_TYPES.test(type);
      return ok({
        id: fileId,
        name,
        mimeType: type,
        size: bytes.byteLength,
        encoding: text ? "text" : "base64",
        content: text ? new TextDecoder().decode(bytes) : Buffer.from(bytes).toString("base64"),
      });
    },
  }),
  defineGoogleTool({
    name: "download_link",
    description:
      "Get a temporary link (valid for one hour) that downloads a Drive file of any size with a plain GET, for example curl -L -o video.mp4 '<url>'. The link itself is the credential, so do not share it. Use it for videos and other files too big for drive_read_file. Scope: drive.file.",
    input: z.object({ fileId: z.string().min(1) }),
    run: async (api, { fileId }, { key }) => {
      const meta = await getFile(api, fileId, "id,name,mimeType,size");
      if (meta.error) return meta;
      if (meta.data.mimeType.startsWith(GOOGLE_APPS_PREFIX)) {
        return fail(
          "INVALID_INPUT",
          "Docs, Sheets e Slides não baixam direto: use drive_read_file com exportMimeType.",
        );
      }
      const { url, expiresAt } = signDriveLink(key, fileId);
      return ok({ ...meta.data, url, expiresAt: new Date(expiresAt).toISOString() });
    },
  }),
  defineGoogleTool({
    name: "upload_session",
    description:
      "Start an upload of a file of any size and return an uploadUrl. Send the bytes with one PUT to that URL, no auth header needed, for example curl -X PUT -T video.mp4 '<uploadUrl>'. The response of that PUT is the new file. The URL works for a week and is the credential, so do not share it. Scope: drive.file.",
    input: z.object({
      name: z.string().min(1),
      mimeType: z.string().min(1).default("application/octet-stream"),
      parentId: z.string().min(1).optional().describe("Folder id. Defaults to My Drive's root."),
      size: z.number().int().min(0).optional().describe("File size in bytes, if known."),
    }),
    run: async (api, { name, mimeType, parentId, size }) => {
      const started = await api<GoogleRawResponse>({
        url: GOOGLE_API.driveUpload,
        method: "POST",
        query: { uploadType: "resumable", fields: FILE_FIELDS, supportsAllDrives: true },
        json: { name, mimeType, ...(parentId ? { parents: [parentId] } : {}) },
        headers: {
          "x-upload-content-type": mimeType,
          ...(size !== undefined ? { "x-upload-content-length": String(size) } : {}),
        },
        raw: true,
      });
      if (started.error) return started;
      if (!started.data.location) return fail("TOOL_FAILED", "Google não devolveu o endereço de envio.");
      return ok({ uploadUrl: started.data.location, method: "PUT", contentType: mimeType });
    },
  }),
  defineGoogleTool({
    name: "create_folder",
    description: "Create a folder in Google Drive and return its id and link. Scope: drive.file.",
    input: z.object({
      name: z.string().min(1),
      parentId: z.string().min(1).optional().describe("Parent folder id. Defaults to My Drive's root."),
    }),
    run: (api, { name, parentId }) =>
      api({
        url: GOOGLE_API.driveFiles,
        method: "POST",
        query: { fields: FILE_FIELDS, supportsAllDrives: true },
        json: { name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) },
      }),
  }),
  defineGoogleTool({
    name: "update_file",
    description: `Rename, move, trash or restore a Drive file or folder. To move, pass addParentId with the new folder and removeParentId with the old one (see drive_get_file for parents). ${SCOPE_NOTE} Scope: drive.file.`,
    input: z
      .object({
        fileId: z.string().min(1),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        addParentId: z.string().min(1).optional(),
        removeParentId: z.string().min(1).optional(),
        trashed: z.boolean().optional(),
      })
      .refine(
        ({ name, description, addParentId, removeParentId, trashed }) =>
          [name, description, addParentId, removeParentId, trashed].some((value) => value !== undefined),
        "Envie pelo menos uma mudança",
      ),
    run: (api, { fileId, name, description, addParentId, removeParentId, trashed }) =>
      api({
        url: fileUrl(fileId),
        method: "PATCH",
        query: { addParents: addParentId, removeParents: removeParentId, fields: FILE_FIELDS, supportsAllDrives: true },
        json: { name, description, trashed },
      }),
  }),
];
