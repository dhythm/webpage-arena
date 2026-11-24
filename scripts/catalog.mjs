import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readMeta, siteCoverage, stepsOf } from "./sites.mjs";
const repo = resolve(import.meta.dirname, "..");
const defaults = {
  templatePath: join(repo, "index.html"),
  typesPath: join(repo, "site-types.json"),
};
const html = "text/html; charset=utf-8";
export const TOP_LIMIT = 6;
const promptName = /^[A-Za-z0-9_-]+$/;
const dimensions = [
  ["prompt", "お題"],
  ["type", "種別"],
  ["model", "制作"],
  ["tool", "ツール"],
];
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
const disclaimer = "作ったときの指示の流れを、読みやすく整えて記録したものです。再現手順ではなく、同じ指示を渡しても同じページになるとは限りません。";
const recorded = (value) => (value === "unknown" ? "記録なし" : value);
const present = (value) => typeof value === "string" && value.trim() !== "" && value !== "unknown";
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const validDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
export function orderSites(sites) {
  return [...sites].sort((a, b) => {
    const x = validDate(a.created) ? a.created : null;
    const y = validDate(b.created) ? b.created : null;
    if (x !== y) {
      if (x === null) return 1;
      if (y === null) return -1;
      return compare(y, x);
    }
    return compare(a.id, b.id);
  });
}
async function isFile(path) {
  return (await stat(path).catch(() => null))?.isFile() ?? false;
}
function splitPrompt(text) {
  const front = text.match(/^---\n([\s\S]*?)\n---\n/);
  const body = front ? text.slice(front[0].length) : text;
  const type = front?.[1].match(/^type:\s*(\S+)\s*$/m)?.[1] ?? null;
  const heading = body.match(/^#\s+(.+?)\s*$/m)?.[1] ?? null;
  return { type, title: heading && type ? withoutTypeId(heading, type) : heading };
}
function withoutTypeId(heading, type) {
  const id = new RegExp(`\\s*（${type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}）\\s*(—)?\\s*`);
  const match = heading.match(id);
  if (!match) return heading;
  return heading.replace(id, match[1] ? " — " : " ").trim();
}
export async function listPrompts(root) {
  const entries = await readdir(join(root, "prompts")).catch(() => []);
  return entries
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .map((file) => file.slice(0, -".md".length))
    .filter((name) => promptName.test(name))
    .sort(compare);
}
const promptHref = (promptPath) =>
  `prompts/${promptPath.slice("prompts/".length, -".md".length)}.html`;
async function readMaking(root, id, meta) {
  if (typeof meta.promptPath !== "string" || !["oneshot", "refined"].includes(meta.making)) return null;
  const text = await readFile(join(root, id, "making.md"), "utf8").catch(() => null);
  const steps = text === null ? [] : stepsOf(text);
  if (!steps.length) return null;
  const label = meta.making === "oneshot" ? "ワンショット" : `ブラッシュアップ（追加の指示${steps.length - 1}回）`;
  return { label, href: `making/${id}.html` };
}
export async function loadCatalog(root, options = {}) {
  const typesPath = options.typesPath ?? defaults.typesPath;
  const types = JSON.parse(await readFile(typesPath, "utf8"));
  const typeOrder = new Map(types.map((type, index) => [type.id, index]));
  const typeLabel = new Map(types.map((type) => [type.id, type.label]));
  const rank = (type) => typeOrder.get(type) ?? types.length;
  const { sites: ids } = await siteCoverage(root);
  const prompts = new Map();
  const sites = [];
  for (const id of ids) {
    const meta = await readMeta(root, id);
    const promptPath = typeof meta.promptPath === "string" ? meta.promptPath : null;
    if (promptPath && !prompts.has(promptPath)) {
      const text = await readFile(join(root, promptPath), "utf8").catch(() => "");
      prompts.set(promptPath, splitPrompt(text));
    }
    sites.push({
      id,
      title: meta.title,
      tagline: meta.tagline,
      type: meta.type,
      typeLabel: typeLabel.get(meta.type) ?? meta.type,
      model: present(meta.model) ? meta.model : "unknown",
      tool: meta.tool,
      created: meta.created,
      promptPath,
      promptHref: promptPath ? promptHref(promptPath) : null,
      href: `${id}/`,
      thumb: typeof meta.thumbnail === "string" ? `${id}/${meta.thumbnail}` : null,
      group: promptPath ?? `type:${meta.type}`,
      making: await readMaking(root, id, meta),
    });
  }
  const groups = new Map();
  for (const site of sites) {
    if (!groups.has(site.group)) {
      const prompt = site.promptPath ? prompts.get(site.promptPath) : null;
      const type = prompt?.type ?? site.type;
      groups.set(site.group, {
        key: site.group,
        promptPath: site.promptPath,
        promptHref: site.promptHref,
        type,
        label: site.promptPath ? prompt?.title ?? site.promptPath : site.typeLabel,
        filterLabel: site.promptPath ? prompt?.title ?? site.promptPath : site.typeLabel,
        sites: [],
      });
    }
    groups.get(site.group).sites.push(site);
  }
  const ordered = [...groups.values()].sort(
    (a, b) =>
      (a.promptPath ? 0 : 1) - (b.promptPath ? 0 : 1) ||
      rank(a.type) - rank(b.type) ||
      compare(a.key, b.key),
  );
  for (const group of ordered) for (const site of group.sites) site.others = group.sites.length - 1;
  const promptNames = new Set(await listPrompts(root));
  const genreIds = [...new Set(sites.map((site) => site.type))].sort(
    (a, b) => rank(a) - rank(b) || compare(a, b),
  );
  const genres = genreIds.map((id) => ({
    id,
    label: typeLabel.get(id) ?? id,
    promptHref: promptNames.has(id) ? `prompts/${id}.html` : null,
    sites: orderSites(sites.filter((site) => site.type === id)),
  }));
  const count = (key) => {
    const counts = new Map();
    for (const site of sites) counts.set(site[key], (counts.get(site[key]) ?? 0) + 1);
    return counts;
  };
  const choices = (key, label, order) =>
    [...count(key)]
      .map(([value, total]) => ({ value, label: label(value), count: total }))
      .sort(order);
  const byLabel = (a, b) => a.label.localeCompare(b.label, "ja");
  const groupIndex = new Map(ordered.map((group, index) => [group.key, index]));
  return {
    sites: genres.flatMap((genre) => genre.sites),
    groups: ordered,
    genres,
    topLimit: options.topLimit ?? TOP_LIMIT,
    filters: {
      prompt: choices(
        "group",
        (key) => groups.get(key).filterLabel,
        (a, b) => groupIndex.get(a.value) - groupIndex.get(b.value),
      ),
      type: choices(
        "type",
        (type) => typeLabel.get(type) ?? type,
        (a, b) => rank(a.value) - rank(b.value) || compare(a.value, b.value),
      ),
      model: choices("model", recorded, byLabel),
      tool: choices("tool", recorded, byLabel),
    },
  };
}
export function renderCard(site, base = "", { siblings: showSiblings = true } = {}) {
  const e = escapeHtml;
  site = {
    ...site,
    href: base + site.href,
    thumb: site.thumb && base + site.thumb,
    promptHref: site.promptHref && base + site.promptHref,
  };
  const making = site.making
    ? `
                <div><dt>作り方</dt><dd>${e(site.making.label)}</dd></div>`
    : "";
  const thumb = site.thumb
    ? `<a class="thumb" href="${e(site.href)}" tabindex="-1" aria-hidden="true"><img src="${e(site.thumb)}" alt="" loading="lazy" decoding="async" width="640" height="400" /></a>`
    : `<div class="thumb thumb-none" aria-hidden="true">サムネイルなし</div>`;
  const prompt = site.making
    ? `<a href="${e(base + site.making.href)}">作り方を読む</a>`
    : site.promptHref
    ? `<a href="${e(site.promptHref)}">プロンプトを読む</a>`
    : `<span><span aria-hidden="true">プロンプト未収録</span><span class="sr-only">プロンプト未収録（元のプロンプトは残っていません）</span></span>`;
  const tool = present(site.model) ? "" : `
                <div><dt>ツール</dt><dd>${e(recorded(site.tool))}</dd></div>`;
  const kind = site.promptHref ? "お題" : "種別";
  const siblings = showSiblings && site.others > 0 ? `<span class="siblings">同じ${kind}のほかの作品 ${site.others} 件</span>` : "";
  return `<li class="card" data-card data-id="${e(site.id)}" data-prompt="${e(site.group)}" data-type="${e(site.type)}" data-model="${e(site.model)}" data-tool="${e(site.tool)}">
            ${thumb}
            <div class="card-body">
              <h3 class="card-title"><a href="${e(site.href)}">${e(site.title)}</a></h3>
              <p class="tagline">${e(site.tagline)}</p>
              <dl class="facts">
                <div><dt>制作</dt><dd>${e(recorded(site.model))}</dd></div>${tool}
                <div><dt>${kind}</dt><dd>${e(site.typeLabel)}</dd></div>
                <div><dt>作成日</dt><dd>${present(site.created) ? `<time datetime="${e(site.created)}">${e(site.created)}</time>` : "記録なし"}</dd></div>${making}
              </dl>
              <p class="card-foot">${prompt}${siblings}</p>
            </div>
          </li>`;
}
function renderRow(genre, base, capped) {
  const e = escapeHtml;
  return `<ul class="row" role="list" tabindex="0"${capped ? " data-capped" : ""} aria-label="${e(genre.label)}の作品、横にスクロール">
          ${genre.sites.map((site) => renderCard(site, base)).join("\n          ")}
        </ul>`;
}
function renderGrid(genre, base) {
  const e = escapeHtml;
  return `<ul class="grid" role="list" aria-label="${e(genre.label)}の作品">
          ${genre.sites.map((site) => renderCard(site, base, { siblings: false })).join("\n          ")}
        </ul>`;
}
function renderGroups(catalog) {
  const e = escapeHtml;
  return catalog.genres
    .map((genre, index) => {
      const id = `group-${index + 1}`;
      const prompt = genre.promptHref ? `・<a href="${e(genre.promptHref)}">お題を読む</a>` : "";
      return `<section class="group" data-group="${e(genre.id)}" aria-labelledby="${id}">
        <div class="group-head">
          <h2 id="${id}">${e(genre.label)}</h2>
          <p class="group-note"><a href="genre/${e(genre.id)}/">すべて見る（${genre.sites.length}件）</a>${prompt}</p>
        </div>
        ${renderRow(genre, "", true)}
      </section>`;
    })
    .join("\n      ");
}
function renderFilters(catalog) {
  const e = escapeHtml;
  const fields = dimensions
    .map(([name, label]) => {
      const options = catalog.filters[name]
        .map((option) => `<option value="${e(option.value)}">${e(option.label)}（${option.count}）</option>`)
        .join("");
      return `<div class="field">
          <label for="filter-${name}">${label}</label>
          <select id="filter-${name}" name="${name}"><option value="">すべて</option>${options}</select>
        </div>`;
    })
    .join("\n        ");
  return `<form class="filters" data-filters hidden aria-label="作品を絞り込む">
        ${fields}
        <button type="reset">条件をクリア</button>
      </form>
      <p class="status" data-count aria-live="polite"></p>
      <p class="empty" data-empty hidden>条件に合う作品はありません。条件を減らすか「条件をクリア」を押してください。</p>`;
}
function renderTotal(catalog) {
  const models = catalog.filters.model.length;
  return `${catalog.sites.length} 作品・制作 ${models} 種・${catalog.genres.length} ジャンル`;
}
function renderLimit(catalog) {
  return `body:not([data-filtering]) .row[data-capped] > [data-card]:nth-child(n + ${catalog.topLimit + 1}) {
        display: none;
      }`;
}
const styleOf = (template) => {
  const style = template.match(/<style>[\s\S]*?<\/style>/);
  if (!style) throw new Error("index.html template has no <style>");
  return style[0];
};
export function renderGenre(catalog, template, id) {
  const e = escapeHtml;
  const genre = catalog.genres.find((item) => item.id === id);
  if (!genre) return null;
  const prompt = genre.promptHref ? `・<a href="../../${e(genre.promptHref)}">お題を読む</a>` : "";
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${e(genre.label)} — webpage-arena</title>
    ${styleOf(template).replace(/\s*<!--catalog:limit-->/, "")}
  </head>
  <body>
    <div class="page">
      <header>
        <h1>${e(genre.label)}</h1>
        <p class="lead"><a href="../../">ギャラリーに戻る</a></p>
        <p class="total">${genre.sites.length} 作品</p>
      </header>
      <main>
      <section class="group" aria-labelledby="genre-title">
        <div class="group-head">
          <h2 id="genre-title">${e(genre.label)}のすべての作品</h2>
          <p class="group-note">新しい順${prompt}</p>
        </div>
        ${renderGrid(genre, "../../")}
      </section>
      </main>
      <footer>
        <p>商品・企業・人物・価格・数値はすべて架空です。</p>
        <p><a href="../../prompts/_template.html">全お題に共通の制約</a></p>
      </footer>
    </div>
  </body>
</html>
`;
}
export function renderIndex(catalog, template) {
  const parts = {
    total: renderTotal(catalog),
    filters: renderFilters(catalog),
    groups: renderGroups(catalog),
    limit: renderLimit(catalog),
  };
  let output = template;
  for (const [name, value] of Object.entries(parts)) {
    const marker = `<!--catalog:${name}-->`;
    if (!output.includes(marker)) throw new Error(`index.html template is missing ${marker}`);
    output = output.replace(marker, () => value);
  }
  return output;
}
function promptPage(title, sections, works, style) {
  const e = escapeHtml;
  const list = works
    ? `
      <h2 id="works">このお題の作品</h2>
      <p>${works.sites.length} 件</p>${works.sites.length ? `
      ${renderRow(works, "../", false)}` : ""}`
    : "";
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${e(title)} — webpage-arena</title>${style ? `
    ${style}` : ""}
    <style>
      body {
        margin: 0;
        padding: clamp(24px, 5vw, 56px) clamp(16px, 5vw, 56px);
        background: #f4f3ef;
        color: #1d1d1b;
        font-family: system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif;
        line-height: 1.7;
      }
      main {
        max-width: 860px;
      }
      h1 {
        margin: 24px 0 8px;
        font-size: 20px;
      }
      h2 {
        margin: 40px 0 8px;
        font-size: 16px;
      }
      p {
        margin: 0 0 12px;
        color: #55544e;
        font-size: 14px;
      }
      .steps {
        margin: 0;
        padding-left: 1.6em;
      }
      .steps > li {
        margin: 0 0 16px;
      }
      .steps ul {
        margin: 4px 0 0;
        padding-left: 1.2em;
        color: #55544e;
        font-size: 14px;
      }
      code {
        font: 0.9em ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      pre {
        margin: 0;
        padding: 16px;
        background: #fbfaf7;
        border: 1px solid #d6d4cc;
        border-radius: 6px;
        font: 13px/1.7 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      a {
        color: #173cda;
        text-underline-offset: 4px;
      }
      a:focus-visible {
        outline: 3px solid #173cda;
        outline-offset: 3px;
        border-radius: 2px;
      }
    </style>
  </head>
  <body>
    <main>
      <p><a href="../">ギャラリーに戻る</a></p>
      ${sections
        .map(
          (section, index) => `${index === 0 ? `<h1>${e(section.title)}</h1>` : `<h2 id="common">${e(section.title)}</h2>`}
      <p>${section.note}</p>
      ${section.html ?? `<pre>${e(section.text)}</pre>`}`,
        )
        .join("\n      ")}${list}
    </main>
  </body>
</html>
`;
}
export async function renderPrompt(root, name, options = {}) {
  if (!promptName.test(name) || name === "README") return null;
  const path = join(root, "prompts", `${name}.md`);
  if (!(await isFile(path))) return null;
  const text = await readFile(path, "utf8");
  const title = splitPrompt(text).title ?? `prompts/${name}.md`;
  const sections = [{ title, text, note: `<code>prompts/${escapeHtml(name)}.md</code> の本文です。` }];
  const common = join(root, "prompts", "_template.md");
  if (name !== "_template" && (await isFile(common))) {
    const template = await readFile(common, "utf8");
    sections[0].note += "作品を作るときは、下の共通の制約と一緒にそのまま渡します。";
    sections.push({
      title: splitPrompt(template).title ?? "全お題に共通の制約",
      text: template,
      note: `<code>prompts/_template.md</code> の本文です（<a href="_template.html">単独のページ</a>）。`,
    });
  }
  if (name === "_template") return promptPage(title, sections);
  const catalog = options.catalog ?? (await loadCatalog(root, options));
  const template = options.template ?? (await readFile(options.templatePath ?? defaults.templatePath, "utf8"));
  const source = `prompts/${name}.md`;
  const works = {
    label: title,
    sites: orderSites(catalog.sites.filter((site) => site.promptPath === source)),
  };
  return promptPage(title, sections, works, styleOf(template).replace(/\s*<!--catalog:limit-->/, ""));
}
function inline(text) {
  const e = escapeHtml;
  let output = "";
  let last = 0;
  for (const match of text.matchAll(/`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    output += e(text.slice(last, match.index));
    if (match[1] !== undefined) output += `<code>${e(match[1])}</code>`;
    else if (/^[a-z][a-z0-9+.-]*:/i.test(match[3]) && !/^https?:/i.test(match[3])) output += e(match[2]);
    else output += `<a href="${e(match[3])}">${e(match[2])}</a>`;
    last = match.index + match[0].length;
  }
  return output + e(text.slice(last));
}
function renderSteps(steps) {
  const items = steps.map((step) => {
    const [head, ...rest] = step.split("\n").map((line) => line.trim());
    let main = head.replace(/^\d+\.\s+/, "");
    const notes = [];
    for (const line of rest) {
      if (/^[-*]\s+/.test(line)) notes.push(line.replace(/^[-*]\s+/, ""));
      else if (notes.length) notes[notes.length - 1] += line;
      else main += line;
    }
    const list = notes.length ? `<ul>${notes.map((note) => `<li>${inline(note)}</li>`).join("")}</ul>` : "";
    return `        <li>${inline(main)}${list}</li>`;
  });
  return `<ol class="steps">
${items.join("\n")}
      </ol>`;
}
export async function renderMaking(root, id, options = {}) {
  if (!promptName.test(id)) return null;
  const catalog = options.catalog ?? (await loadCatalog(root, options));
  const site = catalog.sites.find((item) => item.id === id);
  if (!site?.making) return null;
  const title = `作り方 — ${site.title}`;
  const steps = stepsOf(await readFile(join(root, id, "making.md"), "utf8"));
  return promptPage(title, [{ title, note: escapeHtml(disclaimer), html: renderSteps(steps) }]);
}
export async function renderGenrePage(root, id, options = {}) {
  if (!promptName.test(id)) return null;
  const template = await readFile(options.templatePath ?? defaults.templatePath, "utf8");
  return renderGenre(await loadCatalog(root, options), template, id);
}
export async function renderHub(root, options = {}) {
  const template = await readFile(options.templatePath ?? defaults.templatePath, "utf8");
  return renderIndex(await loadCatalog(root, options), template);
}
export async function renderRequest(root, pathname, options = {}) {
  if (pathname === "/" || pathname === "/index.html")
    return { type: html, body: await renderHub(root, options) };
  const prompt = pathname.match(/^\/prompts\/([^/]+)\.html$/);
  if (prompt) {
    const body = await renderPrompt(root, prompt[1], options);
    return body === null ? null : { type: html, body };
  }
  const making = pathname.match(/^\/making\/([^/]+)\.html$/);
  if (making) {
    const body = await renderMaking(root, making[1], options);
    return body === null ? null : { type: html, body };
  }
  const genre = pathname.match(/^\/genre\/([^/]+)\/(?:index\.html)?$/);
  if (genre) {
    const body = await renderGenrePage(root, genre[1], options);
    return body === null ? null : { type: html, body };
  }
  return null;
}
export async function writeGallery(root, out, options = {}) {
  const catalog = await loadCatalog(root, options);
  const template = await readFile(options.templatePath ?? defaults.templatePath, "utf8");
  await writeFile(join(out, "index.html"), renderIndex(catalog, template));
  const names = await listPrompts(root);
  if (names.length) await mkdir(join(out, "prompts"), { recursive: true });
  for (const name of names)
    await writeFile(join(out, "prompts", `${name}.html`), await renderPrompt(root, name, { ...options, catalog, template }));
  for (const genre of catalog.genres) {
    await mkdir(join(out, "genre", genre.id), { recursive: true });
    await writeFile(join(out, "genre", genre.id, "index.html"), renderGenre(catalog, template, genre.id));
  }
  for (const site of catalog.sites.filter((item) => item.making)) {
    await mkdir(join(out, "making"), { recursive: true });
    await writeFile(join(out, "making", `${site.id}.html`), await renderMaking(root, site.id, { ...options, catalog }));
  }
  return names;
}
export async function buildDist(root, out, options = {}) {
  const { sites } = await siteCoverage(root);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const site of sites)
    await cp(join(root, site), join(out, site), { recursive: true, filter: (path) => path !== join(root, site, "making.md") });
  const prompts = await writeGallery(root, out, options);
  const genres = (await readdir(join(out, "genre")).catch(() => [])).sort(compare);
  const making = (await readdir(join(out, "making")).catch(() => [])).sort(compare);
  return { sites, prompts, genres, making };
}
