import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { jsonLd, plain } from "./blocks.mjs";

const ORIGIN = "https://runelay.com";
const REPO = "https://github.com/runelay/runelay";

const pages = readdirSync(".", { recursive: true })
  .map((file) => file.replaceAll("\\", "/"))
  .filter((file) => /(^|\/)(index|404)\.html$/.test(file) && !/^(dist|node_modules|public|showcase)\//.test(file))
  .sort();

const routeOf = (file) => `/${file.replace(/index\.html$/, "")}`;
const slugOf = (route) => route.replace(/^\/pt-br\//, "/");
const localized = (slug, pt) => (pt ? `/pt-br${slug}` : slug);

const FOOTER = {
  en: {
    blurb: "Runelay is an open source MCP gateway. One endpoint gives every agent the same accounts, skills and memories, on your computer or your server.",
    contribute: "Contribute",
    nav: "Footer",
    language: "Language",
    credit: "MIT license · Made by",
    columns: [
      ["Product", [["Download", "/download/"], ["Setup", "/setup/"], ["Integrations", "/integrations/"], ["Changelog", "/changelog/"], ["Benchmark", "/benchmark/"]]],
      ["Guides", [["All guides", "/guides/"], ["Share MCP across agents", "/guides/share-mcp-across-agents/"], ["runelay + Claude Code", "/guides/claude-code/"], ["runelay + Cursor", "/guides/cursor/"], ["runelay + Codex", "/guides/codex/"], ["runelay + agentes.chat", "/guides/agentes-chat/"], ["runelay + Antigravity", "/guides/antigravity/"], ["runelay + Grokbot", "/guides/grokbot/"], ["runelay + Hermes Agent", "/guides/hermes-agent/"], ["runelay + OpenClaw", "/guides/openclaw/"], ["runelay + MausBot", "/guides/mausbot/"], ["runelay + OpenCode", "/guides/opencode/"], ["runelay + OpenBot", "/guides/openbot/"], ["runelay + Kimi Code", "/guides/kimi-code/"], ["runelay migrate", "/docs/migrate/"]]],
      ["Learn", [["Self-hosted MCP gateway", "/self-hosted-mcp-gateway/"], ["Custom connectors", "/custom-connectors/"], ["MCP gateway vs MCP server", "/mcp-gateway-vs-mcp-server/"], ["Composio alternative", "/composio-alternative/"], ["Executor alternative", "/executor-alternative/"], ["Docker MCP Gateway alternative", "/docker-mcp-gateway-alternative/"], ["Obot alternative", "/obot-alternative/"], ["MCPHub alternative", "/mcphub-alternative/"], ["ContextForge alternative", "/contextforge-alternative/"], ["agentgateway alternative", "/agentgateway-alternative/"], ["Runelay vs Runlayer", "/vs/runlayer/"]]],
      ["Project", [["GitHub", REPO], ["Docs", "https://docs.runelay.com"], ["Releases", "/releases"], ["llms.txt", "/llms.txt"], ["Privacy", "/privacy/"], ["Terms", "/terms/"]]],
    ],
  },
  pt: {
    blurb: "Runelay é um gateway MCP open source. Um endpoint dá a todos os agentes as mesmas contas, skills e memórias, no seu computador ou no seu servidor.",
    contribute: "Contribuir",
    nav: "Rodapé",
    language: "Idioma",
    credit: "Licença MIT · Feito por",
    columns: [
      ["Produto", [["Baixar", "/download/"], ["Configurar", "/setup/"], ["Integrações", "/integrations/"], ["Changelog", "/changelog/"], ["Benchmark", "/benchmark/"]]],
      ["Guias", [["Todos os guias", "/guides/"], ["Compartilhar MCP entre agentes", "/guides/share-mcp-across-agents/"], ["runelay + Claude Code", "/guides/claude-code/"], ["runelay + Cursor", "/guides/cursor/"], ["runelay + Codex", "/guides/codex/"], ["runelay + agentes.chat", "/guides/agentes-chat/"], ["runelay + Antigravity", "/guides/antigravity/"], ["runelay + Grokbot", "/guides/grokbot/"], ["runelay + Hermes Agent", "/guides/hermes-agent/"], ["runelay + OpenClaw", "/guides/openclaw/"], ["runelay + MausBot", "/guides/mausbot/"], ["runelay + OpenCode", "/guides/opencode/"], ["runelay + OpenBot", "/guides/openbot/"], ["runelay + Kimi Code", "/guides/kimi-code/"], ["runelay migrate", "/docs/migrate/"]]],
      ["Entenda", [["MCP gateway self-hosted", "/self-hosted-mcp-gateway/"], ["Conectores personalizados", "/custom-connectors/"], ["MCP gateway vs MCP server", "/mcp-gateway-vs-mcp-server/"], ["Alternativa ao Composio", "/composio-alternative/"], ["Alternativa ao Executor", "/executor-alternative/"], ["Alternativa ao Docker MCP Gateway", "/docker-mcp-gateway-alternative/"], ["Alternativa ao Obot", "/obot-alternative/"], ["Alternativa ao MCPHub", "/mcphub-alternative/"], ["Alternativa ao ContextForge", "/contextforge-alternative/"], ["Alternativa ao agentgateway", "/agentgateway-alternative/"], ["Runelay vs Runlayer", "/vs/runlayer/"]]],
      ["Projeto", [["GitHub", REPO], ["Documentação", "https://docs.runelay.com"], ["Releases", "/releases"], ["llms.txt", "/llms.txt"], ["Privacidade", "/privacy/"], ["Termos", "/terms/"]]],
    ],
  },
};


const footer = (route) => {
  const pt = route.startsWith("/pt-br/");
  const copy = pt ? FOOTER.pt : FOOTER.en;
  const slug = route.endsWith("/") ? slugOf(route) : "/";
  const link = ([label, href]) => {
    if (href.startsWith("http")) return `<li><a href="${href}" target="_blank" rel="noopener">${label}</a></li>`;
    const target = href.endsWith("/") ? localized(href, pt) : href;
    return `<li><a href="${target}"${target === route ? ' aria-current="page"' : ""}>${label}</a></li>`;
  };
  const column = ([title, links]) => `<div><h2 class="footer-title">${title}</h2><ul>${links.map(link).join("")}</ul></div>`;
  return `<footer class="footer">
      <div class="footer-panel">
        <div class="footer-brand">
          <div class="footer-about"><a class="brand" href="${localized("/", pt)}"><img src="/favicon.svg" width="36" height="36" alt="" />runelay</a>
          <p>${copy.blurb}</p></div>
          <a class="footer-contribute" href="https://github.com/sponsors/Andsu-dev" target="_blank" rel="noreferrer"><span class="cup" aria-hidden="true">☕</span>${copy.contribute}</a>
        </div>
        <nav class="footer-nav" aria-label="${copy.nav}">${copy.columns.map(column).join("")}</nav>
        <div class="footer-bottom">
          <span class="footer-credit">${copy.credit} <a href="https://x.com/andersonbrdev" target="_blank" rel="noopener"><img src="/logos/andersonbrdev.jpg" width="20" height="20" alt="" loading="lazy" decoding="async" />Anderson Medeiros</a></span>
          <nav class="lang" aria-label="${copy.language}">
            <a href="${slug}" hreflang="en" aria-label="English" title="English"${pt ? "" : ' aria-current="page"'}>🇺🇸</a>
            <a href="/pt-br${slug}" hreflang="pt-BR" aria-label="Português" title="Português"${pt ? ' aria-current="page"' : ""}>🇧🇷</a>
          </nav>
        </div>
        <span class="footer-wordmark" aria-hidden="true">runelay</span>
      </div>
    </footer>`;
};

const structuredData = (route, html) => {
  if (!route.endsWith("/")) return "";
  const pt = route.startsWith("/pt-br/");
  const home = localized("/", pt);
  if (route === home) return jsonLd({ "@context": "https://schema.org", "@type": "WebSite", name: "Runelay", alternateName: ["runelay", "runelay.com"], url: `${ORIGIN}${home}`, inLanguage: pt ? "pt-BR" : "en" });
  const name = plain(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "").replace(/\s+/g, " ").trim();
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Runelay", item: `${ORIGIN}${home}` },
      { "@type": "ListItem", position: 2, name, item: `${ORIGIN}${route}` },
    ],
  });
};

