import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Tool } from "@/modules/connectors/types/connector.types";
import { connectGoogle } from "@/modules/google/clients/google.client";
import { GOOGLE_SERVICES } from "@/modules/google/constants/google.constants";
import { buildRawMessage, messageBody, readMessage, replySubject } from "@/modules/google/tools/gmail.tools";
import { scopesFor } from "@/modules/google/utils/google-scopes";
import { updateOAuth, upsertSource } from "@/modules/sources/repositories/source.repository";
import { type FakeGoogle, startFakeGoogle } from "../../../../../test/google-helpers";
import { signUp } from "../../../../../test/helpers";

let google: FakeGoogle;
let restore: () => void;
let tools: Map<string, Tool>;
let close: () => Promise<void>;

beforeAll(async () => {
  google = startFakeGoogle();
  restore = google.install();
  const account = await signUp("Google Tools");
  const key = { organizationId: account.organizationId, name: "google" };
  upsertSource(account.organizationId, { name: "google", config: { kind: "google", services: GOOGLE_SERVICES } });
  updateOAuth(key, {
    tokens: { access_token: "tool-token", token_type: "Bearer" },
    google: { scopes: scopesFor(GOOGLE_SERVICES) },
  });
  const connection = await connectGoogle(key, { kind: "google", services: GOOGLE_SERVICES });
  if (connection.error) throw new Error(connection.error.message);
  tools = new Map(connection.data.tools.map((tool) => [tool.name, tool]));
  close = connection.data.close;
});

afterAll(async () => {
  await close();
  restore();
  google.stop();
});

const run = (name: string, args: Record<string, unknown> = {}) => {
  const tool = tools.get(name);
  if (!tool) throw new Error(`missing ${name}`);
  return tool.call(args);
};

const json = (body: string) => JSON.parse(body) as Record<string, unknown>;

test("every REST tool has a described input schema", () => {
  expect(tools.size).toBe(34);
  for (const tool of tools.values()) {
    expect(tool.source).toBe("google");
    expect(tool.description).toMatch(/Scopes?: /);
    expect(tool.inputSchema).toMatchObject({ type: "object" });
    expect(tool.inputSchema.$schema).toBeUndefined();
  }
});

test("account_whoami reads the userinfo endpoint", async () => {
  google.routes.set("GET openidconnect.googleapis.com/v1/userinfo", () => ({ body: { email: "ana@example.com" } }));
  expect((await run("account_whoami")).data).toEqual({ email: "ana@example.com", name: null, picture: null });
  expect(google.last().authorization).toBe("Bearer tool-token");
  google.routes.set("GET openidconnect.googleapis.com/v1/userinfo", () => ({ status: 401, body: {} }));
  expect((await run("account_whoami")).error?.code).toBe("TOOL_FAILED");
});

test("docs_create_document creates a document", async () => {
  google.routes.set("POST docs.googleapis.com/v1/documents", () => ({ body: { documentId: "doc1", title: "Ata" } }));
  const result = await run("docs_create_document", { title: "Ata" });
  expect(result.data).toEqual({
    documentId: "doc1",
    title: "Ata",
    url: "https://docs.google.com/document/d/doc1/edit",
  });
  expect(google.last()).toMatchObject({ method: "POST", contentType: "application/json" });
  expect(json(google.last().body)).toEqual({ title: "Ata" });
  google.routes.set("POST docs.googleapis.com/v1/documents", () => ({
    status: 403,
    body: { error: { message: "denied" } },
  }));
  expect((await run("docs_create_document", { title: "Ata" })).error?.message).toBe("Google: denied");
});

test("sheets_create_spreadsheet creates and fills the first sheet", async () => {
  google.routes.set("POST sheets.googleapis.com/v4/spreadsheets", () => ({
    body: { spreadsheetId: "s1", spreadsheetUrl: "https://sheet/s1", sheets: [{ properties: { title: "Página 1" } }] },
  }));
  const empty = await run("sheets_create_spreadsheet", { title: "Vendas" });
  expect(empty.data).toEqual({ spreadsheetId: "s1", url: "https://sheet/s1", updatedRows: 0 });
  expect(json(google.last().body)).toEqual({ properties: { title: "Vendas" } });

  const filled = await run("sheets_create_spreadsheet", {
    title: "Vendas",
    header: ["Nome", "Total"],
    rows: [["Ana", 3]],
  });
  expect(filled.data).toEqual({ spreadsheetId: "s1", url: "https://sheet/s1", updatedRows: 2 });
  const append = google.last();
  expect(append.method).toBe("POST");
  expect(decodeURIComponent(append.path)).toBe("/v4/spreadsheets/s1/values/'Página 1'!A1:append");
  expect(append.query.get("valueInputOption")).toBe("USER_ENTERED");
  expect(json(append.body)).toEqual({
    values: [
      ["Nome", "Total"],
      ["Ana", 3],
    ],
  });

  google.routes.set("POST sheets.googleapis.com/v4/spreadsheets", () => ({
    body: { spreadsheetId: "s2", spreadsheetUrl: "https://sheet/s2" },
  }));
  google.routes.set("POST sheets.googleapis.com/v4/spreadsheets/s2/values/'Sheet1'!A1:append", () => ({
    body: { updates: { updatedRows: 7 } },
  }));
  expect((await run("sheets_create_spreadsheet", { title: "X", rows: [["a"]] })).data).toMatchObject({
    updatedRows: 7,
  });
  google.routes.set("POST sheets.googleapis.com/v4/spreadsheets/s2/values/'Sheet1'!A1:append", () => ({ status: 400 }));
  expect((await run("sheets_create_spreadsheet", { title: "X", rows: [["a"]] })).error?.message).toBe(
    "Google: HTTP 400",
  );
  google.routes.set("POST sheets.googleapis.com/v4/spreadsheets", () => ({ status: 500, text: "boom" }));
  expect((await run("sheets_create_spreadsheet", { title: "X" })).error?.message).toBe("Google: boom");
});

