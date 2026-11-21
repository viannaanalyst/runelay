import type { GoogleService } from "@runelay/shared";

const scope = (name: string) => `https://www.googleapis.com/auth/${name}`;

export const GOOGLE_SOURCE_URL = "https://www.googleapis.com";

export const GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_SERVICES: GoogleService[] = [
  "calendar",
  "docs",
  "sheets",
  "slides",
  "drive",
  "gmail",
  "forms",
  "meet",
];

export const GOOGLE_BASE_SCOPES = ["openid", scope("userinfo.email"), scope("userinfo.profile")];

export const GOOGLE_SERVICE_SCOPES: Record<GoogleService, string[]> = {
  calendar: [scope("calendar"), scope("calendar.events")],
  docs: [scope("documents"), scope("drive.file")],
  sheets: [scope("spreadsheets"), scope("drive.file")],
  slides: [scope("presentations"), scope("drive.file")],
  drive: [scope("drive.file")],
  gmail: [scope("gmail.send")],
  forms: [scope("forms.body"), scope("drive.file")],
  meet: [scope("meetings.space.created")],
};

// A broader scope Google grants also covers the narrower one runelay asks for.
export const GOOGLE_IMPLIED_SCOPES: Record<string, string[]> = {
  [scope("drive")]: [scope("drive.file")],
};

export const GOOGLE_REGISTERED_SCOPES = [
  "openid",
  scope("userinfo.email"),
  scope("userinfo.profile"),
  scope("calendar"),
  scope("calendar.events"),
  scope("drive.file"),
  scope("documents"),
  scope("spreadsheets"),
  scope("presentations"),
  scope("forms.body"),
  scope("gmail.send"),
  scope("meetings.space.created"),
];

export const GOOGLE_SERVICE_LABELS: Record<GoogleService, string> = {
  calendar: "Agenda",
  docs: "Docs",
  sheets: "Planilhas",
  slides: "Apresentações",
  drive: "Drive",
  gmail: "Gmail",
  forms: "Formulários",
  meet: "Meet",
};

export const GOOGLE_API = {
  userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
  calendar: "https://www.googleapis.com/calendar/v3",
  docs: "https://docs.googleapis.com/v1/documents",
  sheets: "https://sheets.googleapis.com/v4/spreadsheets",
  slides: "https://slides.googleapis.com/v1/presentations",
  driveFiles: "https://www.googleapis.com/drive/v3/files",
  driveUpload: "https://www.googleapis.com/upload/drive/v3/files",
  gmail: "https://gmail.googleapis.com/gmail/v1/users/me",
  gmailSend: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
  forms: "https://forms.googleapis.com/v1/forms",
  meetSpaces: "https://meet.googleapis.com/v2/spaces",
};

export const DRIVE_READ_DEFAULT_BYTES = 5 * 1024 * 1024;

export const DRIVE_READ_MAX_BYTES = 20 * 1024 * 1024;

export const DRIVE_LINK_TTL_MS = 60 * 60 * 1000;

export const DRIVE_FILES_PATH = "/v1/google/files";

export const GMAIL_BODY_LIMIT = 50_000;

export const GMAIL_METADATA_CONCURRENCY = 10;

export const GOOGLE_REFRESH_MARGIN_MS = 60_000;

export const GOOGLE_ERROR_PREVIEW = 500;

export const GMAIL_SEARCH_DEFAULT = 10;

export const GMAIL_SEARCH_MAX = 50;
