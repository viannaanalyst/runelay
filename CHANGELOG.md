# Changelog

## Unreleased

### Gmail

- New Gmail tools to read and answer the mailbox: `gmail_search_messages` (Gmail search syntax, returns sender, subject, date and snippet), `gmail_get_message` (headers, plain-text body and attachment list), `gmail_get_thread`, `gmail_reply` (same thread, with `In-Reply-To`, `References` and "Re:"), `gmail_modify_labels` (mark read, archive, add or remove labels) and `gmail_list_labels`.
- The default client still only asks for `gmail.send`. To read, give the connection its own OAuth client with the `gmail.modify` scope (or `gmail.readonly` to only read).

### Connections

- Google connections can use your own Google Cloud OAuth client, set on the connection's page. runelay then signs in and refreshes tokens with Google directly instead of through the broker, and asks for any extra scopes you list, such as `https://www.googleapis.com/auth/drive` for full Drive access. Google requires the client secret. Changing the client drops the old login.

### Google Drive

- New Drive tools: `drive_get_file`, `drive_read_file` (text, base64, or a Docs/Sheets/Slides export), `drive_create_folder`, `drive_update_file` (rename, move, trash, restore), `drive_upload_session` (a resumable upload URL for files of any size) and `drive_download_link` (a signed link, valid for one hour, that downloads any file with a plain GET).
- `drive_list_files` searches by folder, sorts newest first, leaves trashed files out and returns size and parents. `drive_create_file` takes a folder and base64 content for binary files.
- With the default `drive.file` scope these tools only reach files runelay created, as before.

## v0.6.7

### Skills and memories

- Add skills from public GitHub repositories, skills.sh links, or Markdown and TXT files. Use Add skill in the dashboard or `runelay skills add` in the CLI.
- The memory search has a filter for types and pinned entries. The Context sidebar has direct links to Memories and Skills.

### Dashboard

- A connection's own page has a delete button next to Test and Reconnect, with the same confirmation as the connections list. Before, a connection could only be removed from the list.

### Catalog

- "Add another account" in an installed OAuth connector's menu creates a second connection for the same service under a name you choose (for example `calendar_work`) and opens its sign-in. You can also start from an existing connection’s details. Each connection has its own OAuth credentials and tool prefix, and Google prompts you to choose an account.

## v0.6.6

### Memory and skills

- The Memories page has a graph view, like Obsidian's: each memory is a node and every `[[slug]]` link is an edge, so clusters and orphan memories show at a glance. It is built from the new `GET /v1/memories/graph` endpoint.

## v0.6.5

### Memory and skills

- Agents without a global rules file, such as Cursor, now save a memory with `write_memory` as soon as the user asks them to remember something, instead of only acknowledging it. The MCP tool descriptions and server instructions tell every agent to do this.

## v0.6.4

### CLI

- `runelay setup` connects every agent on the machine in one command: it logs in, registers the runelay MCP, writes the global instructions and imports native memory.
- `runelay doctor` checks each agent's setup and says what to fix. `runelay home` opens an interactive menu, and `runelay sponsor` shows how to support the project.
- Every agent gets its own API key, so access can be seen and revoked per agent. Servers older than this release fall back to the shared key.
- For every agent, setup turns off native memory, installs the global instructions and approves only runelay's tools. Imported native memory files are archived.

### Memory and skills

- Agents write skills with `write_skill`, import many memories at once with `import_memory`, and `write_memory` points out similar memories so duplicates get updated instead of created.

### Connections

- OAuth goes through a relay that publishes a client ID metadata document (CIMD), so servers that only accept CIMD, such as Vercel, now connect.
- Asana, HubSpot and Box are no longer in the catalog.

### Panel

- Setup is now a per-agent onboarding: a checklist, desktop or manual setup, a success screen, and the MCP endpoint ready to copy.

### Desktop app

- The desktop app bundles the CLI and syncs skills locally, so connecting agents needs no terminal.
- On macOS the menu bar icon is the runelay mark on its own, the same size as the other icons there and readable on light and dark bars. It used to be the whole app icon shrunk to 18 points, which left the mark tiny.