test("slides_create_presentation creates slides with title and body and drops the blank one", async () => {
  google.routes.set("POST slides.googleapis.com/v1/presentations", () => ({
    body: { presentationId: "p1", slides: [{ objectId: "blank" }] },
  }));
  const bare = await run("slides_create_presentation", { title: "Deck" });
  expect(bare.data).toEqual({ presentationId: "p1", url: "https://docs.google.com/presentation/d/p1/edit", slides: 1 });

  const result = await run("slides_create_presentation", {
    title: "Deck",
    slides: [{ title: "Capa", body: "Olá" }, { title: "Fim" }],
  });
  expect(result.data).toMatchObject({ presentationId: "p1", slides: 2 });
  const update = google.last();
  expect(update.path).toBe("/v1/presentations/p1:batchUpdate");
  const { requests } = json(update.body) as { requests: Record<string, unknown>[] };
  expect(requests.map((request) => Object.keys(request)[0])).toEqual([
    "createSlide",
    "insertText",
    "insertText",
    "createSlide",
    "insertText",
    "deleteObject",
  ]);
  expect(requests[0]).toMatchObject({
    createSlide: { objectId: "runelay_slide_0", slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" } },
  });
  expect(requests[2]).toEqual({ insertText: { objectId: "runelay_slide_0_body", text: "Olá" } });
  expect(requests[5]).toEqual({ deleteObject: { objectId: "blank" } });

  google.routes.set("POST slides.googleapis.com/v1/presentations", () => ({ body: { presentationId: "p2" } }));
  expect((await run("slides_create_presentation", { title: "Deck" })).data).toMatchObject({ slides: 0 });
  google.routes.set("POST slides.googleapis.com/v1/presentations/p2:batchUpdate", () => ({ status: 400 }));
  expect((await run("slides_create_presentation", { title: "D", slides: [{ title: "a" }] })).error).toBeTruthy();
  google.routes.set("POST slides.googleapis.com/v1/presentations", () => ({ status: 403 }));
  expect((await run("slides_create_presentation", { title: "D" })).error).toBeTruthy();
});

test("calendar_list_calendars maps the calendar list", async () => {
  google.routes.set("GET www.googleapis.com/calendar/v3/users/me/calendarList", () => ({
    body: {
      items: [
        { id: "primary", summary: "Ana", primary: true, accessRole: "owner", timeZone: "America/Sao_Paulo" },
        { id: "team@group.calendar.google.com" },
      ],
    },
  }));
  expect((await run("calendar_list_calendars")).data).toEqual({
    calendars: [
      { id: "primary", summary: "Ana", primary: true, accessRole: "owner", timeZone: "America/Sao_Paulo" },
      { id: "team@group.calendar.google.com", summary: null, primary: false, accessRole: null, timeZone: null },
    ],
  });
  expect(google.last()).toMatchObject({ method: "GET", path: "/calendar/v3/users/me/calendarList" });
  google.routes.set("GET www.googleapis.com/calendar/v3/users/me/calendarList", () => ({ body: {} }));
  expect((await run("calendar_list_calendars")).data).toEqual({ calendars: [] });
  google.routes.set("GET www.googleapis.com/calendar/v3/users/me/calendarList", () => ({ status: 403 }));
  expect((await run("calendar_list_calendars")).error?.code).toBe("TOOL_FAILED");
});

test("calendar_list_events lists single events ordered by start time", async () => {
  google.routes.set("GET www.googleapis.com/calendar/v3/calendars/primary/events", () => ({
    body: {
      nextPageToken: "next",
      items: [
        {
          id: "e1",
          summary: "Daily",
          status: "confirmed",
          htmlLink: "https://calendar/e1",
          start: { dateTime: "2026-11-16T09:00:00-03:00" },
          end: { dateTime: "2026-11-16T09:15:00-03:00" },
          attendees: [{ email: "ana@example.com", responseStatus: "accepted" }, {}],
        },
        { id: "e2" },
      ],
    },
  }));
  const result = await run("calendar_list_events", {
    timeMin: "2026-11-16T00:00:00-03:00",
    timeMax: "2026-11-17T00:00:00Z",
    q: "Daily",
  });
  expect(result.data).toEqual({
    nextPageToken: "next",
    events: [
      {
        id: "e1",
        summary: "Daily",
        description: null,
        location: null,
        status: "confirmed",
        start: { dateTime: "2026-11-16T09:00:00-03:00" },
        end: { dateTime: "2026-11-16T09:15:00-03:00" },
        attendees: [
          { email: "ana@example.com", responseStatus: "accepted" },
          { email: null, responseStatus: null },
        ],
        htmlLink: "https://calendar/e1",
      },
      {
        id: "e2",
        summary: null,
        description: null,
        location: null,
        status: null,
        start: null,
        end: null,
        attendees: [],
        htmlLink: null,
      },
    ],
  });
  const list = google.last();
  expect(list).toMatchObject({ method: "GET", path: "/calendar/v3/calendars/primary/events" });
  expect(Object.fromEntries(list.query)).toEqual({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: "2026-11-16T00:00:00-03:00",
    timeMax: "2026-11-17T00:00:00Z",
    q: "Daily",
    maxResults: "25",
  });

  google.routes.set("GET www.googleapis.com/calendar/v3/calendars/team%40group.calendar.google.com/events", () => ({
    body: {},
  }));
  expect(
    (
      await run("calendar_list_events", {
        calendarId: "team@group.calendar.google.com",
        maxResults: 5,
        pageToken: "p2",
      })
    ).data,
  ).toEqual({ events: [], nextPageToken: null });
  expect(google.last().query.get("maxResults")).toBe("5");
  expect(google.last().query.get("pageToken")).toBe("p2");
  expect((await run("calendar_list_events", { maxResults: 251 })).error?.code).toBe("INVALID_INPUT");
  expect((await run("calendar_list_events", { timeMin: "amanhã" })).error?.code).toBe("INVALID_INPUT");
  google.routes.set("GET www.googleapis.com/calendar/v3/calendars/primary/events", () => ({ status: 404 }));
  expect((await run("calendar_list_events")).error?.code).toBe("TOOL_FAILED");
});

test("calendar_create_event sends timed and all-day events", async () => {
  google.routes.set("POST www.googleapis.com/calendar/v3/calendars/primary/events", () => ({
    body: { id: "e9", htmlLink: "https://calendar/e9" },
  }));
  const timed = await run("calendar_create_event", {
    summary: "Kickoff",
    description: "Pauta",
    location: "Sala 1",
    start: "2026-11-20T10:00:00",
    end: "2026-11-20T11:00:00",
    timeZone: "America/Sao_Paulo",
    attendees: ["ana@example.com"],
  });
  expect(timed.data).toEqual({ id: "e9", htmlLink: "https://calendar/e9" });
  expect(google.last()).toMatchObject({ method: "POST", contentType: "application/json" });
  expect(json(google.last().body)).toEqual({
    summary: "Kickoff",
    description: "Pauta",
    location: "Sala 1",
    start: { dateTime: "2026-11-20T10:00:00", timeZone: "America/Sao_Paulo" },
    end: { dateTime: "2026-11-20T11:00:00", timeZone: "America/Sao_Paulo" },
    attendees: [{ email: "ana@example.com" }],
  });

  google.routes.set("POST www.googleapis.com/calendar/v3/calendars/primary/events", () => ({ body: { id: "e10" } }));
  const allDay = await run("calendar_create_event", {
    summary: "Feriado",
    start: "2026-11-20",
    end: "2026-11-21T00:00:00-03:00",
  });
  expect(allDay.data).toEqual({ id: "e10", htmlLink: null });
  expect(json(google.last().body)).toEqual({
    summary: "Feriado",
    start: { date: "2026-11-20" },
    end: { dateTime: "2026-11-21T00:00:00-03:00" },
  });
  expect((await run("calendar_create_event", { summary: "x", start: "amanhã", end: "2026-11-21" })).error?.code).toBe(
    "INVALID_INPUT",
  );
  expect(
    (await run("calendar_create_event", { summary: "x", start: "2026-11-20", end: "2026-11-21", attendees: ["ana"] }))
      .error?.code,
  ).toBe("INVALID_INPUT");
  google.routes.set("POST www.googleapis.com/calendar/v3/calendars/primary/events", () => ({
    status: 400,
    body: { error: { message: "Invalid start time." } },
  }));
  expect(
    (await run("calendar_create_event", { summary: "x", start: "2026-11-20", end: "2026-11-21" })).error?.message,
  ).toBe("Google: Invalid start time.");
});

test("calendar_delete_event deletes the event", async () => {
  google.routes.set("DELETE www.googleapis.com/calendar/v3/calendars/primary/events/e1", () => ({ text: "" }));
  expect((await run("calendar_delete_event", { eventId: "e1" })).data).toEqual({ deleted: true, eventId: "e1" });
  expect(google.last()).toMatchObject({ method: "DELETE", path: "/calendar/v3/calendars/primary/events/e1" });
  google.routes.set("DELETE www.googleapis.com/calendar/v3/calendars/primary/events/e1", () => ({ status: 410 }));
  expect((await run("calendar_delete_event", { eventId: "e1" })).error?.code).toBe("TOOL_FAILED");
  expect((await run("calendar_delete_event", {})).error?.code).toBe("INVALID_INPUT");
});

test("docs_read_document returns the title and plain text", async () => {
  google.routes.set("GET docs.googleapis.com/v1/documents/doc1", () => ({
    body: {
      documentId: "doc1",
      title: "Ata",
      body: {
        content: [
          { sectionBreak: {} },
          { paragraph: { elements: [{ textRun: { content: "Olá " } }, { textRun: { content: "mundo\n" } }] } },
          { paragraph: { elements: [{ inlineObjectElement: {} }, { textRun: {} }] } },
          { paragraph: {} },
          { paragraph: { elements: [{ textRun: { content: "Fim\n" } }] } },
        ],
      },
    },
  }));
  expect((await run("docs_read_document", { documentId: "doc1" })).data).toEqual({
    documentId: "doc1",
    title: "Ata",
    url: "https://docs.google.com/document/d/doc1/edit",
    text: "Olá mundo\nFim\n",
  });
  expect(google.last()).toMatchObject({ method: "GET", path: "/v1/documents/doc1" });
  google.routes.set("GET docs.googleapis.com/v1/documents/doc2", () => ({ body: { documentId: "doc2" } }));
  expect((await run("docs_read_document", { documentId: "doc2" })).data).toMatchObject({ title: null, text: "" });
  google.routes.set("GET docs.googleapis.com/v1/documents/doc2", () => ({ status: 404 }));
  expect((await run("docs_read_document", { documentId: "doc2" })).error?.code).toBe("TOOL_FAILED");
});

test("docs_append_text inserts the text at the end of the body", async () => {
  expect((await run("docs_append_text", { documentId: "doc1", text: "Nova linha\n" })).data).toEqual({
    documentId: "doc1",
    url: "https://docs.google.com/document/d/doc1/edit",
  });
  const update = google.last();
  expect(update).toMatchObject({ method: "POST", path: "/v1/documents/doc1:batchUpdate" });
  expect(json(update.body)).toEqual({
    requests: [{ insertText: { text: "Nova linha\n", endOfSegmentLocation: {} } }],
  });
  google.routes.set("POST docs.googleapis.com/v1/documents/doc1:batchUpdate", () => ({ status: 400 }));
  expect((await run("docs_append_text", { documentId: "doc1", text: "x" })).error?.code).toBe("TOOL_FAILED");
  expect((await run("docs_append_text", { documentId: "doc1", text: "" })).error?.code).toBe("INVALID_INPUT");
});

test("sheets_get_values reads a range", async () => {
  google.routes.set("GET sheets.googleapis.com/v4/spreadsheets/s1/values/Vendas!A1%3AB2", () => ({
    body: {
      range: "Vendas!A1:B2",
      values: [
        ["Nome", "Total"],
        ["Ana", "3"],
      ],
    },
  }));
  expect((await run("sheets_get_values", { spreadsheetId: "s1", range: "Vendas!A1:B2" })).data).toEqual({
    range: "Vendas!A1:B2",
    values: [
      ["Nome", "Total"],
      ["Ana", "3"],
    ],
  });
  expect(google.last()).toMatchObject({ method: "GET" });
  expect(decodeURIComponent(google.last().path)).toBe("/v4/spreadsheets/s1/values/Vendas!A1:B2");
  google.routes.set("GET sheets.googleapis.com/v4/spreadsheets/s1/values/Vazia", () => ({ body: {} }));
  expect((await run("sheets_get_values", { spreadsheetId: "s1", range: "Vazia" })).data).toEqual({
    range: "Vazia",
    values: [],
  });
  google.routes.set("GET sheets.googleapis.com/v4/spreadsheets/s1/values/Vazia", () => ({ status: 400 }));
  expect((await run("sheets_get_values", { spreadsheetId: "s1", range: "Vazia" })).error?.code).toBe("TOOL_FAILED");
});

test("sheets_update_values overwrites a range as user entered", async () => {
  google.routes.set("PUT sheets.googleapis.com/v4/spreadsheets/s1/values/A1%3AB1", () => ({
    body: { updatedRange: "Sheet1!A1:B1", updatedRows: 1, updatedCells: 2 },
  }));
  const result = await run("sheets_update_values", { spreadsheetId: "s1", range: "A1:B1", rows: [["=1+1", true]] });
  expect(result.data).toEqual({ updatedRange: "Sheet1!A1:B1", updatedRows: 1, updatedCells: 2 });
  const update = google.last();
  expect(update.method).toBe("PUT");
  expect(update.query.get("valueInputOption")).toBe("USER_ENTERED");
  expect(json(update.body)).toEqual({ values: [["=1+1", true]] });
  google.routes.set("PUT sheets.googleapis.com/v4/spreadsheets/s1/values/A1%3AB1", () => ({ body: {} }));
  expect((await run("sheets_update_values", { spreadsheetId: "s1", range: "A1:B1", rows: [["a"]] })).data).toEqual({
    updatedRange: null,
    updatedRows: 0,
    updatedCells: 0,
  });
  expect((await run("sheets_update_values", { spreadsheetId: "s1", range: "A1", rows: [] })).error?.code).toBe(
    "INVALID_INPUT",
  );
  google.routes.set("PUT sheets.googleapis.com/v4/spreadsheets/s1/values/A1%3AB1", () => ({ status: 400 }));
  expect(
    (await run("sheets_update_values", { spreadsheetId: "s1", range: "A1:B1", rows: [["a"]] })).error,
  ).toBeTruthy();
});

test("sheets_append_rows appends rows after the table", async () => {
  google.routes.set("POST sheets.googleapis.com/v4/spreadsheets/s1/values/Vendas!A1:append", () => ({
    body: { updates: { updatedRange: "Vendas!A5:B6", updatedRows: 2, updatedCells: 4 } },
  }));
  const result = await run("sheets_append_rows", {
    spreadsheetId: "s1",
    range: "Vendas!A1",
    rows: [
      ["Bia", 4],
      ["Caio", 5],
    ],
  });
  expect(result.data).toEqual({ updatedRange: "Vendas!A5:B6", updatedRows: 2, updatedCells: 4 });
  const append = google.last();
  expect(append).toMatchObject({ method: "POST", path: "/v4/spreadsheets/s1/values/Vendas!A1:append" });
  expect(Object.fromEntries(append.query)).toEqual({
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
  });
  expect(json(append.body)).toEqual({
    values: [
      ["Bia", 4],
      ["Caio", 5],
    ],
  });
  google.routes.set("POST sheets.googleapis.com/v4/spreadsheets/s1/values/Vendas!A1:append", () => ({ body: {} }));
  expect((await run("sheets_append_rows", { spreadsheetId: "s1", range: "Vendas!A1", rows: [["x"]] })).data).toEqual({
    updatedRange: null,
    updatedRows: 0,
    updatedCells: 0,
  });
  google.routes.set("POST sheets.googleapis.com/v4/spreadsheets/s1/values/Vendas!A1:append", () => ({ status: 400 }));
  expect(
    (await run("sheets_append_rows", { spreadsheetId: "s1", range: "Vendas!A1", rows: [["x"]] })).error,
  ).toBeTruthy();
});

test("slides_read_presentation returns the text of each slide", async () => {
  google.routes.set("GET slides.googleapis.com/v1/presentations/p1", () => ({
    body: {
      presentationId: "p1",
      title: "Deck",
      slides: [
        {
          objectId: "s1",
          pageElements: [
            { shape: { text: { textElements: [{ paragraphMarker: {} }, { textRun: { content: "Capa\n" } }] } } },
            {
              shape: {
                text: {
                  textElements: [{ textRun: { content: "Olá " } }, { textRun: {} }, { textRun: { content: "time\n" } }],
                },
              },
            },
            { shape: {} },
            { image: {} },
          ],
        },
        { objectId: "s2" },
      ],
    },
  }));
  expect((await run("slides_read_presentation", { presentationId: "p1" })).data).toEqual({
    presentationId: "p1",
    title: "Deck",
    url: "https://docs.google.com/presentation/d/p1/edit",
    slides: [
      { objectId: "s1", text: "Capa\nOlá time" },
      { objectId: "s2", text: "" },
    ],
  });
  expect(google.last()).toMatchObject({ method: "GET", path: "/v1/presentations/p1" });
  google.routes.set("GET slides.googleapis.com/v1/presentations/p2", () => ({ body: { presentationId: "p2" } }));
  expect((await run("slides_read_presentation", { presentationId: "p2" })).data).toMatchObject({
    title: null,
    slides: [],
  });
  google.routes.set("GET slides.googleapis.com/v1/presentations/p2", () => ({ status: 404 }));
  expect((await run("slides_read_presentation", { presentationId: "p2" })).error?.code).toBe("TOOL_FAILED");
});

test("slides_add_slide creates a title-and-body slide with a unique id", async () => {
  google.routes.set("POST slides.googleapis.com/v1/presentations/p1:batchUpdate", () => ({ body: {} }));
  const result = await run("slides_add_slide", { presentationId: "p1", title: "Novo", body: "Texto", index: 1 });
  const { slideId } = result.data as { slideId: string };
  expect(slideId).toMatch(/^runelay_[0-9a-f]{32}$/);
  expect(result.data).toEqual({ presentationId: "p1", slideId, url: "https://docs.google.com/presentation/d/p1/edit" });
  const update = google.last();
  expect(update).toMatchObject({ method: "POST", path: "/v1/presentations/p1:batchUpdate" });
  expect(json(update.body)).toEqual({
    requests: [
      {
        createSlide: {
          objectId: slideId,
          insertionIndex: 1,
          slideLayoutReference: { predefinedLayout: "TITLE_AND_BODY" },
          placeholderIdMappings: [
            { layoutPlaceholder: { type: "TITLE", index: 0 }, objectId: `${slideId}_title` },
            { layoutPlaceholder: { type: "BODY", index: 0 }, objectId: `${slideId}_body` },
          ],
        },
      },
      { insertText: { objectId: `${slideId}_title`, text: "Novo" } },
      { insertText: { objectId: `${slideId}_body`, text: "Texto" } },
    ],
  });
  const appended = await run("slides_add_slide", { presentationId: "p1", title: "Fim" });
  const next = (appended.data as { slideId: string }).slideId;
  expect(next).not.toBe(slideId);
  const { requests } = json(google.last().body) as { requests: { createSlide?: Record<string, unknown> }[] };
  expect(requests).toHaveLength(2);
  expect(requests[0]?.createSlide).not.toHaveProperty("insertionIndex");
  google.routes.set("POST slides.googleapis.com/v1/presentations/p1:batchUpdate", () => ({ status: 400 }));
  expect((await run("slides_add_slide", { presentationId: "p1", title: "x" })).error?.code).toBe("TOOL_FAILED");
});

test("drive_create_file uploads a multipart body", async () => {
  await run("drive_create_file", { name: "notas.md", content: "# Oi", mimeType: "text/markdown" });
  const upload = google.last();
  expect(upload).toMatchObject({ method: "POST", host: "www.googleapis.com", path: "/upload/drive/v3/files" });
  expect(upload.query.get("uploadType")).toBe("multipart");
  const boundary = upload.contentType?.match(/^multipart\/related; boundary=(.+)$/)?.[1];
  expect(boundary).toBeTruthy();
  expect(upload.body).toBe(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{"name":"notas.md","mimeType":"text/markdown"}\r\n--${boundary}\r\nContent-Type: text/markdown\r\n\r\n# Oi\r\n--${boundary}--\r\n`,
  );
  await run("drive_create_file", { name: "a.txt", content: "x" });
  expect(google.last().body).toContain("Content-Type: text/plain");
  await run("drive_create_file", {
    name: "foto.png",
    content: "iVBORw0KGgo=",
    mimeType: "image/png",
    encoding: "base64",
    parentId: "folder1",
  });
  const binary = google.last().body;
  expect(binary).toContain('{"name":"foto.png","mimeType":"image/png","parents":["folder1"]}');
  expect(binary).toContain("Content-Type: image/png\r\nContent-Transfer-Encoding: base64\r\n\r\niVBORw0KGgo=");
});

test("drive_list_files searches without trashed files and can stay inside a folder", async () => {
  await run("drive_list_files", { query: "name contains 'x'" });
  const list = google.last();
  expect(list).toMatchObject({ method: "GET", path: "/drive/v3/files" });
  expect(list.query.get("pageSize")).toBe("20");
  expect(list.query.get("q")).toBe("(name contains 'x') and (trashed = false)");
  expect(list.query.get("orderBy")).toBe("modifiedTime desc");
  expect(list.query.has("pageToken")).toBe(false);
  expect(list.query.get("fields")).toBe("nextPageToken,files(id,name,mimeType,size,parents,modifiedTime,webViewLink)");
  await run("drive_list_files", { folderId: "it's", includeTrashed: true });
  expect(google.last().query.get("q")).toBe("('it\\'s' in parents)");
  await run("drive_list_files", { includeTrashed: true });
  expect(google.last().query.has("q")).toBe(false);
  expect(tools.get("drive_list_files")?.description).toContain("only reaches files runelay created");
});

test("drive_get_file, drive_create_folder and drive_update_file send the right requests", async () => {
  await run("drive_get_file", { fileId: "f1" });
  expect(google.last()).toMatchObject({ method: "GET", path: "/drive/v3/files/f1" });
  await run("drive_create_folder", { name: "Moradah", parentId: "root1" });
  expect(google.last()).toMatchObject({ method: "POST", path: "/drive/v3/files" });
  expect(json(google.last().body)).toEqual({
    name: "Moradah",
    mimeType: "application/vnd.google-apps.folder",
    parents: ["root1"],
  });
  await run("drive_update_file", { fileId: "f1", name: "novo.mp4", addParentId: "b", removeParentId: "a" });
  const moved = google.last();
  expect(moved).toMatchObject({ method: "PATCH", path: "/drive/v3/files/f1" });
  expect(moved.query.get("addParents")).toBe("b");
  expect(moved.query.get("removeParents")).toBe("a");
  expect(json(moved.body)).toEqual({ name: "novo.mp4" });
  expect((await run("drive_update_file", { fileId: "f1" })).error?.code).toBe("INVALID_INPUT");
});

test("drive_read_file returns text, base64 or a Docs export and refuses big files", async () => {
  const meta = (mimeType: string, size?: string) => () => ({ body: { id: "f1", name: "a", mimeType, size } });
  google.routes.set("GET www.googleapis.com/drive/v3/files/f1", (request) =>
    request.query.get("alt") === "media" ? { bytes: new Uint8Array([104, 105]) } : meta("text/plain", "2")(),
  );
  expect((await run("drive_read_file", { fileId: "f1" })).data).toMatchObject({ encoding: "text", content: "hi" });
  google.routes.set("GET www.googleapis.com/drive/v3/files/f1", (request) =>
    request.query.get("alt") === "media" ? { bytes: new Uint8Array([0, 255]) } : meta("image/png", "2")(),
  );
  expect((await run("drive_read_file", { fileId: "f1" })).data).toMatchObject({ encoding: "base64", content: "AP8=" });
  google.routes.set("GET www.googleapis.com/drive/v3/files/f1", meta("video/mp4", "999999999"));
  const big = await run("drive_read_file", { fileId: "f1" });
  expect(big.error?.message).toContain("drive_download_link");
  google.routes.set("GET www.googleapis.com/drive/v3/files/f1", meta("application/vnd.google-apps.spreadsheet"));
  google.routes.set("GET www.googleapis.com/drive/v3/files/f1/export", () => ({ text: "a,b" }));
  expect((await run("drive_read_file", { fileId: "f1" })).data).toMatchObject({
    mimeType: "text/csv",
    encoding: "text",
    content: "a,b",
  });
  expect(google.last().query.get("mimeType")).toBe("text/csv");
  expect((await run("drive_read_file", { fileId: "f1", maxBytes: 2 })).error?.message).toContain("maxBytes");
  expect((await run("drive_download_link", { fileId: "f1" })).error?.code).toBe("INVALID_INPUT");
  google.routes.set("GET www.googleapis.com/drive/v3/files/f1", meta("application/vnd.google-apps.form"));
  expect((await run("drive_read_file", { fileId: "f1" })).error?.code).toBe("INVALID_INPUT");
});

test("drive_upload_session returns Google's resumable upload url", async () => {
  google.routes.set("POST www.googleapis.com/upload/drive/v3/files", () => ({
    headers: { location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=xyz" },
  }));
  const result = await run("drive_upload_session", { name: "v.mp4", mimeType: "video/mp4", parentId: "p", size: 10 });
  expect(result.data).toEqual({
    uploadUrl: "https://www.googleapis.com/upload/drive/v3/files?upload_id=xyz",
    method: "PUT",
    contentType: "video/mp4",
  });
  expect(google.last().query.get("uploadType")).toBe("resumable");
  expect(json(google.last().body)).toEqual({ name: "v.mp4", mimeType: "video/mp4", parents: ["p"] });
  google.routes.set("POST www.googleapis.com/upload/drive/v3/files", () => ({}));
  expect((await run("drive_upload_session", { name: "v.mp4" })).error?.code).toBe("TOOL_FAILED");
});

test("gmail_send_email sends a base64url RFC 2822 message", async () => {
  google.routes.set("POST gmail.googleapis.com/gmail/v1/users/me/messages/send", () => ({ body: { id: "m1" } }));
  const result = await run("gmail_send_email", {
    to: ["a@example.com", "b@example.com"],
    cc: "c@example.com",
    subject: "Olá\r\nBcc: x@example.com",
    body: "Corpo ç",
  });
  expect(result.data).toEqual({ id: "m1" });
  const raw = (json(google.last().body) as { raw: string }).raw;
  expect(raw).not.toMatch(/[+/=]/);
  const message = Buffer.from(raw, "base64url").toString();
  expect(message).toStartWith("To: a@example.com, b@example.com\r\nCc: c@example.com\r\nSubject: =?UTF-8?B?");
  const subject = message.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)?.[1] ?? "";
  expect(Buffer.from(subject, "base64").toString()).toBe("Olá Bcc: x@example.com");
  expect(message).toContain("Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n");
  expect(Buffer.from(message.split("\r\n\r\n")[1] ?? "", "base64").toString()).toBe("Corpo ç");
  expect(
    Buffer.from(buildRawMessage({ to: "a@example.com", subject: "s", body: "b" }), "base64url").toString(),
  ).not.toContain("Cc:");
  expect((await run("gmail_send_email", { to: "nope", subject: "s", body: "b" })).error?.code).toBe("INVALID_INPUT");
});

const b64 = (text: string) => Buffer.from(text).toString("base64url");

const headers = (values: Record<string, string>) => Object.entries(values).map(([name, value]) => ({ name, value }));

test("gmail_search_threads passes the query and summarizes the latest message of each thread", async () => {
  const gmail = "GET gmail.googleapis.com/gmail/v1/users/me/threads";
  google.routes.set(gmail, () => ({
    body: {
      threads: [
        { id: "t1", snippet: "old" },
        { id: "t2", snippet: "list" },
      ],
      nextPageToken: "n2",
    },
  }));
  google.routes.set(`${gmail}/t1`, () => ({
    body: {
      messages: [
        { id: "m1", payload: { headers: headers({ Subject: "Primeira" }) } },
        {
          id: "m2",
          snippet: "latest",
          labelIds: ["UNREAD", "INBOX"],
          payload: { headers: headers({ Subject: "Re: Primeira", from: "Ana <ana@example.com>", Date: "Tue, 1 Sep" }) },
        },
      ],
    },
  }));
  google.routes.set(`${gmail}/t2`, () => ({ status: 404, body: { error: { message: "gone" } } }));
  const count = google.requests.length;
  const result = await run("gmail_search_threads", { q: "from:ana is:unread", maxResults: 2, pageToken: "p1" });
  const list = google.requests[count];
  expect(list).toMatchObject({ method: "GET", path: "/gmail/v1/users/me/threads" });
  expect(list?.query.get("q")).toBe("from:ana is:unread");
  expect(list?.query.get("maxResults")).toBe("2");
  expect(list?.query.get("pageToken")).toBe("p1");
  expect(list?.query.get("includeSpamTrash")).toBe("false");
  const metadata = google.requests.find((request) => request.path.endsWith("/threads/t1"));
  expect(metadata?.query.get("format")).toBe("metadata");
  expect(metadata?.query.getAll("metadataHeaders")).toEqual(["Subject", "From", "Date"]);
  expect(google.requests.length).toBe(count + 3);
  expect(result.data).toEqual({
    threads: [
      {
        id: "t1",
        messageCount: 2,
        subject: "Re: Primeira",
        from: "Ana <ana@example.com>",
        date: "Tue, 1 Sep",
        snippet: "latest",
        labelIds: ["UNREAD", "INBOX"],
      },
      { id: "t2", messageCount: null, subject: null, from: null, date: null, snippet: "list", labelIds: [] },
    ],
    nextPageToken: "n2",
  });
  await run("gmail_search_threads", { includeSpamTrash: true });
  const listed = google.requests.findLast((request) => request.path.endsWith("/threads"));
  expect(listed?.query.has("q")).toBe(false);
  expect(listed?.query.get("maxResults")).toBe("20");
  expect(listed?.query.get("includeSpamTrash")).toBe("true");
  expect((await run("gmail_search_threads", { maxResults: 51 })).error?.code).toBe("INVALID_INPUT");
});

test("gmail read tools explain a missing gmail.readonly scope", async () => {
  google.routes.set("GET gmail.googleapis.com/gmail/v1/users/me/labels", () => ({
    status: 403,
    body: { error: { message: "Request had insufficient authentication scopes." } },
  }));
  const denied = await run("gmail_list_labels");
  expect(denied.error?.code).toBe("TOOL_FAILED");
  expect(denied.error?.message).toContain("Google: Request had insufficient authentication scopes.");
  expect(denied.error?.message).toContain("gmail.readonly");
  expect(denied.error?.message).toContain("gmail.modify");
  expect(denied.error?.message).toContain("own OAuth client");
  expect(tools.get("gmail_search_threads")?.description).toContain("Scope: gmail.readonly");
});

test("gmail_list_labels maps the labels", async () => {
  google.routes.set("GET gmail.googleapis.com/gmail/v1/users/me/labels", () => ({
    body: { labels: [{ id: "INBOX", name: "INBOX", type: "system" }, { id: "Label_1" }] },
  }));
  expect((await run("gmail_list_labels")).data).toEqual({
    labels: [
      { id: "INBOX", name: "INBOX", type: "system" },
      { id: "Label_1", name: null, type: null },
    ],
  });
});

test("gmail_get_thread and gmail_get_message decode the plain-text body", async () => {
  const message = {
    id: "m1",
    threadId: "t1",
    labelIds: ["INBOX"],
    snippet: "Oi",
    payload: {
      mimeType: "multipart/mixed",
      headers: headers({ From: "Ana <ana@example.com>", To: "eu@example.com", CC: "c@example.com", Subject: "Oi" }),
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            { mimeType: "text/plain", body: { data: b64("Olá, ação\r\n") } },
            { mimeType: "text/html", body: { data: b64("<p>ignored</p>") } },
          ],
        },
        { mimeType: "text/plain", filename: "notes.txt", body: { attachmentId: "a1", data: b64("attachment") } },
      ],
    },
  };
  google.routes.set("GET gmail.googleapis.com/gmail/v1/users/me/threads/t1", () => ({
    body: { id: "t1", messages: [message] },
  }));
  const thread = await run("gmail_get_thread", { threadId: "t1" });
  expect(google.last().query.get("format")).toBe("full");
  const expected = {
    id: "m1",
    threadId: "t1",
    from: "Ana <ana@example.com>",
    to: "eu@example.com",
    cc: "c@example.com",
    date: null,
    subject: "Oi",
    labelIds: ["INBOX"],
    snippet: "Oi",
    body: "Olá, ação",
    truncated: false,
  };
  expect(thread.data).toEqual({ id: "t1", messages: [expected] });
  google.routes.set("GET gmail.googleapis.com/gmail/v1/users/me/messages/m1", () => ({ body: message }));
  expect((await run("gmail_get_message", { messageId: "m1" })).data).toEqual(expected);
  expect(google.last()).toMatchObject({ method: "GET", path: "/gmail/v1/users/me/messages/m1" });
});