const chrome = {
  name: "page-chrome",
  transformIndexHtml: {
    order: "pre",
    handler(html, { path }) {
      const route = routeOf(path.replace(/^\//, ""));
      return html.replace("</head>", `  ${structuredData(route, html)}\n  </head>`).replace("</body>", `  ${footer(route)}\n  </body>`);
    },
  },
};

const today = new Date().toISOString().slice(0, 10);

const committed = (file) => {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cs", "--", file], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const sourceOf = (file) => {
  if (file.includes("changelog/")) return "../../CHANGELOG.md";
  if (file.includes("integrations/")) return "../api/src/modules/catalog/constants/catalog.constants.ts";
  return "content.mjs";
};

const lastModified = (file) => committed(file) || committed(sourceOf(file)) || today;

const noindex = (file) => /<meta name="robots" content="noindex/.test(readFileSync(file, "utf8"));

const sitemap = {
  name: "sitemap",
  apply: "build",
  generateBundle() {
    const routes = new Map(pages.filter((file) => file.endsWith("index.html") && !noindex(file)).map((file) => [routeOf(file), file]));
    const urls = [...routes].map(([route, file]) => {
      const slug = slugOf(route);
      const alternates = [["en", slug], ["pt-BR", `/pt-br${slug}`], ["x-default", slug]]
        .filter(([, href]) => routes.has(href))
        .map(([lang, href]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${ORIGIN}${href}" />`);
      return ["  <url>", `    <loc>${ORIGIN}${route}</loc>`, `    <lastmod>${lastModified(file)}</lastmod>`, ...alternates, "  </url>"].join("\n");
    });
    this.emitFile({
      type: "asset",
      fileName: "sitemap.xml",
      source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`,
    });
  },
};

const cleanUrls = {
  name: "clean-urls",
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      const [path, query = ""] = request.url.split("?");
      if (!path.endsWith("/") && existsSync(`.${path}/index.html`)) request.url = `${path}/${query && `?${query}`}`;
      next();
    });
  },
};

const inlineCss = {
  name: "inline-css",
  apply: "build",
  enforce: "post",
  generateBundle(_options, bundle) {
    const styles = Object.values(bundle).filter((file) => file.fileName.endsWith(".css"));
    for (const file of Object.values(bundle)) {
      if (!file.fileName.endsWith(".html")) continue;
      let html = String(file.source);
      for (const style of styles) {
        const link = new RegExp(`<link rel="stylesheet"[^>]*href="/${style.fileName}"[^>]*>`);
        html = html.replace(link, `<style>${style.source}</style>`);
      }
      file.source = html;
    }
  },
};

export default defineConfig({
  appType: "mpa",
  plugins: [cleanUrls, chrome, sitemap, inlineCss, react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("../web/src", import.meta.url)) },
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/react-router"],
  },
  build: {
    target: "es2022",
    rollupOptions: { input: pages },
  },
});
