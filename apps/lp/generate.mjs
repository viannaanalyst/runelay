import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { card, checks, code, escape, icon, jsonLd, links, plain, prose, steps } from "./blocks.mjs";
import { AGENT_LINKS, EXISTING, INTEGRATION_EXTRAS, INTEGRATIONS_EN, PAGES } from "./content.mjs";
import { FEATURES } from "./features.mjs";

const ORIGIN = "https://runelay.com";
const CATALOG = "../api/src/modules/catalog/constants/catalog.constants.ts";
const CHANGELOG = "../../CHANGELOG.md";

const LANGS = {
  en: { prefix: "", html: "en", locale: "en_US", og: "/og.png", home: "index.html", cta: "composio-alternative/index.html", copy: "Copy", copied: "Copied", questions: "Questions", more: "Keep reading" },
  pt: { prefix: "/pt-br", html: "pt-BR", locale: "pt_BR", og: "/og-pt.png", home: "pt-br/index.html", cta: "pt-br/composio-alternative/index.html", copy: "Copiar", copied: "Copiado", questions: "Perguntas", more: "Continue lendo" },
};

const CTA_NOTE = {
  en: "Free and open source. Runs on your computer or your server.",
  pt: "Grátis e open source. Roda no seu computador ou no seu servidor.",
};

const chrome = Object.fromEntries(
  Object.entries(LANGS).map(([lang, { home, cta }]) => [
    lang,
    {
      topbar: readFileSync(home, "utf8")
        .match(/<header class="topbar">[\s\S]*?<\/header>/)[0]
        .replaceAll(' aria-current="page"', ""),
      cta: readFileSync(cta, "utf8")
        .match(/<div class="bench-cta"[\s\S]*?<\/div>/)[0]
        .replace(/<strong>([^<]*)<\/strong>/, (_match, title) => `<div class="bench-cta-copy"><strong>${title}</strong><span>${CTA_NOTE[lang]}</span></div>`),
    },
  ]),
);

const faqCard = (items, lang) =>
  `<section class="page-section" data-reveal><h2 class="section-title">${LANGS[lang].questions}</h2><div class="faq faq-list">${items
    .map(
      ([question, answer]) =>
        `<details><summary>${question}<svg class="chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></summary><div class="answer"><p>${answer}</p></div></details>`,
    )
    .join("")}</div></section>`;

const faqSchema = (items) =>
  jsonLd({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(([question, answer]) => ({ "@type": "Question", name: plain(question), acceptedAnswer: { "@type": "Answer", text: plain(answer) } })),
  });

const registry = new Map();

const related = (slugs, lang) =>
  `<nav class="guides page-section" aria-label="${LANGS[lang].more}" data-reveal><h2 class="section-title">${LANGS[lang].more}</h2>${links(
    slugs.map((slug) => {
      const entry = registry.get(slug);
      return [`/${slug}/`, entry.icon, ...entry[lang]];
    }),
  )}</nav>`;

const eyebrow = (page, mark) => {
  if (mark) return `<p class="bench-eyebrow" data-reveal><span class="vs"><img src="/favicon.svg" width="16" height="16" alt="" />runelay</span><em>+</em><span class="vs">${mark[1]}${mark[0]}</span><span class="dot"></span>${page.eyebrow}</p>`;
  const versus = page.vs ? `<em>vs</em><span class="vs"><img src="${page.vs[1]}" width="16" height="16" alt="" />${page.vs[0]}</span>` : "";
  return `<p class="bench-eyebrow" data-reveal><span class="vs"><img src="/favicon.svg" width="16" height="16" alt="" />runelay</span>${versus}<span class="dot"></span>${page.eyebrow}</p>`;
};

const document = (slug, lang, page, relatedSlugs, mark) => {
  const { prefix, html, locale, og, copy, copied } = LANGS[lang];
  const url = `${ORIGIN}${prefix}/${slug}/`;
  const faq = page.faq?.length ? page.faq : null;
  const body = `<!doctype html>