test("gmail message bodies fall back to HTML as text, honor the charset and get truncated", () => {
  const html = {
    mimeType: "text/html",
    body: {
      data: b64(
        "<html><head><style>p{}</style></head><body><p>Oi&nbsp;Ana &amp; time</p><div>Linha<br>dois &#233; &#x2713;</div><script>x()</script></body></html>",
      ),
    },
  };
  expect(messageBody(html)).toEqual({ body: "Oi Ana & time\nLinha\ndois é ✓", truncated: false });
  const latin1 = {
    mimeType: "text/plain",
    headers: headers({ "Content-Type": 'text/plain; charset="ISO-8859-1"' }),
    body: { data: Buffer.from("ação", "latin1").toString("base64url") },
  };
  expect(messageBody(latin1).body).toBe("ação");
  const unknownCharset = {
    mimeType: "text/plain",
    headers: headers({ "Content-Type": "text/plain; charset=x-unknown-charset" }),
    body: { data: b64("olá") },
  };
  expect(messageBody(unknownCharset).body).toBe("olá");
  expect(messageBody({ mimeType: "text/plain", body: { data: b64("abcdef") } }, 4)).toEqual({
    body: "abcd",
    truncated: true,
  });
  expect(messageBody(undefined)).toEqual({ body: "", truncated: false });
  expect(readMessage({ id: "m9" })).toMatchObject({ id: "m9", threadId: null, subject: null, labelIds: [], body: "" });
});

