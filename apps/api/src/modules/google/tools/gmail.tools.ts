import { fail, ok, type Result } from "@runelay/shared";
import { z } from "zod";
import {
  GMAIL_BODY_LIMIT,
  GMAIL_METADATA_CONCURRENCY,
  GMAIL_SEARCH_DEFAULT,
  GMAIL_SEARCH_MAX,
  GOOGLE_API,
} from "@/modules/google/constants/google.constants";
import type { GoogleApi, GoogleRequest } from "@/modules/google/types/google.types";
import { defineGoogleTool } from "@/modules/google/utils/google-tool";

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailPart;
}

interface GmailLabel {
  id: string;
  name?: string;
  type?: string;
}

interface GmailThread {
  id: string;
  snippet?: string;
  messages?: GmailMessage[];
}

const READ_SCOPE = "Scope: gmail.readonly or gmail.modify (connect with your own OAuth client).";

const MODIFY_SCOPE = "Scope: gmail.modify (connect with your own OAuth client).";

const REPLY_SCOPE = "Scopes: gmail.send plus gmail.modify or gmail.readonly (connect with your own OAuth client).";

const INSUFFICIENT_SCOPE = /insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i;

const SUMMARY_HEADERS = ["Subject", "From", "Date"];

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

const recipients = z.union([z.email(), z.array(z.email()).min(1)]);

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

const headerOf = (part: GmailPart | undefined, name: string) =>
  part?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? null;

const partsOf = (part: GmailPart): GmailPart[] => [part, ...(part.parts ?? []).flatMap(partsOf)];

const decodePart = (part: GmailPart) => {
  const bytes = Buffer.from(part.body?.data ?? "", "base64url");
  const charset = headerOf(part, "Content-Type")?.match(/charset="?([^";\s]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset as ConstructorParameters<typeof TextDecoder>[0]).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
};

const SKIPPED_TAGS = new Set(["script", "style", "head"]);

const BREAK_TAGS = new Set(["p", "div", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"]);

const stripTags = (html: string) => {
  let skipping: string | null = null;
  return html
    .split("<")
    .map((chunk, index) => {
      if (index === 0) return chunk;
      const end = chunk.indexOf(">");
      if (end === -1) return skipping ? "" : chunk;
      const tag = chunk.slice(0, end).trim().toLowerCase();
      const closing = tag.startsWith("/");
      const [name = ""] = tag.slice(closing ? 1 : 0).split(/[\s/]/);
      if (skipping) {
        if (closing && name === skipping) skipping = null;
        return "";
      }
      if (!closing && SKIPPED_TAGS.has(name)) {
        skipping = name;
        return "";
      }
      const rest = chunk.slice(end + 1);
      return name === "br" || (closing && BREAK_TAGS.has(name)) ? `\n${rest}` : rest;
    })
    .join("");
};

const htmlToText = (html: string) =>
  stripTags(html)
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? entity;
      const point = code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    })
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const messageBody = (payload: GmailPart | undefined, limit = GMAIL_BODY_LIMIT) => {
  const parts = payload ? partsOf(payload).filter((part) => !part.filename && part.body?.data) : [];
  const ofType = (mimeType: string) => parts.filter((part) => part.mimeType?.toLowerCase() === mimeType);
  const plain = ofType("text/plain");
  const text = plain.length
    ? plain.map(decodePart).join("\n\n").trim()
    : ofType("text/html")
        .map((part) => htmlToText(decodePart(part)))
        .join("\n\n");
  return { body: text.slice(0, limit), truncated: text.length > limit };
};

export const readMessage = ({ id, threadId, labelIds, snippet, payload }: GmailMessage) => ({
  id,
  threadId: threadId ?? null,
  from: headerOf(payload, "From"),
  to: headerOf(payload, "To"),
  cc: headerOf(payload, "Cc"),
  date: headerOf(payload, "Date"),
  subject: headerOf(payload, "Subject"),
  labelIds: labelIds ?? [],
  snippet: snippet ?? null,
  ...messageBody(payload),
});

const gmailCall = async <T>(
  api: GoogleApi,
  request: GoogleRequest,
  needs = "Reading Gmail needs the gmail.readonly or gmail.modify scope",
): Promise<Result<T>> => {
  const result = await api<T>(request);
  if (!result.error || !INSUFFICIENT_SCOPE.test(result.error.message)) return result;
  return fail(
    "TOOL_FAILED",
    `${result.error.message} ${needs}: reconnect Gmail with your own OAuth client and grant it.`,
    result.error.details,
  );
};

const gmailRead = <T>(api: GoogleApi, request: GoogleRequest) => gmailCall<T>(api, request);

const gmailModify = <T>(api: GoogleApi, request: GoogleRequest) =>
  gmailCall<T>(api, request, "Changing Gmail labels needs the gmail.modify scope");

const threadUrl = (threadId: string) => `${GOOGLE_API.gmail}/threads/${encodeURIComponent(threadId)}`;

const summaryUrl = (threadId: string) =>
  `${threadUrl(threadId)}?${SUMMARY_HEADERS.map((header) => `metadataHeaders=${header}`).join("&")}`;

