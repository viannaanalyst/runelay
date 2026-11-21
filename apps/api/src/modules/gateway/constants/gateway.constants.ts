export const GATEWAY_INFO = { name: "runelay", version: "0.6.8" };

export const GATEWAY_INSTRUCTIONS =
  "runelay aggregates every account the user connected and the user's memories and skills. Use search_tools to find tools (named source.tool), then call_tool for one call or execute to chain several calls in JavaScript. If a source shows needs_auth, tell the user to reconnect it in the runelay dashboard. Before acting on a topic, use search_context, then read_memory or read_skill for details; save new facts with write_memory (or import_memory for many at once). When the user asks to remember something, call write_memory right away instead of only acknowledging it. Write skills with write_skill and write_skill_file, never in local folders; never keep memory in the agent's native or local memory files. The user's golden rules follow and always apply.";

export const GATEWAY_INSTRUCTIONS_MAX_CHARS = 2_000;

export const SEARCH_DETAIL_LIMIT = 10;

export const SEARCH_DEFAULT_LIMIT = 25;

export const SEARCH_PREVIEW_LENGTH = 160;

export const EXECUTE_SYNC_TIMEOUT_MS = 5_000;

export const EXECUTE_TIMEOUT_MS = 120_000;

export const TOOL_DESCRIPTIONS = {
  listConnections: "List every connected source with status, tool count and the link to reconnect it.",
  searchTools:
    "Search tools across all connected sources. Returns full input schemas when 10 or fewer match. An empty query lists every tool.",
  callTool: "Call one tool by its full name (source.tool) with arguments.",
  execute:
    "Run an async JavaScript snippet that chains tools across sources. Each tool is `tools.<source>.<tool>(args)` and resolves to `{ data, error }`. `return` the final value; console.log output comes back in logs. Use search_tools first to learn the schemas.",
  searchContext:
    "Full-text search across the user's memories and skills. Returns slug, name, description and a snippet, best match first.",
  readMemory: "Read one memory by slug, with its body, links and backlinks.",
  writeMemory:
    "Create or update a memory by slug. Call it right away whenever the user asks to remember, note or save something, or states a lasting preference, rule or decision; do not just acknowledge it. Updating keeps the previous content as a version. Link other memories with [[slug]] in the body.",
  readSkill: "Read one skill by slug: its full instructions and the list of extra files.",
  readSkillFile: "Read one extra file of a skill by its path.",
  importMemory:
    "Create or update up to 200 memories in one call; each item works like write_memory. Items whose body is unchanged are skipped, and a failing item does not stop the others.",
  writeSkill:
    "Create or update a skill by slug. Call it when the user asks to save a reusable procedure or workflow. body is the full SKILL.md instructions; extra files go through write_skill_file.",
  writeSkillFile: "Create or replace one extra file of an existing skill by its relative path.",
};