const gmailMessage = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  threadId: "t1",
  labelIds: ["INBOX", "UNREAD"],
  snippet: `trecho ${id}`,
  payload: {
    mimeType: "multipart/mixed",
    headers: [
      { name: "From", value: "Ana <ana@example.com>" },
      { name: "To", value: "contato@moradah.com.br, outra@example.com" },
      { name: "Subject", value: "Dúvida" },
      { name: "Date", value: "Thu, 19 Nov 2026 10:00:00 -0300" },
      { name: "Message-ID", value: `<${id}@mail.example.com>` },
    ],
    parts: [
      {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: b64("Olá, tudo bem?") } },
          { mimeType: "text/html", body: { data: b64("<p>Olá, <b>tudo</b> bem?</p>") } },
        ],
      },
      { mimeType: "application/pdf", filename: "nota.pdf", body: { size: 10, attachmentId: "att1" } },
    ],
  },
  ...extra,
});

test("gmail_search_messages lists and summarizes messages", async () => {
  google.routes.set("GET gmail.googleapis.com/gmail/v1/users/me/messages", () => ({
    body: { messages: [{ id: "m1" }, { id: "m2" }], nextPageToken: "n2", resultSizeEstimate: 2 },
  }));
  google.routes.set("GET gmail.googleapis.com/gmail/v1/users/me/messages/m1", () => ({ body: gmailMessage("m1") }));
  google.routes.set("GET gmail.googleapis.com/gmail/v1/users/me/messages/m2", () => ({ body: gmailMessage("m2") }));
  const result = await run("gmail_search_messages", { query: "in:inbox is:unread", maxResults: 2 });
  const data = result.data as { messages: Record<string, unknown>[]; nextPageToken: string };
  expect(data.nextPageToken).toBe("n2");
  expect(data.messages).toHaveLength(2);
  expect(data.messages[0]).toMatchObject({ id: "m1", from: "Ana <ana@example.com>", subject: "Dúvida", unread: true });
  const listed = google.requests.find((r) => r.path === "/gmail/v1/users/me/messages");
  expect(listed?.query.get("q")).toBe("in:inbox is:unread");
  expect(listed?.query.get("maxResults")).toBe("2");
  expect(google.last().query.get("format")).toBe("metadata");
  expect((await run("gmail_search_messages", { maxResults: 999 })).error?.code).toBe("INVALID_INPUT");
});

