import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readMeta, siteCoverage } from "./sites.mjs";
const repo = resolve(import.meta.dirname, "..");
const defaults = {
  templatePath: join(repo, "index.html"),
  typesPath: join(repo, "site-types.json"),
};
const html = "text/html; charset=utf-8";
const promptName = /^[A-Za-z0-9_-]+$/;
const dimensions = [
  ["prompt", "お題"],
  ["type", "種別"],
  ["model", "モデル"],
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
const recorded = (value) => (value === "unknown" ? "記録なし" : value);
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
async function isFile(path) {
  return (await stat(path).catch(() => null))?.isFile() ?? false;
}
function splitPrompt(text) {
  const front = text.match(/^---\n([\s\S]*?)\n---\n/);
  const body = front ? text.slice(front[0].length) : text;
  const type = front?.[1].match(/^type:\s*(\S+)\s*$/m)?.[1] ?? null;
  const title = body.match(/^#\s+(.+?)\s*$/m)?.[1] ?? null;
  return { type, title };
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
      model: meta.model,
      tool: meta.tool,
      created: meta.created,
      promptPath,
      promptHref: promptPath ? promptHref(promptPath) : null,
      href: `${id}/`,
      thumb: typeof meta.thumbnail === "string" ? `${id}/${meta.thumbnail}` : null,
      group: promptPath ?? `type:${meta.type}`,
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
        filterLabel: site.promptPath
          ? prompt?.title ?? site.promptPath
          : `${site.typeLabel}（プロンプト未収録）`,
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
  for (const group of ordered) {
    group.sites.sort((a, b) => compare(a.id, b.id));
    for (const site of group.sites) site.others = group.sites.length - 1;
  }
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
    sites: ordered.flatMap((group) => group.sites),
    groups: ordered,
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
function renderCard(site) {
  const e = escapeHtml;
  const thumb = site.thumb
    ? `<a class="thumb" href="${e(site.href)}" tabindex="-1" aria-hidden="true"><img src="${e(site.thumb)}" alt="" loading="lazy" decoding="async" width="640" height="400" /></a>`
    : `<div class="thumb thumb-none" aria-hidden="true">サムネイルなし</div>`;
  const prompt = site.promptHref ? `<a href="${e(site.promptHref)}">プロンプトを読む</a>` : "";
  const kind = site.promptHref ? "お題" : "種別";
  return `<li class="card" data-card data-id="${e(site.id)}" data-prompt="${e(site.group)}" data-type="${e(site.type)}" data-model="${e(site.model)}" data-tool="${e(site.tool)}">
            ${thumb}
            <div class="card-body">
              <h3 class="card-title"><a href="${e(site.href)}">${e(site.title)}</a></h3>
              <p class="tagline">${e(site.tagline)}</p>
              <dl class="facts">
                <div><dt>モデル</dt><dd>${e(recorded(site.model))}</dd></div>
                <div><dt>ツール</dt><dd>${e(recorded(site.tool))}</dd></div>
                <div><dt>${kind}</dt><dd>${e(site.typeLabel)}</dd></div>
                <div><dt>作成日</dt><dd><time datetime="${e(site.created)}">${e(site.created)}</time></dd></div>
              </dl>
              <p class="card-foot">${prompt}<span class="siblings">同じ${kind}のほかの作品 ${site.others} 件</span></p>
            </div>
          </li>`;
}
function renderGroups(catalog) {
  const e = escapeHtml;
  return catalog.groups
    .map((group, index) => {
      const id = `group-${index + 1}`;
      const note = group.promptHref
        ? `<a href="${e(group.promptHref)}">お題を読む</a>`
        : "プロンプト未収録（元のプロンプトは残っていません）";
      return `<section class="group" data-group="${e(group.key)}" aria-labelledby="${id}">
        <div class="group-head">
          <h2 id="${id}">${e(group.label)}</h2>
          <p class="group-note">${group.sites.length} 作品・${note}</p>
        </div>
        <ul class="row" role="list" tabindex="0" aria-label="${e(group.label)}の作品、横にスクロール">
          ${group.sites.map(renderCard).join("\n          ")}
        </ul>
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
  return `${catalog.sites.length} 作品・${models} モデル・${catalog.groups.length} グループ`;
}
export function renderIndex(catalog, template) {
  const parts = {
    total: renderTotal(catalog),
    filters: renderFilters(catalog),
    groups: renderGroups(catalog),
  };
  let output = template;
  for (const [name, value] of Object.entries(parts)) {
    const marker = `<!--catalog:${name}-->`;
    if (!output.includes(marker)) throw new Error(`index.html template is missing ${marker}`);
    output = output.replace(marker, () => value);
  }
  return output;
}
function promptPage(title, sections) {
  const e = escapeHtml;
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${e(title)} — webpage-arena</title>
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
      <pre>${e(section.text)}</pre>`,
        )
        .join("\n      ")}
    </main>
  </body>
</html>
`;
}
export async function renderPrompt(root, name) {
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
  return promptPage(title, sections);
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
    const body = await renderPrompt(root, prompt[1]);
    return body === null ? null : { type: html, body };
  }
  return null;
}
export async function writeGallery(root, out, options = {}) {
  await writeFile(join(out, "index.html"), await renderHub(root, options));
  const names = await listPrompts(root);
  if (names.length) await mkdir(join(out, "prompts"), { recursive: true });
  for (const name of names)
    await writeFile(join(out, "prompts", `${name}.html`), await renderPrompt(root, name));
  return names;
}
export async function buildDist(root, out, options = {}) {
  const { sites } = await siteCoverage(root);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  for (const site of sites) await cp(join(root, site), join(out, site), { recursive: true });
  const prompts = await writeGallery(root, out, options);
  return { sites, prompts };
}
