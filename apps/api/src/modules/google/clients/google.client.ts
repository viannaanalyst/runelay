import { fail, type GoogleConfig, type GoogleService, ok, type Result } from "@runelay/shared";
import type { Connection, Tool } from "@/modules/connectors/types/connector.types";
import { createGoogleApi } from "@/modules/google/clients/google-api.client";
import { getGoogleAccessToken, missingServicesMessage } from "@/modules/google/services/google-auth.service";
import { accountTools } from "@/modules/google/tools/account.tools";
import { calendarTools } from "@/modules/google/tools/calendar.tools";
import { docsTools } from "@/modules/google/tools/docs.tools";
import { driveTools } from "@/modules/google/tools/drive.tools";
import { formsTools } from "@/modules/google/tools/forms.tools";
import { gmailTools } from "@/modules/google/tools/gmail.tools";
import { meetTools } from "@/modules/google/tools/meet.tools";
import { sheetsTools } from "@/modules/google/tools/sheets.tools";
import { slidesTools } from "@/modules/google/tools/slides.tools";
import type { GoogleToolDefinition } from "@/modules/google/types/google.types";
import { missingScopes } from "@/modules/google/utils/google-scopes";
import { toGoogleTool } from "@/modules/google/utils/google-tool";
import { findSource } from "@/modules/sources/repositories/source.repository";
import type { SourceKey } from "@/modules/sources/types/source.types";

const SERVICE_TOOLS: Record<GoogleService, GoogleToolDefinition[]> = {
  calendar: calendarTools,
  docs: docsTools,
  sheets: sheetsTools,
  slides: slidesTools,
  drive: driveTools,
  gmail: gmailTools,
  forms: formsTools,
  meet: meetTools,
};

const serviceTools = (key: SourceKey, services: GoogleService[]): Tool[] => {
  const api = createGoogleApi(() => getGoogleAccessToken(key));
  const definitions = [
    ...accountTools,
    ...services.flatMap((service) =>
      SERVICE_TOOLS[service].map((definition) => ({ ...definition, name: `${service}_${definition.name}` })),
    ),
  ];
  return definitions.map((definition) => toGoogleTool(definition, key, api));
};

export const connectGoogle = async (key: SourceKey, config: GoogleConfig): Promise<Result<Connection>> => {
  const source = findSource(key);
  if (source.error) return source;
  const granted = source.data.oauth.google?.scopes ?? [];
  if (!source.data.oauth.tokens || missingScopes(config.services, granted).length > 0) {
    return fail("NEEDS_AUTH", missingServicesMessage(config, granted));
  }
  const token = await getGoogleAccessToken(key);
  if (token.error) return token;
  return ok({ tools: serviceTools(key, [...new Set(config.services)]), close: async () => {} });
};