test("gmail_reply answers in the same thread with the reply headers", async () => {
  google.routes.set("GET gmail.googleapis.com/gmail/v1/users/me/messages/m1", () => ({ body: gmailMessage("m1") }));
  google.routes.set("GET gmail.googleapis.com/gmail/v1/users/me/profile", () => ({
    body: { emailAddress: "contato@moradah.com.br" },
  }));
  google.routes.set("POST gmail.googleapis.com/gmail/v1/users/me/messages/send", () => ({ body: { id: "r1" } }));
  const result = await run("gmail_reply", { messageId: "m1", body: "Oi, Ana!", replyAll: true });
  expect(result.data).toEqual({ id: "r1" });
  const sent = json(google.last().body) as { raw: string; threadId: string };
  expect(sent.threadId).toBe("t1");
  const message = Buffer.from(sent.raw, "base64url").toString();
  expect(message).toStartWith("To: Ana <ana@example.com>\r\nCc: outra@example.com\r\n");
  expect(message).toContain("In-Reply-To: <m1@mail.example.com>\r\nReferences: <m1@mail.example.com>\r\n");
  const subject = message.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)?.[1] ?? "";
  expect(Buffer.from(subject, "base64").toString()).toBe("Re: Dúvida");
  expect(replySubject("RE: Oi")).toBe("RE: Oi");
  expect(replySubject(undefined)).toBe("Re:");
});