const threadSummary = async (api: GoogleApi, { id, snippet }: GmailThread) => {
  const thread = await gmailRead<GmailThread>(api, {
    url: summaryUrl(id),
    query: { format: "metadata", fields: "messages(id,labelIds,snippet,payload/headers)" },
  });
  const messages = thread.data?.messages ?? [];
  const latest = messages.at(-1);
  return {
    id,
    messageCount: messages.length || null,
    subject: headerOf(latest?.payload, "Subject"),
    from: headerOf(latest?.payload, "From"),
    date: headerOf(latest?.payload, "Date"),
    snippet: latest?.snippet ?? snippet ?? null,
    labelIds: latest?.labelIds ?? [],
  };
};

const summarize = async (api: GoogleApi, threads: GmailThread[]) => {
  const summaries: Awaited<ReturnType<typeof threadSummary>>[] = [];
  for (let start = 0; start < threads.length; start += GMAIL_METADATA_CONCURRENCY) {
    const batch = threads.slice(start, start + GMAIL_METADATA_CONCURRENCY);
    summaries.push(...(await Promise.all(batch.map((thread) => threadSummary(api, thread)))));
  }
  return summaries;
};

const messageUrl = (messageId: string) => `${GOOGLE_API.gmail}/messages/${encodeURIComponent(messageId)}`;

const messageMetadata = (api: GoogleApi, messageId: string) =>
  gmailRead<GmailMessage>(api, { url: messageUrl(messageId), query: { format: "metadata" } });

const messageSummary = ({ id, threadId, labelIds, snippet, payload }: GmailMessage) => ({
  id,
  threadId: threadId ?? null,
  from: headerOf(payload, "From"),
  to: headerOf(payload, "To"),
  subject: headerOf(payload, "Subject"),
  date: headerOf(payload, "Date"),
  snippet: snippet ?? "",
  labelIds: labelIds ?? [],
  unread: (labelIds ?? []).includes("UNREAD"),
});

export const replySubject = (subject: string | null | undefined) => {
  const base = (subject ?? "").trim();
  return /^re:/i.test(base) ? base : `Re: ${base}`.trim();
};

const listLabels = (api: GoogleApi) => gmailRead<{ labels?: GmailLabel[] }>(api, { url: `${GOOGLE_API.gmail}/labels` });