<html lang="${html}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${escape(page.title)}</title>
    <meta name="description" content="${escape(page.description)}" />
    ${page.noindex ? '<meta name="robots" content="noindex,follow" />' : ""}
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Runelay" />
    <meta property="og:title" content="${escape(page.title)}" />
    <meta property="og:description" content="${escape(page.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${ORIGIN}${og}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="${locale}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@andersonbrdev" />
    <meta name="twitter:image" content="${ORIGIN}${og}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" hreflang="en" href="${ORIGIN}/${slug}/" />
    <link rel="alternate" hreflang="pt-BR" href="${ORIGIN}/pt-br/${slug}/" />
    <link rel="alternate" hreflang="x-default" href="${ORIGIN}/${slug}/" />
    <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/styles.css" />
    ${faq ? faqSchema(faq) : ""}
    <script>document.documentElement.classList.add("js");</script>
    <script type="module" src="/main.js"></script>
  </head>
  <body>
    ${chrome[lang].topbar}

    <main class="page bench-page guide">
      <section class="hero bench-hero">
        ${eyebrow(page, mark)}
        <h1 data-reveal>${page.h1}</h1>
        <p class="lead" data-reveal>${page.lead}</p>
        ${page.hero ?? ""}
      </section>

      <section class="bench">
        ${page.body.join("\n        ")}
        ${faq ? faqCard(faq, lang) : ""}
        ${chrome[lang].cta}
        ${related(relatedSlugs, lang)}
      </section>
    </main>
  </body>