test("gmail_modify_labels marks read, archives and creates missing labels", async () => {
  google.routes.set("GET gmail.googleapis.com/gmail/v1/users/me/labels", () => ({
    body: {
      labels: [
        { id: "INBOX", name: "INBOX", type: "system" },
        { id: "L1", name: "Atendido", type: "user" },
      ],
    },
  }));
  google.routes.set("POST gmail.googleapis.com/gmail/v1/users/me/labels", () => ({
    body: { id: "L2", name: "Black" },
  }));
  google.routes.set("POST gmail.googleapis.com/gmail/v1/users/me/messages/batchModify", () => ({ text: "" }));
  const result = await run("gmail_modify_labels", {
    messageIds: ["m1", "m2"],
    markRead: true,
    archive: true,
    addLabels: ["atendido", "Black"],
  });
  expect(result.data).toEqual({ modified: 2, addLabelIds: ["L1", "L2"], removeLabelIds: ["UNREAD", "INBOX"] });
  expect(json(google.last().body)).toEqual({
    ids: ["m1", "m2"],
    addLabelIds: ["L1", "L2"],
    removeLabelIds: ["UNREAD", "INBOX"],
  });
  expect((await run("gmail_modify_labels", { messageIds: ["m1"] })).error?.code).toBe("INVALID_INPUT");
  expect((await run("gmail_modify_labels", { messageIds: ["m1"], removeLabels: ["Nope"] })).error?.code).toBe(
    "INVALID_INPUT",
  );
});

