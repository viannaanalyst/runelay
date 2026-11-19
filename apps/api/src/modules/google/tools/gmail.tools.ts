import { fail, ok } from "@runelay/shared";
import { z } from "zod";
import {
  GMAIL_BODY_MAX_CHARS,
  GMAIL_SEARCH_DEFAULT,
  GMAIL_SEARCH_MAX,
  GOOGLE_API,
} from "@/modules/google/constants/google.constants";
import type { GoogleApi } from "@/modules/google/types/google.types";
import { defineGoogleTool } from "@/modules/google/utils/google-tool";

const recipients = z.union([z.email(), z.array(z.email()).min(1)]);

const READ_SCOPE =
  "Scope: gmail.modify (or gmail.readonly to only read). The default runelay client only grants gmail.send, so this needs a connection with its own OAuth client that asks for gmail.modify.";

const headerValue = (value: string | string[]) =>
  [value]
    .flat()
    .join(", ")
    .replace(/[\r\n]+/g, " ");

const encodeSubject = (subject: string) =>
  `=?UTF-8?B?${Buffer.from(subject.replace(/[\r\n]+/g, " ")).toString("base64")}?=`;

export const buildRawMessage = (message: {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  body: string;
  headers?: Record<string, string>;
}) =>
  Buffer.from(
    [
      `To: ${headerValue(message.to)}`,
      ...(message.cc ? [`Cc: ${headerValue(message.cc)}`] : []),
      `Subject: ${encodeSubject(message.subject)}`,
      ...Object.entries(message.headers ?? {}).map(([name, value]) => `${name}: ${headerValue(value)}`),
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(message.body).toString("base64"),
    ].join("\r\n"),
  ).toString("base64url");

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}

interface GmailLabel {
  id: string;
  name: string;
  type?: string;
}

const messageUrl = (id: string) => `${GOOGLE_API.gmail}/messages/${encodeURIComponent(id)}`;

const header = (message: GmailMessage, name: string) =>
  message.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

const decode = (data: string | undefined) => (data ? Buffer.from(data, "base64url").toString("utf8") : "");

const walk = (part: GmailPart | undefined, visit: (part: GmailPart) => void) => {
  if (!part) return;
  visit(part);
  for (const child of part.parts ?? []) walk(child, visit);
};

export const htmlToText = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

const clip = (text: string) =>
  text.length > GMAIL_BODY_MAX_CHARS ? `${text.slice(0, GMAIL_BODY_MAX_CHARS)}\n[…cortado]` : text;

const summary = (message: GmailMessage) => ({
  id: message.id,
  threadId: message.threadId,
  from: header(message, "From") ?? null,
  to: header(message, "To") ?? null,
  subject: header(message, "Subject") ?? null,
  date: header(message, "Date") ?? null,
  snippet: message.snippet ?? "",
  labelIds: message.labelIds ?? [],
  unread: (message.labelIds ?? []).includes("UNREAD"),
});

export const readMessage = (message: GmailMessage) => {
  let text = "";
  let html = "";
  const attachments: { filename: string; mimeType: string; size: number; attachmentId: string }[] = [];
  walk(message.payload, (part) => {
    if (part.filename && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: part.body.size ?? 0,
        attachmentId: part.body.attachmentId,
      });
      return;
    }
    if (part.mimeType === "text/plain" && !text) text = decode(part.body?.data);
    if (part.mimeType === "text/html" && !html) html = decode(part.body?.data);
  });
  return {
    ...summary(message),
    cc: header(message, "Cc") ?? null,
    replyTo: header(message, "Reply-To") ?? null,
    messageIdHeader: header(message, "Message-ID") ?? null,
    text: clip(text || htmlToText(html)),
    htmlAsText: html ? clip(htmlToText(html)) : null,
    attachments,
  };
};

const getMessage = (api: GoogleApi, id: string, format: "full" | "metadata") =>
  api<GmailMessage>({ url: messageUrl(id), query: { format } });