const resolveLabels = async (api: GoogleApi, names: string[], create: boolean): Promise<Result<string[]>> => {
  if (names.length === 0) return ok([]);
  const listed = await listLabels(api);
  if (listed.error) return listed;
  const labels = listed.data.labels ?? [];
  const ids: string[] = [];
  for (const name of names) {
    const found = labels.find((label) => label.id === name || label.name?.toLowerCase() === name.toLowerCase());
    if (found) {
      ids.push(found.id);
      continue;
    }
    if (!create) return fail("INVALID_INPUT", `Marcador não encontrado: ${name}`);
    const created = await gmailModify<GmailLabel>(api, {
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
    name: "search_threads",
    description: `Search Gmail threads with Gmail search syntax in q (e.g. "from:ana is:unread newer_than:7d"). Returns each thread's id with the subject, sender, date and snippet of its latest message, plus nextPageToken. ${READ_SCOPE}`,
    input: z.object({
      q: z.string().min(1).optional(),
      maxResults: z.number().int().min(1).max(50).default(20),
      pageToken: z.string().optional(),
      includeSpamTrash: z.boolean().default(false),
    }),
    run: async (api, { q, maxResults, pageToken, includeSpamTrash }) => {
      const listed = await gmailRead<{ threads?: GmailThread[]; nextPageToken?: string }>(api, {
        url: `${GOOGLE_API.gmail}/threads`,
        query: { q, maxResults, pageToken, includeSpamTrash },
      });
      if (listed.error) return listed;
      return ok({
        threads: await summarize(api, listed.data.threads ?? []),
        nextPageToken: listed.data.nextPageToken ?? null,
      });
    },
  }),
  defineGoogleTool({
    name: "get_thread",
    description: `Read a Gmail thread: every message with from, to, cc, date, subject, labels, snippet and its plain-text body (HTML-only mail is converted to text, bodies over ${GMAIL_BODY_LIMIT} characters are truncated). ${READ_SCOPE}`,
    input: z.object({ threadId: z.string().min(1) }),
    run: async (api, { threadId }) => {
      const thread = await gmailRead<GmailThread>(api, { url: threadUrl(threadId), query: { format: "full" } });
      if (thread.error) return thread;
      return ok({ id: thread.data.id, messages: (thread.data.messages ?? []).map(readMessage) });
    },
  }),
  defineGoogleTool({
    name: "get_message",
    description: `Read one Gmail message with from, to, cc, date, subject, labels, snippet and its plain-text body (truncated over ${GMAIL_BODY_LIMIT} characters). ${READ_SCOPE}`,
    input: z.object({ messageId: z.string().min(1) }),
    run: async (api, { messageId }) => {
      const message = await gmailRead<GmailMessage>(api, {
        url: `${GOOGLE_API.gmail}/messages/${encodeURIComponent(messageId)}`,
        query: { format: "full" },
      });
      if (message.error) return message;
      return ok(readMessage(message.data));
    },
  }),
  defineGoogleTool({
    name: "list_labels",
    description: `List the Gmail labels (system and user) with their ids, to use in search_threads queries. ${READ_SCOPE}`,
    input: z.object({}),
    run: async (api) => {
      const listed = await gmailRead<{ labels?: { id: string; name?: string; type?: string }[] }>(api, {
        url: `${GOOGLE_API.gmail}/labels`,
      });
      if (listed.error) return listed;
      return ok({
        labels: (listed.data.labels ?? []).map(({ id, name, type }) => ({
          id,
          name: name ?? null,
          type: type ?? null,
        })),
      });
    },
  }),
  defineGoogleTool({
    name: "search_messages",
    description: `Search the mailbox with Gmail search syntax (e.g. "in:inbox is:unread", "from:ana@example.com newer_than:7d") and return id, threadId, from, to, subject, date, snippet and labels of each message, newest first. ${READ_SCOPE}`,
    input: z.object({
      query: z.string().default("in:inbox"),
      maxResults: z.number().int().min(1).max(GMAIL_SEARCH_MAX).default(GMAIL_SEARCH_DEFAULT),
      pageToken: z.string().optional(),
      includeSpamTrash: z.boolean().default(false),
    }),
    run: async (api, { query, maxResults, pageToken, includeSpamTrash }) => {
      const listed = await gmailRead<{
        messages?: { id: string }[];
        nextPageToken?: string;
        resultSizeEstimate?: number;
      }>(api, { url: `${GOOGLE_API.gmail}/messages`, query: { q: query, maxResults, pageToken, includeSpamTrash } });
      if (listed.error) return listed;
      const ids = (listed.data.messages ?? []).map((message) => message.id);
      const messages: ReturnType<typeof messageSummary>[] = [];
      for (let start = 0; start < ids.length; start += GMAIL_METADATA_CONCURRENCY) {
        const batch = ids.slice(start, start + GMAIL_METADATA_CONCURRENCY);
        const found = await Promise.all(batch.map((id) => messageMetadata(api, id)));
        for (const result of found) {
          if (result.error) return result;
          messages.push(messageSummary(result.data));
        }
      }
      return ok({
        messages,
        nextPageToken: listed.data.nextPageToken ?? null,
        resultSizeEstimate: listed.data.resultSizeEstimate ?? 0,
      });
    },
  }),
  defineGoogleTool({
    name: "reply",
    description: `Reply in plain text to an email, in the same thread: goes to Reply-To (or From) of the original, keeps the subject with "Re:" and sets In-Reply-To and References. replyAll also copies the original To and Cc, except the connected account. ${REPLY_SCOPE}`,
    input: z.object({
      messageId: z.string().min(1),
      body: z.string().min(1),
      replyAll: z.boolean().default(false),
      cc: recipients.optional(),
    }),
    run: async (api, input) => {
      const original = await messageMetadata(api, input.messageId);
      if (original.error) return original;
      const { payload, threadId } = original.data;
      const to = headerOf(payload, "Reply-To") ?? headerOf(payload, "From");
      if (!to) return fail("TOOL_FAILED", "A mensagem original não tem remetente para responder.");
      const me = await api<{ emailAddress?: string }>({ url: `${GOOGLE_API.gmail}/profile` });
      const myAddress = me.error ? "" : (me.data.emailAddress ?? "").toLowerCase();
      const others = input.replyAll
        ? [headerOf(payload, "To"), headerOf(payload, "Cc")]
            .flatMap((list) => (list ?? "").split(","))
            .map((address) => address.trim())
            .filter((address) => address && !address.toLowerCase().includes(myAddress || "\u0000"))
        : [];
      const cc = [...others, ...[input.cc ?? []].flat()];
      const messageIdHeader = headerOf(payload, "Message-ID");
      const references = [headerOf(payload, "References"), messageIdHeader].filter(Boolean).join(" ");
      const raw = buildRawMessage({
        to,
        cc: cc.length ? cc : undefined,
        subject: replySubject(headerOf(payload, "Subject")),
        body: input.body,
        headers: messageIdHeader ? { "In-Reply-To": messageIdHeader, References: references } : undefined,
      });
      return api({ url: GOOGLE_API.gmailSend, method: "POST", json: { raw, threadId } });
    },
  }),
  defineGoogleTool({
    name: "modify_labels",
    description: `Change labels of one or more emails: mark as read or unread, archive (take out of the inbox), and add or remove labels by name or id (missing labels are created when createMissing is true). ${MODIFY_SCOPE}`,
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
      const done = await gmailModify(api, {
        url: `${GOOGLE_API.gmail}/messages/batchModify`,
        method: "POST",
        json: { ids: input.messageIds, addLabelIds, removeLabelIds },
      });
      return done.error ? done : ok({ modified: input.messageIds.length, addLabelIds, removeLabelIds });
    },
  }),
];