</html>
`;
  const localized = lang === "pt" ? body.replace(/(<main[\s\S]*<\/main>)/, (main) => main.replace(/href="\/((?!pt-br\/)[a-z][^"]*\/)?(#[^"]*)?"/g, (_match, path = "", hash = "") => `href="/pt-br/${path}${hash}"`)) : body;
  const file = `${prefix.slice(1)}${prefix ? "/" : ""}${slug}/index.html`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, localized.replaceAll("{{copy}}", copy).replaceAll("{{copied}}", copied));
};

const source = readFileSync(CATALOG, "utf8");
const sectionStarts = [...source.matchAll(/\n {4}id: "([^"]+)",\n {4}title: "([^"]+)",/g)].map((match) => ({ id: match[1], title: match[2], index: match.index }));
const BRANDS = JSON.parse(readFileSync("integration-icons.json", "utf8"));

const logo = (id, key, size = 18) => {
  const brand = BRANDS[key];
  if (brand) return `<span class="brow-icon logo"><svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="${brand.color ?? "currentColor"}" d="${brand.path}"/></svg></span>`;
  const file = ["svg", "png"].map((extension) => `logos/integrations/${id.replaceAll("_", "-")}.${extension}`).find((path) => existsSync(`public/${path}`));
  if (!file) throw new Error(`no logo for ${id}`);
  return `<span class="brow-icon logo"><img src="/${file}" width="${size + 2}" height="${size + 2}" alt="" loading="lazy" decoding="async" /></span>`;
};

const catalog = [...source.matchAll(/id: "([^"]+)",\s*name: "([^"]+)",\s*description: "([^"]+)",\s*url: "([^"]+)",\s*icon: ("[^"]+"|null),\s*auth: "([^"]+)",(?:\s*tokenUrl: "([^"]+)",)?/g)].map((match) => ({
  id: match[1],
  slug: match[1].replaceAll("_", "-"),
  name: match[2],
  pt: match[3],
  en: INTEGRATIONS_EN.descriptions[match[1]] ?? match[3],
  url: match[4],
  logo: (size) => logo(match[1], match[5].replaceAll('"', ""), size),
  auth: match[6],
  tokenUrl: match[7],
  section: sectionStarts.findLast((section) => section.index < match.index).id,
}));
const expected = [...source.matchAll(/\n {8}id: "/g)].length;
if (catalog.length !== expected) throw new Error(`catalog parse found ${catalog.length} of ${expected} integrations`);

const AUTH = {
  en: { oauth: "OAuth login", api_key: "API key", none: "No login" },
  pt: { oauth: "Login OAuth", api_key: "Chave de API", none: "Sem login" },
};

const integration = (item) => {
  const { name, url, auth, tokenUrl } = item;
  const extras = INTEGRATION_EXTRAS[item.id];
  const art = extras?.feminine ? { o: "a", O: "A", do: "da", no: "na", dele: "dela" } : { o: "o", O: "O", do: "do", no: "no", dele: "dele" };
  const connect = {
    en: {
      oauth: [
        ["Open the connectors in the panel", `Pick ${name} from the catalog.`],
        ["Log in once", `A browser tab opens on ${name}. Approve the access and close it.`],
        ["Done", "The token is stored encrypted on your server and refreshed by Runelay. Every agent with a Runelay key can use the connection."],
      ],
      api_key: [
        ["Create a token", `Create a personal access token at <a href="${tokenUrl}" rel="noopener">${plain(tokenUrl ?? "").replace("https://", "")}</a> with the access you want your agents to have.`],
        ["Paste it in the panel", `Pick ${name} from the catalog in the connectors and paste the token.`],
        ["Done", "The token is stored encrypted on your server. Every agent with a Runelay key can use the connection."],
      ],
      none: [
        ["Open the connectors in the panel", `Pick ${name} from the catalog.`],
        ["Done", `${name} needs no login. Every agent with a Runelay key can use the connection.`],
      ],
    },
    pt: {
      oauth: [
        ["Abra os conectores no painel", `Escolha ${name} no catálogo.`],
        ["Faça login uma vez", `Uma aba do navegador abre ${art.no} ${name}. Aprove o acesso e feche.`],
        ["Pronto", "O token fica criptografado no seu servidor e é renovado pelo Runelay. Todo agente com uma chave do Runelay pode usar a conexão."],
      ],
      api_key: [
        ["Crie um token", `Crie um token de acesso pessoal em <a href="${tokenUrl}" rel="noopener">${plain(tokenUrl ?? "").replace("https://", "")}</a> com o acesso que os seus agentes devem ter.`],
        ["Cole no painel", `Escolha ${name} no catálogo dos conectores e cole o token.`],
        ["Pronto", "O token fica criptografado no seu servidor. Todo agente com uma chave do Runelay pode usar a conexão."],
      ],
      none: [
        ["Abra os conectores no painel", `Escolha ${name} no catálogo.`],
        ["Pronto", `${art.O} ${name} não pede login. Todo agente com uma chave do Runelay pode usar a conexão.`],
      ],
    },
  };
  const agents = (lang) =>
    links(
      ["guides/claude-code", "guides/cursor", "guides/codex"].map((slug) => {
        const entry = registry.get(slug);
        return [`/${slug}/`, entry.icon, ...entry[lang]];
      }),
    );
  const showcase = (lang) => {
    const extra = extras?.[lang];
    if (!extra) return [];
    return [
      extra.about && card("spark", extra.aboutTitle, prose(...extra.about)),
      extra.groups && card("hub", extra.groupsTitle, checks(extra.groups.map(([title, text]) => `<strong>${title}.</strong> ${text}`))),
      extra.prompts && card("terminal", extra.promptsTitle, checks(extra.prompts.map((prompt) => `“${prompt}”`), "arrow")),
      extra.access && card("shield", extra.accessTitle, checks(extra.access)),
    ].filter(Boolean);
  };
  const callToAction = (lang) => {
    const extra = extras?.[lang];
    if (!extra?.cta) return [];
    return [card("arrow", extra.ctaTitle, prose(extra.cta, `<a class="button-solid small" href="${extras.site}" rel="noopener">${extra.ctaLabel}</a>`))];
  };
  const pick = (lang, key, fallback) => extras?.[lang]?.[key] ?? fallback;
  return {
    slug: `integrations/${item.slug}`,
    icon: item.logo(18),
    mark: [name, item.logo(13)],
    related: ["integrations", "guides/share-mcp-across-agents", "docs/migrate"],
    en: {
      title: `${name} MCP for Claude Code, Cursor and Codex · Runelay`,
      noindex: !extras,
      description: pick("en", "description", `Connect ${name} once to Runelay, an open source MCP gateway, and use it from Claude Code, Cursor, Codex and Grok. ${AUTH.en[auth]}, credentials stay on your server.`),
      eyebrow: `Integration · ${AUTH.en[auth]}`,
      h1: `${name} on Runelay, an open source MCP gateway`,
      lead: pick("en", "lead", `Connect ${name} once. Claude Code, Cursor, Codex and Grok all use that connection, and the credential never leaves your server.`),
      cardTitle: `${name}`,
      cardText: item.en,
      body: [
        ...showcase("en"),
        card(
          "plug",
          "What this connection does",
          extras?.en?.connection ? prose(...extras.en.connection) : prose(
            `${item.en} Runelay connects to the ${name} remote MCP server at <code>${url}</code> and puts its tools behind your own endpoint.`,
            `Agents find them with <code>search_tools</code> and run them with <code>call_tool</code>, so the ${name} tool list is not loaded into context until it is needed.`,
          ),
        ),
        card("shield", `Connect ${name}`, steps(connect.en[auth]), false),
        card("terminal", `Use ${name} in your agents`, prose(`Agents do not need a ${name} entry of their own. Point each one at Runelay and ${name} is there.`) + agents("en")),
        ...callToAction("en"),
      ],
      faq: extras?.en?.faq ?? [
        [`Does my ${name} credential reach the agent?`, auth === "none" ? `${name} needs no credential. Agents only hold their Runelay key.` : `No. It stays on your Runelay server, encrypted with AES-256-GCM using your RUNELAY_SECRET. Agents only hold their Runelay key.`],
        [`Do I connect ${name} once per agent?`, `No. You connect it once in Runelay, and every agent that points at your endpoint uses the same connection.`],
        [`I already have ${name} set up in an agent. Can I bring it?`, `Yes. runelay migrate reads the MCP servers your agents already have. If the CLI can read the token it arrives connected; otherwise it waits in the reconnect queue in the panel.`],
      ],
    },
    pt: {
      title: `MCP ${art.do} ${name} para Claude Code, Cursor e Codex · Runelay`,
      noindex: !extras,
      description: pick("pt", "description", `Conecte ${art.o} ${name} uma vez ao Runelay, gateway MCP open source, e use no Claude Code, Cursor, Codex e Grok. ${AUTH.pt[auth]}, credenciais no seu servidor.`),
      eyebrow: `Integração · ${AUTH.pt[auth]}`,
      h1: `${name} no Runelay, gateway MCP open source`,
      lead: pick("pt", "lead", `Conecte ${art.o} ${name} uma vez. Claude Code, Cursor, Codex e Grok usam essa mesma conexão, e a credencial não sai do seu servidor.`),
      cardTitle: `${name}`,
      cardText: item.pt,
      body: [
        ...showcase("pt"),
        card(
          "plug",
          "O que essa conexão faz",
          extras?.pt?.connection ? prose(...extras.pt.connection) : prose(
            `${item.pt} O Runelay se conecta ao servidor MCP remoto ${art.do} ${name} em <code>${url}</code> e coloca as tools ${art.dele} atrás do seu endpoint.`,
            `Os agentes encontram as tools com <code>search_tools</code> e executam com <code>call_tool</code>, então a lista de tools ${art.do} ${name} só entra no contexto quando é necessária.`,
          ),
        ),
        card("shield", `Conectar ${art.o} ${name}`, steps(connect.pt[auth]), false),
        card("terminal", `Usar ${art.o} ${name} nos agentes`, prose(`Os agentes não precisam de uma entrada própria ${art.do} ${name}. Aponte cada um para o Runelay e ${art.o} ${name} aparece.`) + agents("pt")),
        ...callToAction("pt"),
      ],
      faq: extras?.pt?.faq ?? [
        [`A credencial ${art.do} ${name} chega ao agente?`, auth === "none" ? `${art.O} ${name} não usa credencial. Os agentes guardam só a chave do Runelay.` : `Não. Ela fica no seu servidor Runelay, criptografada com AES-256-GCM usando o seu RUNELAY_SECRET. Os agentes guardam só a chave do Runelay.`],
        [`Preciso conectar ${art.o} ${name} em cada agente?`, `Não. Você conecta uma vez no Runelay, e todo agente que aponta para o seu endpoint usa a mesma conexão.`],
        [`Já tenho ${art.o} ${name} configurad${art.o} num agente. Dá para trazer?`, `Sim. O runelay migrate lê os servidores MCP que os agentes já têm. Se a CLI consegue ler o token, a conta chega conectada; senão, espera na fila de reconexão do painel.`],
      ],
    },
  };
};

const hub = () => {
  const list = (lang) =>
    sectionStarts
      .map((section) =>
        card(
          "plug",
          lang === "en" ? (INTEGRATIONS_EN.sections[section.id] ?? section.title) : section.title,
          links(catalog.filter((item) => item.section === section.id).map((item) => [`/integrations/${item.slug}/`, item.logo(18), `${item.name} · ${AUTH[lang][item.auth]}`, item[lang]])),
          false,
        ),
      )
      .join("\n        ");
  const count = catalog.length;
  return {
    slug: "integrations",
    icon: "plug",
    related: ["custom-connectors", "guides/share-mcp-across-agents", "docs/migrate"],
    en: {
      title: "Runelay integrations: MCP servers for Claude Code, Cursor and Codex",
      description: `The ${count} MCP integrations in the catalog of Runelay, an open source MCP gateway, plus how to add any remote MCP, local MCP or OpenAPI spec.`,
      eyebrow: `Integrations · ${count} in the catalog`,
      h1: "Integrations",
      lead: `Runelay, an open source MCP gateway, ships a catalog of ${count} MCP servers. Connect one once and every agent can use it.`,
      cardTitle: "Integrations",
      cardText: `The ${count} MCP servers in the catalog, and how to add your own.`,
      body: [
        list("en"),
        card(
          "hub",
          "Not on the list?",
          checks(["Any remote MCP server, by URL.", "Any local MCP server that runs as a command.", "Any API described by an OpenAPI spec."]) +
            prose("The catalog is a shortcut, not a limit. Whatever you add shows up for every agent through the same endpoint.") +
            links([["/custom-connectors/", "plug", "Not in the catalog? Add a custom connector", "Remote MCP, local command or OpenAPI spec, with your own OAuth client if needed."]]),
        ),
      ],
      faq: [
        ["Do all integrations use OAuth?", "No. Most use OAuth, including GitHub and Google, a few take an API key and some public servers need no login. Each entry shows which."],
        ["Who runs these MCP servers?", "Each entry points at a remote MCP server on the provider's own domain. Runelay connects to it from your server and keeps the credential."],
        ["Can I request a new integration?", "Open an issue at github.com/runelay/runelay. Meanwhile, any remote MCP URL can be added from the panel."],
      ],
    },
    pt: {
      title: "Integrações do Runelay: servidores MCP para Claude Code, Cursor e Codex",
      description: `As ${count} integrações MCP do catálogo do Runelay, gateway MCP open source, e como adicionar qualquer MCP remoto, MCP local ou spec OpenAPI.`,
      eyebrow: `Integrações · ${count} no catálogo`,
      h1: "Integrações",
      lead: `O Runelay, gateway MCP open source, traz um catálogo de ${count} servidores MCP. Conecte um deles uma vez e todos os agentes podem usar.`,
      cardTitle: "Integrações",
      cardText: `Os ${count} servidores MCP do catálogo, e como adicionar os seus.`,
      body: [
        list("pt"),
        card(
          "hub",
          "Não está na lista?",
          checks(["Qualquer servidor MCP remoto, pela URL.", "Qualquer servidor MCP local que roda como comando.", "Qualquer API descrita por uma spec OpenAPI."]) +
            prose("O catálogo é um atalho, não um limite. O que você adicionar aparece para todos os agentes pelo mesmo endpoint.") +
            links([["/custom-connectors/", "plug", "Não está no catálogo? Adicione um conector personalizado", "MCP remoto, comando local ou spec OpenAPI, com o seu próprio cliente OAuth se precisar."]]),
        ),
      ],
      faq: [
        ["Todas as integrações usam OAuth?", "Não. A maioria usa OAuth, inclusive GitHub e Google, alguns pedem uma chave de API e alguns servidores públicos não pedem login. Cada item mostra qual é o caso."],
        ["Quem roda esses servidores MCP?", "Cada item aponta para um servidor MCP remoto no domínio do próprio provedor. O Runelay se conecta a ele a partir do seu servidor e guarda a credencial."],
        ["Posso pedir uma integração nova?", "Abra uma issue em github.com/runelay/runelay. Enquanto isso, qualquer URL de MCP remoto pode ser adicionada pelo painel."],
      ],
    },
  };
};

const inline = (text) =>
  escape(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>');

const released = (version) => {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cs", version], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

const changelog = () => {
  const releases = readFileSync(CHANGELOG, "utf8")
    .split(/\n(?=## )/)
    .filter((block) => block.startsWith("## "))
    .map((block) => {
      const [heading, ...lines] = block.split("\n");
      const version = heading.slice(3).trim();
      const parts = [];
      let fence = null;
      for (const line of lines) {
        if (line.startsWith("```")) {
          if (fence) parts.push(code(fence.join("\n")));
          fence = fence ? null : [];
        } else if (fence) fence.push(line);
        else if (line.startsWith("### ")) parts.push(`<h3>${inline(line.slice(4))}</h3>`);
        else if (line.startsWith("- ")) {
          if (!parts.at(-1)?.startsWith("<ul>")) parts.push("<ul>");
          parts.push(`${parts.pop()}<li>${inline(line.slice(2))}</li>`);
        } else if (line.trim()) parts.push(`<p>${inline(line)}</p>`);
      }
      const date = released(version);
      const body = parts.map((part) => (part.startsWith("<ul>") ? `${part}</ul>` : part)).join("");
      return `<div class="bcard" id="${version.replaceAll(".", "-")}"><h2 class="bcard-title">${icon("clock")}${version}${date ? `<time datetime="${date}">${date}</time>` : ""}</h2><div class="bcard-body changes">${body}</div></div>`;
    });
  const latest = releases[0].match(/id="([^"]+)"/)[1].replaceAll("-", ".");
  const page = (lang) => ({
    title: lang === "en" ? "Runelay changelog: every release of the open source MCP gateway" : "Changelog do Runelay: todas as versões do gateway MCP open source",
    description:
      lang === "en"
        ? `What changed in each release of Runelay, an open source MCP gateway. Latest: ${latest}.`
        : `O que mudou em cada versão do Runelay, gateway MCP open source. Mais recente: ${latest}.`,
    eyebrow: lang === "en" ? `Changelog · latest ${latest}` : `Changelog · versão ${latest}`,
    h1: "Changelog",
    lead:
      lang === "en"
        ? `Every release of Runelay, an open source MCP gateway. Installers and binaries are on <a href="https://github.com/Andsu-dev/runelay/releases" rel="noopener">GitHub releases</a>.`
        : `Todas as versões do Runelay, gateway MCP open source. As notas são escritas em inglês. Instaladores e binários ficam nos <a href="https://github.com/Andsu-dev/runelay/releases" rel="noopener">releases do GitHub</a>.`,
    cardTitle: "Changelog",
    cardText: lang === "en" ? "What changed in each release." : "O que mudou em cada versão.",
    body: releases,
    faq: [],
  });
  return { slug: "changelog", icon: "clock", related: ["download", "docs/migrate", "benchmark"], en: page("en"), pt: page("pt") };
};