### Site and docs

- The site's setup pages and CLI previews show the new onboarding, and the agent and integration guides are updated. runelay.com/cli serves the installer from the latest release.

## v0.6.3

### Catalog

- Doop (OAuth) is in the catalog: a design canvas where agents build screens as real HTML and CSS and you review and approve them.

### Desktop app

- The desktop app tells you when a new version is out, also when it is pointed at a remote server. It checks on open and every six hours, downloads the installer for your system into Downloads and opens it. "Buscar atualizações…" in the app and tray menus checks on demand, and a version can be skipped.
- "Open when the computer starts" also works when the app is pointed at a remote server. With it on, the app opens hidden in the tray and closing the window keeps it there; with it off, nothing changes for remote servers.

### Panel

- Connections that use your own OAuth client can list the scopes to ask for, one per line, instead of every scope the server advertises. For Gmail that means you can leave out full mailbox access and delete. Changing the scopes asks you to log in again.

## v0.6.2

### Desktop app

- The desktop app can open when the computer starts (hidden, straight to the tray) and keeps running in the tray when the window is closed, so agents always reach the local MCP endpoint. Toggle it in the first setup step or in Settings > Server.

## v0.6.1

### Catalog

- Conty (OAuth) is the featured connector, highlighted at the top of the catalog: agents run creator campaigns from the brief to the sales report.
- Firecrawl (API key) is in the catalog: web search, scraping and site crawling for every agent.

### Connections

- Google Calendar, Docs, Sheets and Slides now use Google's REST APIs with runelay's own tools. Google's MCP servers for those services require enrollment in the Google Workspace Developer Preview Program.
- Google Calendar: `calendar_list_calendars`, `calendar_list_events`, `calendar_create_event` and `calendar_delete_event`.
- Google Docs: `docs_read_document` and `docs_append_text`, next to `docs_create_document`.
- Google Sheets: `sheets_get_values`, `sheets_update_values` and `sheets_append_rows`, next to `sheets_create_spreadsheet`.
- Google Slides: `slides_read_presentation` and `slides_add_slide`, next to `slides_create_presentation`.
- The first sign-in of each Google connector asks only for that service's scopes.

### Fixes

- The panel no longer crashes on unknown Google services.

## v0.6.0

### Connections

- Google is one connector per service, each a one-click login through the hosted OAuth broker (`auth.runelay.com`) that asks only for its own scopes plus `openid`, `email` and `profile`.
- Google Calendar (`calendar`, `calendar.events`): list calendars and events, create, update and delete events, suggest times.
- Gmail (`gmail.send`): send an email with to, subject, body and cc. It can't read mail.
- Google Drive (`drive.file`): create a text file and list the files runelay created.
- Google Docs (`documents`, `drive.file`): create a doc, read and edit docs.
- Google Sheets (`spreadsheets`, `drive.file`): create a spreadsheet with rows, read and edit values.
- Google Slides (`presentations`, `drive.file`): create a deck with slides of text, read and edit decks.
- Google Forms (`forms.body`, `drive.file`): create a form and add text, paragraph, choice and scale questions.
- Google Meet (`meetings.space.created`): create a meeting space and return its link.
- Agents call them as `<connection>.<service>_<tool>` (for example `gmail.gmail_send_email`), plus `account_whoami` on each. Restricted scopes, such as reading Gmail or full Drive access, are not requested.
- GitHub signs in with one click through the broker (scopes `repo` and `read:user`). Its tokens expire and are refreshed automatically. Pasting a token still works.

### Panel

- Remote MCP connections can use your own OAuth client: paste a Client ID and, if the service gives one, a Client secret when adding or editing a connection. This is the way in for services without automatic client registration, such as Google. The secret is stored encrypted and never sent back to the panel.

### Broker

- The broker supports GitHub at `/github/callback` and `/github/token`.
- `auth.runelay.com/` redirects to runelay.com.
- Self-hosters running their own broker set `RUNELAY_GITHUB_CLIENT_ID` next to `RUNELAY_OAUTH_BROKER_URL` and `RUNELAY_GOOGLE_CLIENT_ID`.