test("forms_create_form creates the form and sets the description", async () => {
  google.routes.set("POST forms.googleapis.com/v1/forms", () => ({
    body: { formId: "f1", responderUri: "https://r/f1" },
  }));
  const result = await run("forms_create_form", { title: "Pesquisa", description: "Conte pra gente" });
  expect(result.data).toEqual({
    formId: "f1",
    responderUri: "https://r/f1",
    editUrl: "https://docs.google.com/forms/d/f1/edit",
  });
  expect(json(google.requests.at(-2)?.body ?? "")).toEqual({ info: { title: "Pesquisa" } });
  expect(google.last().path).toBe("/v1/forms/f1:batchUpdate");
  expect(json(google.last().body)).toEqual({
    requests: [{ updateFormInfo: { info: { description: "Conte pra gente" }, updateMask: "description" } }],
  });
  google.routes.set("POST forms.googleapis.com/v1/forms", () => ({ body: { formId: "f2" } }));
  const count = google.requests.length;
  expect((await run("forms_create_form", { title: "Sem descrição" })).data).toMatchObject({ responderUri: null });
  expect(google.requests.length).toBe(count + 1);
  google.routes.set("POST forms.googleapis.com/v1/forms/f2:batchUpdate", () => ({ status: 400 }));
  expect((await run("forms_create_form", { title: "x", description: "y" })).error).toBeTruthy();
  google.routes.set("POST forms.googleapis.com/v1/forms", () => ({ status: 403 }));
  expect((await run("forms_create_form", { title: "x" })).error).toBeTruthy();
});

