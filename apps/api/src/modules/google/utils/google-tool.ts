import { fail } from "@runelay/shared";
import { z } from "zod";
import type { JsonSchema, Tool } from "@/modules/connectors/types/connector.types";
import type { GoogleApi, GoogleToolDefinition } from "@/modules/google/types/google.types";
import type { SourceKey } from "@/modules/sources/types/source.types";

export const defineGoogleTool = <Schema extends z.ZodType>(definition: GoogleToolDefinition<Schema>) =>
  definition as unknown as GoogleToolDefinition;

const inputSchemaOf = (schema: z.ZodType): JsonSchema => {
  const { $schema: _, ...rest } = z.toJSONSchema(schema, { io: "input" }) as JsonSchema;
  return rest;
};

export const toGoogleTool = (definition: GoogleToolDefinition, key: SourceKey, api: GoogleApi): Tool => ({
  name: definition.name,
  source: key.name,
  description: definition.description,
  inputSchema: inputSchemaOf(definition.input),
  call: async (args) => {
    const parsed = definition.input.safeParse(args ?? {});
    if (!parsed.success) return fail("INVALID_INPUT", z.prettifyError(parsed.error));
    return definition.run(api, parsed.data, { key });
  },
});
