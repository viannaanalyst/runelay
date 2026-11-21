import type { HttpVerb } from "@/modules/connectors/types/connector.types";

export const CLIENT_INFO = { name: "runelay", version: "0.6.8" };

export const OPENAPI_VERBS: HttpVerb[] = ["get", "post", "put", "patch", "delete"];

export const ERROR_BODY_PREVIEW = 500;