### Fixes

- runelay's Google client ID is the default. v0.5.0 shipped a placeholder, so Google login failed unless `RUNELAY_GOOGLE_CLIENT_ID` was set.
- Google Calendar no longer asks for `calendar.calendarlist.readonly`.

## v0.5.0

### Connections

- Google Calendar, Google Docs and Google Sheets are in the catalog. They sign in with one click through runelay's hosted OAuth broker, with no Google Cloud project to set up. Each asks only for the scopes it needs, and the connection keeps a refresh token so it doesn't drop after an hour.
- OAuth broker (`apps/oauth-broker`, served at `auth.runelay.com`): a stateless Cloudflare Worker that holds runelay's registered OAuth apps for providers without dynamic client registration. It relays the login back to your instance and adds the client secret to token requests; it stores and logs nothing. Logins going to a remote instance show a confirmation page naming the destination, PKCE is required, only known parameters are forwarded, and requests are rate limited per IP. Run your own with `RUNELAY_OAUTH_BROKER_URL` and `RUNELAY_GOOGLE_CLIENT_ID`.

### Site

- Privacy Policy and Terms pages at `/privacy/` and `/terms/`, in English and Portuguese.

## v0.4.3

### Panel

- Settings: new Organization page to rename the organization, set its image and delete it. Deleting removes its connections, API keys, memories and skills, and is refused while it is your only organization or a member has no other one.
- Connections can be renamed from their detail page. The login, the config and the call history move to the new name; agents see the tools under the new prefix.

### Catalog

- Cloudflare (full account API, next to Cloudflare Docs) and Buffer (API key) are in the catalog.

### Docs

- Every docs page has its own share image.

## v0.4.2

### Panel

- Adding a remote MCP now detects how it signs in. OAuth servers (Figma, Linear, GitHub Copilot) say the login opens on save and hide the Headers field; servers that need a key say so.
- "☕ Support the project" in the profile menu and on the setup celebration, opening GitHub Sponsors.

### API

- `POST /v1/sources/detect-auth`: classifies a remote MCP as `oauth`, `header`, `none` or `unknown` from its `WWW-Authenticate` challenge or OAuth protected resource metadata.
- Imported OAuth accounts accept a `clientSecret` and `scope` up to 20,000 characters, so `runelay migrate` no longer fails with "Too big: expected string to have <=2000 characters".
- CLI login codes are drawn with `crypto.randomInt`.

### CLI

- `runelay open` opens the dashboard in the browser.

### Install

- When Docker has no free address pools, the installer explains how to recover (`docker network prune -f`) instead of stopping with the raw error.

### Docs