for (const [slug, entry] of Object.entries(EXISTING)) registry.set(slug, entry);
for (const page of PAGES) registry.set(page.slug, { icon: page.icon, en: [page.en.cardTitle, page.en.cardText], pt: [page.pt.cardTitle, page.pt.cardText] });

const HOME_READS = ["self-hosted-mcp-gateway", "composio-alternative", "mcp-gateway-vs-mcp-server", "guides/share-mcp-across-agents", "docs/migrate", "executor-alternative"];

const agentGuides = PAGES.filter((page) => page.mark);

const agentTile = (base, page) => `<a class="agent-tile" href="${base}/${page.slug}/">${page.mark[1]}<span>${page.mark[0]}</span></a>`;

const HOME_AGENTS = 9;

const guidesHub = () => {
  const agents = (lang) => card("plug", lang === "pt" ? "Por agente" : "Per agent", links(AGENT_LINKS[lang]));
  const reads = (lang) =>
    `<nav class="guides page-section" data-reveal>${links(HOME_READS.map((slug) => [`/${slug}/`, registry.get(slug).icon, ...registry.get(slug)[lang]]))}</nav>`;
  const count = agentGuides.length;
  return {
    slug: "guides",
    icon: "book",
    related: ["guides/share-mcp-across-agents", "docs/migrate", "integrations"],
    en: {
      title: "Runelay guides: connect every AI agent to one MCP gateway",
      description: `Setup guides for ${count} agents and bots on Runelay, an open source MCP gateway, plus short reads on MCP gateways and self-hosting.`,
      eyebrow: `Guides · ${count} agents`,
      h1: "Guides",
      lead: "Pick your agent to connect it to Runelay, or read how an MCP gateway fits in.",
      cardTitle: "All guides",
      cardText: `Setup for ${count} agents and bots, plus short reads.`,
      body: [agents("en"), reads("en")],
      faq: [],
    },
    pt: {
      title: "Guias do Runelay: conecte todo agente de IA a um gateway MCP",
      description: `Guias de configuração para ${count} agentes e bots no Runelay, gateway MCP open source, e leituras curtas sobre gateway MCP e self-hosting.`,
      eyebrow: `Guias · ${count} agentes`,
      h1: "Guias",
      lead: "Escolha o seu agente para conectar ao Runelay, ou leia como um gateway MCP se encaixa.",
      cardTitle: "Todos os guias",
      cardText: `Configuração para ${count} agentes e bots, e leituras curtas.`,
      body: [agents("pt"), reads("pt")],
      faq: [],
    },
  };
};