export const replySubject = (subject: string | undefined) => {
  const base = (subject ?? "").trim();
  return /^re:/i.test(base) ? base : `Re: ${base}`.trim();
};

const listLabels = (api: GoogleApi) => api<{ labels?: GmailLabel[] }>({ url: `${GOOGLE_API.gmail}/labels` });

const resolveLabels = async (api: GoogleApi, names: string[], create: boolean) => {
  if (names.length === 0) return ok<string[]>([]);
  const listed = await listLabels(api);
  if (listed.error) return listed;
  const labels = listed.data.labels ?? [];
  const ids: string[] = [];
  for (const name of names) {
    const found = labels.find((l) => l.id === name || l.name.toLowerCase() === name.toLowerCase());
    if (found) {
      ids.push(found.id);
      continue;
    }
    if (!create) return fail("INVALID_INPUT", `Marcador não encontrado: ${name}`);
    const created = await api<GmailLabel>({
      url: `${GOOGLE_API.gmail}/labels`,
      method: "POST",
      json: { name, labelListVisibility: "labelShow", messageListVisibility: "show" },
    });
    if (created.error) return created;
    ids.push(created.data.id);
  }
  return ok(ids);
};

export const gmailTools = [
  defineGoogleTool({
    name: "send_email",
    description: "Send a plain-text email from the connected Gmail account. Scope: gmail.send.",
    input: z.object({ to: recipients, subject: z.string(), body: z.string(), cc: recipients.optional() }),
    run: (api, message) => api({ url: GOOGLE_API.gmailSend, method: "POST", json: { raw: buildRawMessage(message) } }),
  }),
  defineGoogleTool({
    name: "search_messages",
    description: `Search the mailbox with Gmail search syntax (e.g. "in:inbox is:unread", "from:ana@example.com newer_than:7d") and return id, threadId, from, subject, date and snippet of each message, newest first. ${READ_SCOPE}`,
    input: z.object({
      query: z.string().default("in:inbox"),
      maxResults: z.number().int().min(1).max(GMAIL_SEARCH_MAX).default(GMAIL_SEARCH_DEFAULT),
      pageToken: z.string().optional(),
      includeSpamTrash: z.boolean().default(false),
    }),
    run: async (api, input) => {
      const listed = await api<{ messages?: { id: string }[]; nextPageToken?: string; resultSizeEstimate?: number }>({
        url: `${GOOGLE_API.gmail}/messages`,
        query: {
          q: input.query,
          maxResults: input.maxResults,
          pageToken: input.pageToken,
          includeSpamTrash: input.includeSpamTrash,
        },
      });
      if (listed.error) return listed;
      const found = await Promise.all((listed.data.messages ?? []).map((m) => getMessage(api, m.id, "metadata")));
      const failed = found.find((r) => r.error);
      if (failed?.error) return failed;
      return ok({
        messages: found.map((r) => summary(r.data as GmailMessage)),
        nextPageToken: listed.data.nextPageToken ?? null,
        resultSizeEstimate: listed.data.resultSizeEstimate ?? 0,
      });
    },
  }),
  defineGoogleTool({
    name: "get_message",
    description: `Read one email: headers, the body as plain text (HTML turned into text when there is no text part) and the list of attachments. ${READ_SCOPE}`,
    input: z.object({ messageId: z.string().min(1) }),
    run: async (api, { messageId }) => {
      const message = await getMessage(api, messageId, "full");
      return message.error ? message : ok(readMessage(message.data));
    },
  }),
  defineGoogleTool({
    name: "get_thread",
    description: `Read a whole conversation (thread), oldest message first, each with headers and plain-text body. ${READ_SCOPE}`,
    input: z.object({ threadId: z.string().min(1) }),
    run: async (api, { threadId }) => {
      const thread = await api<{ id: string; messages?: GmailMessage[] }>({
        url: `${GOOGLE_API.gmail}/threads/${encodeURIComponent(threadId)}`,
        query: { format: "full" },
      });
      if (thread.error) return thread;
      return ok({ threadId: thread.data.id, messages: (thread.data.messages ?? []).map(readMessage) });
    },
  }),
  defineGoogleTool({
    name: "reply",
    description: `Reply in plain text to an email, in the same thread: goes to Reply-To (or From) of the original, keeps the subject with "Re:" and sets In-Reply-To and References. replyAll also copies the original To and Cc, except the connected account. ${READ_SCOPE}`,
    input: z.object({
      messageId: z.string().min(1),
      body: z.string().min(1),
      replyAll: z.boolean().default(false),
      cc: recipients.optional(),
    }),
    run: async (api, input) => {
      const original = await getMessage(api, input.messageId, "metadata");
      if (original.error) return original;
      const message = original.data;
      const to = header(message, "Reply-To") ?? header(message, "From");
      if (!to) return fail("TOOL_FAILED", "A mensagem original não tem remetente para responder.");
      const me = await api<{ emailAddress?: string }>({ url: `${GOOGLE_API.gmail}/profile` });
      const myAddress = me.error ? "" : (me.data.emailAddress ?? "").toLowerCase();
      const others = input.replyAll
        ? [header(message, "To"), header(message, "Cc")]
            .filter(Boolean)
            .flatMap((list) => (list as string).split(","))
            .map((address) => address.trim())
            .filter((address) => address && !address.toLowerCase().includes(myAddress || "\u0000"))
        : [];
      const extraCc = [input.cc ?? []].flat();
      const cc = [...others, ...extraCc];
      const messageIdHeader = header(message, "Message-ID");
      const references = [header(message, "References"), messageIdHeader].filter(Boolean).join(" ");
      const raw = buildRawMessage({
        to,
        cc: cc.length ? cc : undefined,
        subject: replySubject(header(message, "Subject")),
        body: input.body,
        headers: messageIdHeader ? { "In-Reply-To": messageIdHeader, References: references } : undefined,
      });
      return api({ url: GOOGLE_API.gmailSend, method: "POST", json: { raw, threadId: message.threadId } });
    },
  }),
  defineGoogleTool({
    name: "modify_labels",
    description: `Change labels of one or more emails: mark as read or unread, archive (take out of the inbox), and add or remove labels by name or id (missing labels are created when createMissing is true). ${READ_SCOPE}`,
    input: z.object({
      messageIds: z.array(z.string().min(1)).min(1).max(1000),
      markRead: z.boolean().optional(),
      archive: z.boolean().optional(),
      addLabels: z.array(z.string().min(1)).default([]),
      removeLabels: z.array(z.string().min(1)).default([]),
      createMissing: z.boolean().default(true),
    }),
    run: async (api, input) => {
      const added = await resolveLabels(api, input.addLabels, input.createMissing);
      if (added.error) return added;
      const removed = await resolveLabels(api, input.removeLabels, false);
      if (removed.error) return removed;
      const addLabelIds = [...added.data, ...(input.markRead === false ? ["UNREAD"] : [])];
      const removeLabelIds = [
        ...removed.data,
        ...(input.markRead ? ["UNREAD"] : []),
        ...(input.archive ? ["INBOX"] : []),
      ];
      if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
        return fail("INVALID_INPUT", "Nada para mudar: use markRead, archive, addLabels ou removeLabels.");
      }
      const done = await api({
        url: `${GOOGLE_API.gmail}/messages/batchModify`,
        method: "POST",
        json: { ids: input.messageIds, addLabelIds, removeLabelIds },
      });
      return done.error ? done : ok({ modified: input.messageIds.length, addLabelIds, removeLabelIds });
    },
  }),
  defineGoogleTool({
    name: "list_labels",
    description: `List the labels of the mailbox (system ones like INBOX and UNREAD, and the user's), with id and name. ${READ_SCOPE}`,
    input: z.object({}),
    run: async (api) => {
      const listed = await listLabels(api);
      if (listed.error) return listed;
      return ok({ labels: (listed.data.labels ?? []).map((l) => ({ id: l.id, name: l.name, type: l.type ?? null })) });
    },
  }),
];