- New docs site at [docs.runelay.com](https://docs.runelay.com): quickstart, self-hosting, CLI, integrations, migrate guides, troubleshooting, FAQ and more.

## v0.4.1

- Dashboard lists (top connectors, most used tools, recent skills and memories) stop growing and scroll inside their card.
- The collapsed side panel no longer shows a sliver of its content next to the rail.

## v0.4.0

### Panel

- New Activity page: every call your agents made through runelay, live. Stats for the last 7 days, filters by agent, connector and status, search, and a timeline grouped by day with each agent's logo, the connector, the tool, duration and time.
- Sidebar sections collapse like an accordion and remember their state.
- No more elastic overscroll on the page.
- Removed the "Soon" placeholders for Tools and organization Settings.

### API

- `GET /v1/activity/calls`: paginated tool calls with filters by agent key, connector, status and search, all on the server.

## v0.3.5

- `runelay pull` fetches skills in batches of 50 through a new `POST /v1/skills/export`, instead of one request per skill and per file. Pulling many new skills no longer hits the per-key rate limit and blocks the agents that share the key.

## v0.3.4

- Running `runelay migrate` again no longer touches connections that already work. Before, a second import could replace fresh tokens with stale ones from an agent, or reset a token header added in the panel, and the connection asked for login again.

## v0.3.3

- The Docker image is about 4x smaller: a two-stage build ships one compiled server binary, the panel and a minimal Debian, with no Node or `node_modules`. Download drops from about 278 MB to about 66 MB, and idle RAM from about 86 MiB to about 52 MiB in our test.
- The image no longer includes Node, so local MCP servers launched with `npx` need the desktop app or a custom image.
- Site: `/benchmark` page comparing runelay and Executor, and a Benchmark link in the navigation.

## v0.3.2

### Desktop app

- First open asks where runelay runs: on this computer or on a server you already have. Pick a card, press Continue, and a short confirmation plays before the panel opens.
- Keep several servers and switch between them from Settings or the Server menu. Adding a server checks that the URL answers as runelay first.
- If a remote server is down, the app offers to retry or go back to this computer.

### Settings

- New Settings area with its own navigation: Server, Profile, Preferences and About.
- Server shows the address, status, version and the MCP endpoint for agents.
- Change your name inline and upload or remove a profile photo.
- Sounds, theme and language live in Preferences.
- About links to the GitHub repository and, in the browser, to the desktop download.

### Language

- The whole panel is available in Portuguese and English, with dates and numbers following the chosen language.
- Switching language or theme plays a short page transition.

### Panel

- Removing a memory, API key or connection asks for confirmation in a popover next to the button. Signing out asks too.
- An empty overview shows a blurred preview of the charts instead of a bare message.
- Charts use the runelay colors.

## v0.3.1

### Overview

- Calls to memories, skills, context search, tool search and the connection list now count as activity, so the overview no longer stays on "Nenhuma chamada ainda" for agents that mostly read context.
- New charts: daily activity split into connectors and context, usage by type, top connectors with their logos, recent skills and recent memories, and a 30-day error strip.
- One tooltip per chart that follows the hovered bar or segment.
- KPI numbers roll into place when the page opens.

## v0.3.0

### Desktop app

- runelay as a desktop app for Mac (Apple silicon and Intel), Windows and Linux (AppImage, x64 and arm64). It runs the whole server on `127.0.0.1:4312`, no Docker needed, and opens the first-account screen on its own.
- The secret lives in the system keychain (Keychain, DPAPI or the Linux keyring) when one is available. Links to other sites open in the browser.
- Local MCP servers by command are on in the app, since it runs on your own machine.
- In the app, the update button opens the download page instead of the Docker command.

### Server

- The server compiles to a single binary with the QuickJS sandbox embedded, so `execute` works outside Docker too.

### Site

- `bot.runelay.com/download` lists every platform with its download buttons and the latest version.

## v0.2.2

- A small gap between the rail and the page when the side panel is collapsed.
- New releases show up in the panel within 10 minutes instead of an hour.

## v0.2.1

- Connectors that sign in with a token (GitHub) ask for it in a dialog, on install and on the installed card, instead of opening a browser login that cannot work.
- After a browser login, the login tab tells the panel it is done and closes itself, and the panel refreshes on its own.
- A repeated OAuth callback no longer wipes the tokens of a connection that just connected, and no longer shows a stale "login failed" next to a green connection.
- A provider that only lets approved apps sign in now gets a clear message instead of a raw 403. Figma and Intercom left the catalog for that reason.
- The catalog refreshes connection status after an install.

## v0.2.0

### Panel

- Update button in the rail when a new release is out, with the release notes and a confirmation before updating. The page reloads by itself on the new version.
- Current version shown in the account menu.
- Hide the names of memories and skills with one click, with an animated mask.

### Server

- One-click update for owners and admins through an optional `updater` service (Watchtower) in `compose.yaml`. The installer generates `RUNELAY_UPDATER_TOKEN`.
- `GET /v1/system/version` reports the current and latest release, checked against GitHub at most once an hour.

## v0.1.2

- The project lives at `github.com/Andsu-dev/runelay` again, and the Docker image is back at the public `ghcr.io/andsu-dev/runelay`.
- The `execute` sandbox releases its host handles when setup fails before the code runs.
- CI with tests on every pull request, Dependabot and community health files.
- Includes everything from v0.1.1: first-access setup screen and the guided setup as the first screen after signing in.

## v0.1.1

- First access: a fresh server opens a "Configurar este runelay" screen that asks for the setup token (or the whole link) instead of a plain sign-in.
- After signing in, the guided setup is the first screen until it is complete.
- Docker image and links now live under the `runelay` GitHub organization: `ghcr.io/andsu-dev/runelay`.
- Short install URLs: `curl -fsSL bot.runelay.com/install | sh` and `curl -fsSL bot.runelay.com/cli | sh`.

## v0.1.0

First public version of runelay: one MCP endpoint for every account, skill and memory your agents use. Open source and self-hosted.

### Install

```sh
# server, on any machine with Docker
curl -fsSL https://github.com/Andsu-dev/runelay/releases/latest/download/install.sh | sh

# CLI, on your computer
curl -fsSL https://github.com/Andsu-dev/runelay/releases/latest/download/install-cli.sh | sh
runelay migrate
```

### Gateway

- MCP endpoint at `/v1/mcp` with nine tools: `list_connections`, `search_tools`, `call_tool`, `execute`, `search_context`, `read_memory`, `write_memory`, `read_skill`, `read_skill_file`.
- `execute` chains tools in JavaScript inside a QuickJS WebAssembly sandbox: fresh per run, no filesystem, network, process or timers, 32 MB of memory and CPU and wall-clock limits.
- Connections: remote MCP with OAuth (dynamic client registration and PKCE), local MCP by command, and OpenAPI specs turned into tools.
- Catalog with ~25 curated MCP servers (Linear, GitHub, Notion, Figma, Vercel, Supabase, Sentry, Stripe and more), installed in one click.

### Context

- Skills (`SKILL.md` with files) and memory (`[[linked]]` notes) per organization, with full-text search, versions, backlinks and a health report (stale, broken links, isolated).
- Context routing: a short brief (pinned rules and an index) synced into `CLAUDE.md` and `AGENTS.md`, the rest fetched on demand through MCP. Agents write new facts back with `write_memory`.

### CLI

- `runelay login` finds your server (`~/runelay/.env` or `localhost:4312`) or asks for the URL, then authorizes in the browser with a code. No keys to paste.
- `runelay migrate` brings MCP servers, memories, skills and instructions from Claude Code, Codex, Cursor, Grok, Gemini and OpenCode in one command. Accounts already logged in on the machine (Grok, Codex and Claude Code credentials) arrive connected; the rest go to a reconnect queue in the panel.
- `status`, `push`, `pull` (brief plus skills materialized into each agent's folder), `sync`, `connect` (registers runelay in every client), `import` and `logout`.
- Single binaries for macOS (arm64, x64) and Linux (x64, arm64).

### Panel

- Organizations with their own connections, skills, memory and API keys.
- Overview with call metrics, connectors catalog and installed list, skills, memory, API keys with a per-key activity timeline, guided setup with a progress timeline, and a reconnect queue that walks through every pending login.
- Monochrome interface with light and dark themes, motion and optional 8-bit sound feedback.

### Security

- First account requires a one-time setup token (printed by the installer and in the server log); signups close afterwards.
- Connection configs, OAuth tokens and recoverable API keys encrypted with AES-256-GCM.
- Agents never see credentials: API key requests and `list_connections` get headers and env values hidden.
- Agents cannot pin memories, so a prompt-injected agent cannot plant instructions for every other agent.
- Local commands are off by default (`RUNELAY_ENABLE_STDIO`) and, when on, only owners and admins can create them, with a minimal environment.
- Private, loopback, link-local and tailnet addresses blocked on every outgoing request and redirect (SSRF and DNS rebinding).
- Rate limit per API key and an audit log of every request a key makes.
- Docker image runs as an unprivileged user with read-only application code.

### Distribution

- Docker image `ghcr.io/andsu-dev/runelay` for `linux/amd64` and `linux/arm64`.
- `install.sh` for the server and `install-cli.sh` for the CLI attached to every release.