test("forms_add_question appends each question type at the end", async () => {
  google.routes.set("GET forms.googleapis.com/v1/forms/f1", () => ({
    body: { formId: "f1", responderUri: "https://r/f1", items: [{}, {}] },
  }));
  google.routes.set("POST forms.googleapis.com/v1/forms/f1:batchUpdate", () => ({
    body: { replies: [{ createItem: { itemId: "i1" } }] },
  }));
  const choice = await run("forms_add_question", {
    formId: "f1",
    title: "Cor?",
    type: "choice",
    options: ["Azul"],
    required: true,
  });
  expect(choice.data).toEqual({
    formId: "f1",
    itemId: "i1",
    responderUri: "https://r/f1",
    editUrl: "https://docs.google.com/forms/d/f1/edit",
  });
  expect(json(google.last().body)).toEqual({
    requests: [
      {
        createItem: {
          item: {
            title: "Cor?",
            questionItem: {
              question: { required: true, choiceQuestion: { type: "RADIO", options: [{ value: "Azul" }] } },
            },
          },
          location: { index: 2 },
        },
      },
    ],
  });
  const question = () =>
    (json(google.last().body) as { requests: { createItem: { item: { questionItem: { question: unknown } } } }[] })
      .requests[0]?.createItem.item.questionItem.question;
  await run("forms_add_question", { formId: "f1", title: "Nota", type: "scale" });
  expect(question()).toEqual({ required: false, scaleQuestion: { low: 1, high: 5 } });
  await run("forms_add_question", { formId: "f1", title: "Conte", type: "paragraph" });
  expect(question()).toEqual({ required: false, textQuestion: { paragraph: true } });
  await run("forms_add_question", { formId: "f1", title: "Nome", type: "text" });
  expect(question()).toEqual({ required: false, textQuestion: { paragraph: false } });
  expect((await run("forms_add_question", { formId: "f1", title: "x", type: "choice" })).error?.code).toBe(
    "INVALID_INPUT",
  );

  google.routes.set("GET forms.googleapis.com/v1/forms/f3", () => ({ body: { formId: "f3" } }));
  expect((await run("forms_add_question", { formId: "f3", title: "x", type: "text" })).data).toMatchObject({
    itemId: null,
    responderUri: null,
  });
  expect(json(google.last().body)).toMatchObject({ requests: [{ createItem: { location: { index: 0 } } }] });
  google.routes.set("POST forms.googleapis.com/v1/forms/f3:batchUpdate", () => ({ status: 400 }));
  expect((await run("forms_add_question", { formId: "f3", title: "x", type: "text" })).error).toBeTruthy();
  google.routes.set("GET forms.googleapis.com/v1/forms/f3", () => ({ status: 404 }));
  expect((await run("forms_add_question", { formId: "f3", title: "x", type: "text" })).error).toBeTruthy();
});

test("meet_create_space creates a meeting space", async () => {
  google.routes.set("POST meet.googleapis.com/v2/spaces", () => ({
    body: {
      name: "spaces/abc",
      meetingUri: "https://meet.google.com/abc-defg-hij",
      meetingCode: "abc-defg-hij",
      config: {},
    },
  }));
  expect((await run("meet_create_space")).data).toEqual({
    name: "spaces/abc",
    meetingUri: "https://meet.google.com/abc-defg-hij",
    meetingCode: "abc-defg-hij",
  });
  expect(google.last().method).toBe("POST");
  google.routes.set("POST meet.googleapis.com/v2/spaces", () => ({ status: 403 }));
  expect((await run("meet_create_space")).error).toBeTruthy();
});

test("network failures and empty bodies are reported", async () => {
  google.routes.set("GET www.googleapis.com/drive/v3/files", () => ({ text: "" }));
  expect((await run("drive_list_files")).data).toEqual({});
  google.failingHosts.add("www.googleapis.com");
  expect((await run("drive_list_files")).error?.message).toBe("Google: down");
  google.failingHosts.clear();
  const previous = google.base;
  google.base = "http://127.0.0.1:1";
  expect((await run("drive_list_files")).error?.code).toBe("TOOL_FAILED");
  google.base = previous;
});