const generated = [...PAGES, ...FEATURES, hub(), guidesHub(), ...catalog.map(integration), changelog()];
for (const page of generated) registry.set(page.slug, { icon: page.icon, en: [page.en.cardTitle, page.en.cardText], pt: [page.pt.cardTitle, page.pt.cardText] });

for (const page of generated) for (const lang of ["en", "pt"]) document(page.slug, lang, page[lang], page.related, page.mark);


const homeGuides = (lang) => {
  const base = LANGS[lang].prefix;
  const all = lang === "pt" ? "Ver todos" : "See all";
  const more = `<a class="agent-tile more" href="${base}/guides/"><span class="brow-icon logo">${icon("arrow", 20)}</span><span>${all} · ${agentGuides.length}</span></a>`;
  const agents = agentGuides.slice(0, HOME_AGENTS).map((page) => agentTile(base, page)).join("") + more;
  const reads = links(HOME_READS.map((slug) => [`${base}/${slug}/`, registry.get(slug).icon, ...registry.get(slug)[lang]]));
  return `<div class="agent-tiles" data-reveal>${agents}</div><div class="guides page-section home-guides" data-reveal>${reads}</div>`;
};

for (const lang of ["en", "pt"]) {
  const file = LANGS[lang].home;
  const html = readFileSync(file, "utf8");
  writeFileSync(file, html.replace(/<!-- home-guides -->[\s\S]*?<!-- \/home-guides -->/, `<!-- home-guides -->${homeGuides(lang)}<!-- /home-guides -->`));
}

console.log(`generated ${generated.length * 2} pages`);
