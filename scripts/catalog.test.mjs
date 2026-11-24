import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { checkSites } from "./check-sites.mjs";
import { readMeta, siteCoverage } from "./sites.mjs";
import * as catalog from "./catalog.mjs";
import { close, crawl, fileServer, htmlFiles, listen, missingRefs } from "./crawl.mjs";
import {
  buildDist,
  renderHub,
  escapeHtml,
  loadCatalog,
  renderIndex,
  renderRequest,
  writeGallery,
} from "./catalog.mjs";
const repo = resolve(import.meta.dirname, "..");
const fixture = (name) => resolve(repo, "tests/fixtures", name);
const template = () => readFile(resolve(repo, "index.html"), "utf8");
const cardsOf = (html) => [...html.matchAll(/<li\b[^>]*\bdata-card\b[^>]*>[\s\S]*?<\/li>/g)].map((m) => m[0]);
const groupsOf = (html) =>
  [...html.matchAll(/<section\b[^>]*\bdata-group="([^"]*)"[^>]*>([\s\S]*?)<\/section>/g)].map((m) => ({
    key: m[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&"),
    html: m[2],
    ids: [...m[2].matchAll(/\bdata-id="([^"]+)"/g)].map((id) => id[1]),
  }));
const optionsOf = (html, name) => {
  const select = html.match(new RegExp(`<select\\b[^>]*\\bname="${name}"[^>]*>([\\s\\S]*?)</select>`));
  assert.ok(select, `select[name=${name}] in the hub`);
  return [...select[1].matchAll(/<option\b[^>]*\bvalue="([^"]*)"[^>]*>/g)]
    .map((m) => m[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&"))
    .filter((value) => value !== "");
};
async function metas(root) {
  const { sites } = await siteCoverage(root);
  return Promise.all(sites.map((site) => readMeta(root, site)));
}
const groupKey = (meta) => meta.promptPath ?? `type:${meta.type}`;
function tally(list, key) {
  const counts = new Map();
  for (const meta of list) counts.set(key(meta), (counts.get(key(meta)) ?? 0) + 1);
  return counts;
}
const missingPrompt = "プロンプト未収録";
const longMissing = "（元のプロンプトは残っていません）";
const fullMissing = `${missingPrompt}${longMissing}`;
const withoutCards = (html) => html.replace(/<li\b[^>]*\bdata-card\b[^>]*>[\s\S]*?<\/li>/g, "");
const typeIdParen = /（[a-z][a-z0-9-]*）/;
const optionLabelsOf = (html, name) => {
  const select = html.match(new RegExp(`<select\\b[^>]*\\bname="${name}"[^>]*>([\\s\\S]*?)</select>`));
  assert.ok(select, `select[name=${name}] in the hub`);
  return [...select[1].matchAll(/<option\b[^>]*\bvalue="([^"]+)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]]);
};
const hasModel = (meta) => typeof meta.model === "string" && meta.model.trim() !== "" && meta.model !== "unknown";
async function hub(root) {
  return renderIndex(await loadCatalog(root), await template());
}
async function tempCopy(t, name) {
  const root = await mkdtemp(join(tmpdir(), "catalog-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(fixture(name), root, { recursive: true });
  return root;
}

const lamps = [
  ["lamp-a", "2026-11-03"],
  ["lamp-b", "2026-11-05"],
  ["lamp-c", "2026-11-05"],
  ["lamp-d", "2026-11-02"],
  ["lamp-e", undefined],
  ["lamp-f", "2026-02-30"],
  ["lamp-g", "2026-11-04"],
  ["lamp-h", "yesterday"],
];
const productOrder = ["lamp-b", "lamp-c", "lamp-g", "lamp-a", "lamp-d", "gpt-lamp", "grok-lamp", "lamp-e", "lamp-f", "lamp-h"];
const saasOrder = ["claude-kakehashi", "grok-kakehashi", "a-kakehashi"];
async function genreFixture(t) {
  const root = await tempCopy(t, "catalog-basic");
  const clone = async (from, id, patch) => {
    await cp(join(root, from), join(root, id), { recursive: true });
    const meta = JSON.parse(await readFile(join(root, from, "meta.json"), "utf8"));
    await writeFile(join(root, id, "meta.json"), JSON.stringify({ ...meta, id, title: `${meta.title} ${id}`, ...patch }));
  };
  for (const [id, created] of lamps) await clone("grok-lamp", id, { created });
  await clone("claude-kakehashi", "a-kakehashi", { created: "2026-11-30", model: "Gemini", tool: "Gemini CLI" });
  await writeFile(join(root, "prompts", "inn.md"), "---\ntype: inn\n---\n\n# 宿（inn）— フィクスチャ\n\n作品のないお題。\n");
  return root;
}
async function built(t, root, name = "catalog-built-") {
  const out = await mkdtemp(join(tmpdir(), name));
  t.after(() => rm(out, { recursive: true, force: true }));
  await buildDist(root, out);
  return out;
}
const idsOf = (html) => [...html.matchAll(/<li\b[^>]*\bdata-card\b[^>]*\bdata-id="([^"]+)"/g)].map((m) => m[1]);
const genrePage = (out, slug) => readFile(join(out, "genre", slug, "index.html"), "utf8");
const promptPage = (out, name) => readFile(join(out, "prompts", `${name}.html`), "utf8");
const capOf = (html) => {
  const rule = html.match(/body:not\(\[data-filtering\]\) \.row\[data-capped\] > \[data-card\]:nth-child\(n \+ (\d+)\)\s*\{\s*display:\s*none;?\s*\}/);
  return rule ? Number(rule[1]) - 1 : null;
};
async function hashTree(root, skip = new Set()) {
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(root, path).split("\\").join("/");
      if ([...skip].some((name) => rel === name || rel.startsWith(`${name}/`))) continue;
      if (entry.isDirectory()) await walk(path);
      else files.push(rel);
    }
  };
  await walk(root);
  files.sort();
  const hash = createHash("sha256");
  for (const rel of files) {
    hash.update(rel);
    hash.update("\0");
    hash.update(await readFile(join(root, rel)));
    hash.update("\0");
  }
  return { hash: hash.digest("hex"), files };
}


test("CONTRIBUTING: the meta.json example passes checkSites with a real type, promptPath and thumb.webp", async (t) => {
  const text = await readFile(resolve(repo, "CONTRIBUTING.md"), "utf8");
  const block = text.match(/^## meta\.json\n+```json\n([\s\S]*?)\n```/m);
  assert.ok(block, "CONTRIBUTING.md has a json example under ## meta.json");
  const meta = JSON.parse(block[1]);
  assert.equal(meta.type, "saas-lp");
  assert.equal(meta.promptPath, "prompts/saas-lp.md");
  assert.equal(meta.thumbnail, "thumb.webp");
  const types = JSON.parse(await readFile(resolve(repo, "site-types.json"), "utf8"));
  assert.ok(types.some((type) => type.id === meta.type), `${meta.type} in site-types.json`);
  await readFile(resolve(repo, meta.promptPath), "utf8");
  const root = await tempCopy(t, "catalog-contributing");
  await mkdir(join(root, "prompts"), { recursive: true });
  await cp(resolve(repo, meta.promptPath), join(root, meta.promptPath));
  await writeFile(join(root, meta.id, "meta.json"), JSON.stringify(meta));
  const { sites, errors } = await checkSites(root, { tracked: [] });
  assert.deepEqual(errors, []);
  assert.deepEqual(sites, [meta.id]);
});

test("CONTRIBUTING: the thumbnail row says thumb.webp is required for every site", async () => {
  const text = await readFile(resolve(repo, "CONTRIBUTING.md"), "utf8");
  assert.match(
    text,
    /^\| `thumbnail` \| 必須 \| `"thumb\.webp"`（640×400・60KB 以下。`npm run thumbs` で作る）。全作品で必須 \|$/m,
  );
});

test("fixture: catalog-basic is a valid set of sites for checkSites", async () => {
  const { errors } = await checkSites(fixture("catalog-basic"), { tracked: [] });
  assert.deepEqual(errors, []);
});

test("order: one section per genre in site-types order, each holding every work of the type, newest first", async () => {
  const groups = groupsOf(await hub(fixture("catalog-basic")));
  assert.deepEqual(
    groups.map((group) => [group.key, group.ids]),
    [
      ["product-lp", ["gpt-lamp", "grok-lamp"]],
      ["corporate-hp", ["devin-firm"]],
      ["saas-lp", ["claude-kakehashi", "grok-kakehashi"]],
    ],
  );
});

test("grouping: sites of the same type (genre) share one row headed by the type label, recorded prompt or not", async () => {
  for (const root of [fixture("catalog-basic"), repo]) {
    const list = await metas(root);
    const groups = groupsOf(await hub(root));
    const expected = tally(list, (meta) => meta.type);
    assert.deepEqual(new Set(groups.map((group) => group.key)), new Set(expected.keys()), root);
    const types = JSON.parse(await readFile(resolve(repo, "site-types.json"), "utf8"));
    assert.deepEqual(
      groups.map((group) => group.key),
      types.map((type) => type.id).filter((id) => expected.has(id)),
      root,
    );
    for (const group of groups) {
      assert.equal(group.ids.length, expected.get(group.key), `${root} ${group.key}`);
      const rows = group.html.match(/<ul\b[^>]*\bclass="row"/g) ?? [];
      assert.equal(rows.length, 1, `${group.key} has exactly one row`);
      for (const id of group.ids) assert.equal(list.find((meta) => meta.id === id).type, group.key);
      const label = types.find((type) => type.id === group.key).label;
      assert.match(group.html, new RegExp(`<h2[^>]*>${label}</h2>`), `${root} ${group.key}`);
      assert.ok(group.html.includes(`aria-label="${label}の作品、横にスクロール"`), `${root} ${group.key}`);
    }
  }
  const saas = groupsOf(await hub(fixture("catalog-basic"))).find((g) => g.key === "saas-lp").html;
  assert.doesNotMatch(saas, /（saas-lp）/);
});

test("filters: prompt, type, model and tool options are derived from meta", async () => {
  for (const root of [fixture("catalog-basic"), repo]) {
    const list = await metas(root);
    const html = await hub(root);
    assert.deepEqual(new Set(optionsOf(html, "prompt")), new Set(list.map(groupKey)), root);
    assert.deepEqual(new Set(optionsOf(html, "type")), new Set(list.map((m) => m.type)), root);
    assert.deepEqual(new Set(optionsOf(html, "model")), new Set(list.map((m) => m.model)), root);
    assert.deepEqual(new Set(optionsOf(html, "tool")), new Set(list.map((m) => m.tool)), root);
    const cards = cardsOf(html);
    for (const [attr, key] of [
      ["prompt", groupKey],
      ["type", (m) => m.type],
      ["model", (m) => m.model],
      ["tool", (m) => m.tool],
    ])
      for (const [value, count] of tally(list, key)) {
        const escaped = value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
        assert.equal(
          cards.filter((card) => card.includes(`data-${attr}="${escaped}"`)).length,
          count,
          `${root} data-${attr}=${value}`,
        );
      }
  }
});

test("tool row: cards whose 制作 (model) has a value show no ツール row, while data-tool and the tool filter stay", async () => {
  for (const root of [fixture("catalog-basic"), repo]) {
    const list = await metas(root);
    assert.ok(list.every(hasModel), root);
    const html = await hub(root);
    const cards = cardsOf(html);
    assert.equal(cards.length, list.length, root);
    for (const meta of list) {
      const card = cards.find((c) => c.includes(`data-id="${meta.id}"`));
      assert.doesNotMatch(card, /<dt>ツール<\/dt>/, `${root} ${meta.id}`);
      assert.match(card, /<dt>制作<\/dt>/, `${root} ${meta.id}`);
      const escaped = meta.tool.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
      assert.ok(card.match(/<li[^>]*>/)[0].includes(`data-tool="${escaped}"`), `${root} ${meta.id} data-tool`);
    }
    const select = html.match(/<select\b[^>]*\bname="tool"[^>]*>([\s\S]*?)<\/select>/)[1];
    for (const [value, count] of tally(list, (m) => m.tool)) {
      const label = value === "unknown" ? "記録なし" : value;
      assert.ok(select.includes(`<option value="${value}">${label}（${count}）</option>`), `${root} tool=${value}`);
    }
  }
});

test("tool row: cards without 制作 (model absent, null, empty, blank or unknown) show <dt>ツール</dt><dd>tool</dd> and never print undefined or null", async () => {
  const root = fixture("catalog-no-model");
  const list = await metas(root);
  const html = await hub(root);
  const cards = cardsOf(html);
  assert.deepEqual(
    list.filter((meta) => !hasModel(meta)).map((meta) => meta.id).sort(),
    ["nomodel-absent", "nomodel-blank", "nomodel-empty", "nomodel-null", "nomodel-unknown"],
  );
  for (const meta of list) {
    const card = cards.find((c) => c.includes(`data-id="${meta.id}"`));
    assert.ok(card, meta.id);
    if (hasModel(meta)) {
      assert.ok(card.includes(`<dt>制作</dt><dd>${meta.model}</dd>`), meta.id);
      assert.doesNotMatch(card, /<dt>ツール<\/dt>/, meta.id);
    } else {
      assert.ok(card.includes(`<dt>制作</dt><dd>記録なし</dd>`), `${meta.id} 制作 row stays`);
      assert.ok(card.includes(`<dt>ツール</dt><dd>${meta.tool}</dd>`), `${meta.id} ツール row`);
    }
    assert.ok(card.match(/<li[^>]*>/)[0].includes(`data-tool="${meta.tool}"`), `${meta.id} data-tool`);
  }
  assert.doesNotMatch(html, /undefined|>null<|="null"|<dd>\s*<\/dd>/);
  assert.ok(optionsOf(html, "model").includes("Grok"));
  assert.match(html, /<select\b[^>]*\bname="model"[^>]*>[\s\S]*?>記録なし（5）<\/option>/);
});

test("label: the 制作 filter keeps select[name=model] and the empty option すべて", async () => {
  for (const root of [fixture("catalog-basic"), repo]) {
    const html = await hub(root);
    assert.match(html, /<label for="filter-model">制作<\/label>\s*<select id="filter-model" name="model"><option value="">すべて<\/option>/, root);
    assert.match(html, /<label for="filter-tool">ツール<\/label>/, root);
  }
});

test("label: the hub and every prompt page baked by writeGallery show 制作 and contain no モデル", async (t) => {
  const out = await mkdtemp(join(tmpdir(), "catalog-label-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  const names = await writeGallery(repo, out);
  assert.ok(names.length > 1, names.join(", "));
  const index = await readFile(join(out, "index.html"), "utf8");
  assert.match(index, /<dt>制作<\/dt>/);
  assert.match(index, /<label for="filter-model">制作<\/label>/);
  assert.match(index, /いろいろな AI・ツールで/);
  for (const file of ["index.html", ...names.map((name) => `prompts/${name}.html`)]) {
    const page = await readFile(join(out, file), "utf8");
    assert.equal(page.split("モデル").length - 1, 0, `モデル in ${file}`);
  }
  for (const name of names.filter((name) => name !== "_template")) {
    const page = await readFile(join(out, "prompts", `${name}.html`), "utf8");
    assert.ok(page.includes("作る側の AI・ツール"), name);
    assert.ok(page.includes("別の制作で"), name);
  }
});

test("new values: DeepSeek, GLM and Claude Code appear as is in the 制作 row and the model filter", async () => {
  const root = fixture("catalog-new-models");
  const html = await hub(root);
  const cards = cardsOf(html);
  for (const [id, model] of [
    ["deepseek-lamp", "DeepSeek"],
    ["glm-lamp", "GLM"],
    ["claude-code-lamp", "Claude Code"],
  ]) {
    const card = cards.find((c) => c.includes(`data-id="${id}"`));
    assert.ok(card, id);
    assert.ok(card.includes(`<dt>制作</dt><dd>${model}</dd>`), id);
    assert.ok(card.includes(`data-model="${model}"`), id);
    assert.doesNotMatch(card, /<dt>ツール<\/dt>/, id);
  }
  assert.deepEqual(optionsOf(html, "model").sort(), ["Claude Code", "DeepSeek", "GLM"]);
  for (const model of ["DeepSeek", "GLM", "Claude Code"])
    assert.ok(html.includes(`<option value="${model}">${model}（1）</option>`), model);
  assert.ok(html.includes('<p class="total">3 作品・制作 3 種・1 ジャンル</p>'));
});

test("filters: the form is hidden until JS runs and the no-match message exists but starts hidden", async () => {
  const html = await hub(fixture("catalog-basic"));
  assert.match(html, /<form\b[^>]*\bdata-filters\b[^>]*\bhidden\b/);
  assert.match(html, /<p\b[^>]*\bdata-empty\b[^>]*\bhidden\b[^>]*>[^<]*条件に合う作品はありません/);
  for (const card of cardsOf(html)) assert.doesNotMatch(card.match(/<li[^>]*>/)[0], /\bhidden\b/);
});

test("prompt: each card without a prompt shows only the short プロンプト未収録 once (aria-hidden) in .card-foot and keeps the full プロンプト未収録（元のプロンプトは残っていません） once in .sr-only; cards with a prompt link to prompts/<name>.html instead", async () => {
  assert.match(await template(), /\.sr-only\s*\{[^}]*position:\s*absolute[^}]*clip:\s*rect\(0,? 0,? 0,? 0\)[^}]*\}/);
  for (const root of [fixture("catalog-basic"), repo]) {
    const list = await metas(root);
    const cards = cardsOf(await hub(root));
    for (const meta of list) {
      const card = cards.find((c) => c.includes(`data-id="${meta.id}"`));
      assert.ok(card, meta.id);
      const foot = card.match(/<p class="card-foot">([\s\S]*?)<\/p>/)[1];
      if (meta.promptPath === null) {
        assert.ok(
          foot.startsWith(`<span><span aria-hidden="true">${missingPrompt}</span><span class="sr-only">${fullMissing}</span></span>`),
          `${root} ${meta.id} foot: ${foot}`,
        );
        assert.equal(card.split(`>${missingPrompt}<`).length - 1, 1, `${root} ${meta.id} visible once`);
        assert.equal(card.split(fullMissing).length - 1, 1, `${root} ${meta.id} full once`);
        assert.equal(card.split(missingPrompt).length - 1, 2, `${root} ${meta.id} no other mention`);
        assert.doesNotMatch(card, /\btitle="[^"]*未収録/, meta.id);
        assert.doesNotMatch(foot, new RegExp(`<a\\b[^>]*>[^<]*${missingPrompt}`), meta.id);
        assert.doesNotMatch(card, /href="prompts\//, meta.id);
        assert.doesNotMatch(card, /プロンプトを読む/, meta.id);
      } else {
        const name = meta.promptPath.slice("prompts/".length, -".md".length);
        assert.match(foot, new RegExp(`<a href="prompts/${name}\\.html">プロンプトを読む</a>`), meta.id);
        assert.doesNotMatch(card, /プロンプト未収録/, meta.id);
      }
    }
  }
});

test("group note: every genre links すべて見る（N件） to genre/<slug>/ with its total, plus お題を読む only when prompts/<slug>.md exists", async (t) => {
  for (const root of [fixture("catalog-basic"), repo, await genreFixture(t)]) {
    const list = await metas(root);
    const prompts = new Set(await catalog.listPrompts(root));
    const groups = groupsOf(await hub(root));
    assert.ok(groups.some((group) => !prompts.has(group.key)) || root === repo, root);
    for (const group of groups) {
      const total = list.filter((meta) => meta.type === group.key).length;
      assert.equal(group.ids.length, total, `${root} ${group.key} keeps every card in the DOM`);
      const head = group.html.match(/<div class="group-head">([\s\S]*?)<\/div>/)[1];
      const note = head.match(/<p class="group-note">([\s\S]*?)<\/p>/)[1];
      assert.doesNotMatch(head, /プロンプト未収録/, group.key);
      const all = `<a href="genre/${group.key}/">すべて見る（${total}件）</a>`;
      if (prompts.has(group.key)) assert.equal(note, `${all}・<a href="prompts/${group.key}.html">お題を読む</a>`, `${root} ${group.key}`);
      else assert.equal(note, all, `${root} ${group.key}`);
    }
  }
});

test("cards: lazy 640x400 thumb, title, tagline, type, 制作 (model), created, and the count of other works only when it is 1 or more", async () => {
  const root = fixture("catalog-basic");
  const list = await metas(root);
  const types = JSON.parse(await readFile(resolve(repo, "site-types.json"), "utf8"));
  const sizes = tally(list, groupKey);
  const esc = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const shown = (value) => (value === "unknown" ? "記録なし" : value);
  const cards = cardsOf(await hub(root));
  assert.equal(cards.length, list.length);
  for (const meta of list) {
    const card = cards.find((c) => c.includes(`data-id="${meta.id}"`));
    assert.match(card, new RegExp(`<img\\b(?=[^>]*\\bsrc="${meta.id}/thumb\\.webp")(?=[^>]*\\bloading="lazy")(?=[^>]*\\bwidth="640")(?=[^>]*\\bheight="400")`), meta.id);
    assert.match(card, new RegExp(`<a href="${meta.id}/">${esc(meta.title)}</a>`), meta.id);
    for (const text of [meta.tagline, meta.created])
      assert.ok(card.includes(esc(text)), `${meta.id} shows ${text}`);
    assert.ok(card.includes(`<dt>制作</dt><dd>${esc(shown(meta.model))}</dd>`), `${meta.id} 制作`);
    assert.doesNotMatch(card, /<dt>ツール<\/dt>/, `${meta.id} has 制作, so no ツール row`);
    const facts = card.match(/<dl\b[\s\S]*?<\/dl>/)[0];
    assert.doesNotMatch(facts, /<dd>unknown<\/dd>/, meta.id);
    const label = types.find((t) => t.id === meta.type).label;
    const others = sizes.get(groupKey(meta)) - 1;
    if (meta.promptPath === null) {
      assert.ok(card.includes(`<dt>種別</dt><dd>${esc(label)}</dd>`), `${meta.id} 種別`);
      assert.doesNotMatch(card, /<dt>お題<\/dt>/, meta.id);
      if (others > 0) assert.ok(card.includes(`<span class="siblings">同じ種別のほかの作品 ${others} 件</span>`), meta.id);
      else assert.doesNotMatch(card, /class="siblings"|ほかの作品/, `${meta.id} has no 0 件 line`);
      assert.doesNotMatch(card, /同じお題/, meta.id);
    } else {
      assert.ok(card.includes(`<dt>お題</dt><dd>${esc(label)}</dd>`), `${meta.id} お題`);
      if (others > 0) assert.ok(card.includes(`<span class="siblings">同じお題のほかの作品 ${others} 件</span>`), meta.id);
      else assert.doesNotMatch(card, /class="siblings"|ほかの作品/, `${meta.id} has no 0 件 line`);
      assert.doesNotMatch(card, /同じ種別/, meta.id);
    }
  }
});

test("labels: unknown shows as 記録なし on cards and filter options while real names stay as is", async () => {
  for (const root of [fixture("catalog-basic"), repo]) {
    const list = await metas(root);
    const html = await hub(root);
    for (const name of ["model", "tool"]) {
      const select = html.match(new RegExp(`<select\\b[^>]*\\bname="${name}"[^>]*>([\\s\\S]*?)</select>`))[1];
      const options = [...select.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].filter((m) => m[1] !== "");
      for (const [value, count] of tally(list, (m) => m[name])) {
        const option = options.find((m) => m[1] === value);
        assert.ok(option, `${root} ${name}=${value}`);
        assert.equal(option[2], `${value === "unknown" ? "記録なし" : value}（${count}）`, `${root} ${name}=${value}`);
      }
    }
    assert.doesNotMatch(html.replace(/\bvalue="unknown"|\bdata-(?:model|tool)="unknown"/g, ""), /unknown/, root);
  }
});

test("rows: every scroll row is keyboard-focusable and says it scrolls sideways", async () => {
  for (const root of [fixture("catalog-basic"), repo]) {
    for (const group of groupsOf(await hub(root))) {
      const heading = group.html.match(/<h2\b[^>]*>([^<]*)<\/h2>/)[1];
      const row = group.html.match(/<ul\b[^>]*\bclass="row"[^>]*>/)[0];
      assert.match(row, /\btabindex="0"/, group.key);
      assert.ok(row.includes(`aria-label="${heading}の作品、横にスクロール"`), `${group.key}: ${row}`);
    }
  }
  const css = await readFile(resolve(repo, "index.html"), "utf8");
  assert.match(css, /flex:\s*0 0 max\(150px, calc\(\(100% - 6 \* 14px\) \/ 6\.5\)\)/);
  assert.match(css, /scroll-snap-type:\s*x mandatory/);
  assert.match(css, /scroll-snap-align:\s*start/);
});

test("lead and counts: the intro covers genre rows and すべて見る, and the filter count starts empty", async () => {
  for (const root of [fixture("catalog-basic"), repo]) {
    const list = await metas(root);
    const html = await hub(root);
    assert.match(html, /<p class="lead">[\s\S]*ジャンルごとに1行に、新しい作品から並べます。[\s\S]*「すべて見る」[\s\S]*?<\/p>/);
    assert.doesNotMatch(html, /お題ごとに1行/);
    const genres = new Set(list.map((m) => m.type)).size;
    const models = new Set(list.map((m) => m.model)).size;
    assert.ok(html.includes(`<p class="total">${list.length} 作品・制作 ${models} 種・${genres} ジャンル</p>`), root);
    assert.match(html, /<p class="status" data-count aria-live="polite"><\/p>/, root);
  }
});

test("folder add: one new site folder adds one card and joins its prompt row without touching the hub code", async (t) => {
  const root = await tempCopy(t, "catalog-basic");
  const before = await metas(root);
  const beforeCards = cardsOf(await hub(root)).length;
  await cp(join(root, "claude-kakehashi"), join(root, "gemini-kakehashi"), { recursive: true });
  const meta = JSON.parse(await readFile(join(root, "gemini-kakehashi", "meta.json"), "utf8"));
  await writeFile(
    join(root, "gemini-kakehashi", "meta.json"),
    JSON.stringify({ ...meta, id: "gemini-kakehashi", model: "Gemini", tool: "Gemini CLI" }),
  );
  const html = await hub(root);
  assert.equal(beforeCards, before.length);
  assert.equal(cardsOf(html).length, before.length + 1);
  const row = groupsOf(html).find((group) => group.key === "saas-lp");
  assert.ok(row.ids.includes("gemini-kakehashi"), row.ids.join(", "));
  assert.ok(optionsOf(html, "model").includes("Gemini"));
  assert.ok(optionsOf(html, "tool").includes("Gemini CLI"));
  const size = before.filter((m) => m.promptPath === "prompts/saas-lp.md").length + 1;
  assert.ok(html.includes(`同じお題のほかの作品 ${size - 1} 件`));
});


test("folder add: adding one site folder updates the top row, すべて見る count, genre page and prompt page, and leaves every other source file unchanged", async (t) => {
  const root = await tempCopy(t, "catalog-basic");
  const beforeSources = await hashTree(root);
  const beforeOut = await built(t, root, "catalog-folder-before-");
  const beforeHub = await readFile(join(beforeOut, "index.html"), "utf8");
  const beforeRow = groupsOf(beforeHub).find((group) => group.key === "saas-lp");
  const beforeCount = Number(beforeRow.html.match(/すべて見る（(\d+)件）/)[1]);
  const beforeGenre = idsOf(await genrePage(beforeOut, "saas-lp"));
  const beforePrompt = idsOf(await promptPage(beforeOut, "saas-lp"));
  const id = "gemini-kakehashi";
  await cp(join(root, "claude-kakehashi"), join(root, id), { recursive: true });
  const meta = JSON.parse(await readFile(join(root, id, "meta.json"), "utf8"));
  await writeFile(
    join(root, id, "meta.json"),
    JSON.stringify({ ...meta, id, title: "カケハシ Gemini", created: "2026-12-10", model: "Gemini", tool: "Gemini CLI" }),
  );
  const afterSources = await hashTree(root, new Set([id]));
  assert.equal(afterSources.hash, beforeSources.hash);
  assert.deepEqual(afterSources.files, beforeSources.files);
  const afterOut = await built(t, root, "catalog-folder-after-");
  const afterHub = await readFile(join(afterOut, "index.html"), "utf8");
  const afterRow = groupsOf(afterHub).find((group) => group.key === "saas-lp");
  assert.equal(Number(afterRow.html.match(/すべて見る（(\d+)件）/)[1]), beforeCount + 1);
  assert.equal(afterRow.ids[0], id);
  const afterGenre = idsOf(await genrePage(afterOut, "saas-lp"));
  const afterPrompt = idsOf(await promptPage(afterOut, "saas-lp"));
  assert.ok(afterGenre.includes(id));
  assert.equal(afterGenre.length, beforeGenre.length + 1);
  assert.ok(afterPrompt.includes(id));
  assert.equal(afterPrompt.length, beforePrompt.length + 1);
});

test("folder add: a row of one shows no 'ほかの作品 0 件' line for お題 or 種別, and a second site turns on '1 件' for both", async (t) => {
  const root = await tempCopy(t, "catalog-basic");
  await rm(join(root, "grok-kakehashi"), { recursive: true });
  const card = (html, id) => cardsOf(html).find((c) => c.includes(`data-id="${id}"`));
  let html = await hub(root);
  for (const id of ["claude-kakehashi", "devin-firm"]) {
    assert.ok(card(html, id), id);
    assert.doesNotMatch(card(html, id), /class="siblings"|ほかの作品/, `${id} alone`);
  }
  assert.doesNotMatch(html, /ほかの作品 0 件/);
  for (const [from, to] of [["claude-kakehashi", "gemini-kakehashi"], ["devin-firm", "gemini-firm"]]) {
    await cp(join(root, from), join(root, to), { recursive: true });
    const meta = JSON.parse(await readFile(join(root, to, "meta.json"), "utf8"));
    await writeFile(join(root, to, "meta.json"), JSON.stringify({ ...meta, id: to, model: "Gemini", tool: "Gemini CLI" }));
  }
  html = await hub(root);
  for (const id of ["claude-kakehashi", "gemini-kakehashi"])
    assert.ok(card(html, id).includes('<span class="siblings">同じお題のほかの作品 1 件</span>'), id);
  for (const id of ["devin-firm", "gemini-firm"])
    assert.ok(card(html, id).includes('<span class="siblings">同じ種別のほかの作品 1 件</span>'), id);
});

test("repository: no card prints 'ほかの作品 0 件' even though several prompt rows hold a single site", async () => {
  const list = await metas(repo);
  const html = await hub(repo);
  const sizes = tally(list, groupKey);
  assert.ok([...sizes.values()].some((size) => size === 1));
  assert.doesNotMatch(html, /ほかの作品 0 件/);
  for (const meta of list) {
    const card = cardsOf(html).find((c) => c.includes(`data-id="${meta.id}"`));
    const others = sizes.get(groupKey(meta)) - 1;
    if (others === 0) assert.doesNotMatch(card, /class="siblings"/, meta.id);
    else assert.ok(card.includes(`ほかの作品 ${others} 件</span>`), meta.id);
  }
});

test("prompt filter: type groups are labelled 商品LP / 企業HP without （プロンプト未収録）, and the type filter keeps 商品LP / 企業HP", async () => {
  for (const root of [fixture("catalog-basic"), repo]) {
    const list = await metas(root);
    const html = await hub(root);
    const prompt = optionLabelsOf(html, "prompt");
    const type = optionLabelsOf(html, "type");
    for (const [id, label] of [["product-lp", "商品LP"], ["corporate-hp", "企業HP"]]) {
      const count = list.filter((m) => m.promptPath === null && m.type === id).length;
      assert.ok(count > 0, `${root} ${id}`);
      assert.deepEqual(prompt.find(([value]) => value === `type:${id}`), [`type:${id}`, `${label}（${count}）`], root);
      const all = list.filter((m) => m.type === id).length;
      assert.deepEqual(type.find(([value]) => value === id), [id, `${label}（${all}）`], root);
    }
    const filters = html.match(/<form\b[^>]*\bdata-filters\b[\s\S]*?<\/form>/)[0];
    assert.ok(!filters.includes("（プロンプト未収録）"), root);
    assert.doesNotMatch(filters, typeIdParen, root);
  }
});

test("repository: headings, row aria-labels and filter options carry no type id like （saas-lp） and no （プロンプト未収録）, and （元のプロンプトは残っていません） appears only inside cards", async () => {
  const html = await hub(repo);
  const groups = groupsOf(html);
  const saas = groups.find((g) => g.key === "saas-lp");
  assert.match(saas.html, /<h2[^>]*>SaaS<\/h2>/);
  const restaurant = groups.find((g) => g.key === "restaurant");
  assert.match(restaurant.html, /<h2[^>]*>飲食<\/h2>/);
  const promptLabels = new Map(optionLabelsOf(html, "prompt"));
  assert.match(promptLabels.get("prompts/saas-lp.md"), /^SaaS — カケハシ（\d+）$/);
  assert.match(promptLabels.get("prompts/restaurant.md"), /^飲食 — 青時（あおどき）（\d+）$/);
  for (const group of groups) {
    const heading = group.html.match(/<h2\b[^>]*>([^<]*)<\/h2>/)[1];
    const row = group.html.match(/<ul\b[^>]*\bclass="row"[^>]*>/)[0];
    assert.doesNotMatch(heading, typeIdParen, group.key);
    assert.doesNotMatch(row, typeIdParen, group.key);
  }
  for (const [, label] of optionLabelsOf(html, "prompt")) {
    assert.doesNotMatch(label, typeIdParen, label);
    assert.ok(!label.includes("（プロンプト未収録）"), label);
  }
  assert.doesNotMatch(html, /（saas-lp）|（プロンプト未収録）/);
  assert.ok(!withoutCards(html).includes(longMissing));
  for (const group of groups) assert.ok(!group.html.match(/<div class="group-head">[\s\S]*?<\/div>/)[0].includes(longMissing), group.key);
  assert.ok(!html.match(/<select\b[^>]*\bname="prompt"[^>]*>[\s\S]*?<\/select>/)[0].includes(longMissing));
});

const promptFiles = ["app-lp", "corporate-hp", "event", "inn", "product-lp", "restaurant", "saas-lp"];
const frontType = (text) => text.match(/^---\n[\s\S]*?^type:\s*(\S+)\s*$/m)[1];
const firstHeading = (text) => text.match(/^#\s+(.+?)\s*$/m)[1];

test("source: every prompts/<type>.md keeps its type id in the # line, and the fixture keeps SaaS（saas-lp）— フィクスチャ", async () => {
  for (const name of promptFiles) {
    const text = await readFile(resolve(repo, "prompts", `${name}.md`), "utf8");
    const type = frontType(text);
    assert.equal(type, name);
    assert.ok(firstHeading(text).includes(`（${type}）`), `prompts/${name}.md: ${firstHeading(text)}`);
  }
  const fixtureText = await readFile(join(fixture("catalog-basic"), "prompts", "saas-lp.md"), "utf8");
  assert.equal(firstHeading(fixtureText), "SaaS（saas-lp）— フィクスチャ");
});

test("prompt pages: <title> and <h1> drop the type id, the first <pre> is the escaped markdown as is (type id kept), and no （元のプロンプトは残っていません）; the hub has it only inside cards", async (t) => {
  for (const root of [fixture("catalog-basic"), repo]) {
    const out = await mkdtemp(join(tmpdir(), "catalog-prompt-pages-"));
    t.after(() => rm(out, { recursive: true, force: true }));
    const names = await writeGallery(root, out);
    const index = await readFile(join(out, "index.html"), "utf8");
    assert.ok(!withoutCards(index).includes(longMissing), `${root} index outside cards`);
    for (const name of names) {
      const page = await readFile(join(out, "prompts", `${name}.html`), "utf8");
      const source = await readFile(join(root, "prompts", `${name}.md`), "utf8");
      const title = page.match(/<title>([^<]*)<\/title>/)[1];
      const h1 = page.match(/<h1>([^<]*)<\/h1>/)[1];
      const pre = page.match(/<pre>([\s\S]*?)<\/pre>/)[1];
      assert.equal(title, `${h1} — webpage-arena`, `${root} ${name}`);
      assert.equal(pre, escapeHtml(source), `${root} ${name}: <pre> is the markdown as is`);
      for (const text of [title, h1]) assert.doesNotMatch(text, typeIdParen, `${root} ${name}: ${text}`);
      if (name !== "_template") assert.ok(firstHeading(pre).includes(`（${frontType(source)}）`), `${root} ${name}: ${firstHeading(pre)}`);
      assert.ok(!page.includes(longMissing), `${root} ${name}`);
    }
  }
  const out = await mkdtemp(join(tmpdir(), "catalog-prompt-h1-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await writeGallery(repo, out);
  const h1 = async (name) => (await readFile(join(out, "prompts", `${name}.html`), "utf8")).match(/<h1>([^<]*)<\/h1>/)[1];
  assert.equal(await h1("saas-lp"), "SaaS — カケハシ");
  assert.equal(await h1("restaurant"), "飲食 — 青時（あおどき）");
  assert.equal(await h1("app-lp"), "アプリ — のまみち");
  assert.equal(await h1("event"), "イベント — 港暮らしフェス 2027");
  assert.equal(await h1("inn"), "宿 — 岸ねの宿");
  assert.equal(await h1("product-lp"), "商品LP");
  assert.equal(await h1("corporate-hp"), "企業HP");
  const fixtureOut = await mkdtemp(join(tmpdir(), "catalog-prompt-h1-fixture-"));
  t.after(() => rm(fixtureOut, { recursive: true, force: true }));
  await writeGallery(fixture("catalog-basic"), fixtureOut);
  const page = await readFile(join(fixtureOut, "prompts", "saas-lp.html"), "utf8");
  assert.equal(page.match(/<h1>([^<]*)<\/h1>/)[1], "SaaS — フィクスチャ");
  assert.equal(page.match(/<title>([^<]*)<\/title>/)[1], "SaaS — フィクスチャ — webpage-arena");
  assert.ok(page.match(/<pre>([\s\S]*?)<\/pre>/)[1].includes("# SaaS（saas-lp）— フィクスチャ"));
});

test("display: only a （…） equal to the front matter type is dropped, so readings like （あおどき） and other ids stay", async (t) => {
  const root = await tempCopy(t, "catalog-basic");
  const path = join(root, "prompts", "saas-lp.md");
  const text = await readFile(path, "utf8");
  await writeFile(path, text.replace(/^#\s+.+$/m, "# SaaS（saas-lp）— フィクスチャ（beta-1）"));
  const label = new Map(optionLabelsOf(await hub(root), "prompt")).get("prompts/saas-lp.md");
  assert.equal(label, "SaaS — フィクスチャ（beta-1）（2）");
  const out = await mkdtemp(join(tmpdir(), "catalog-prompt-other-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await writeGallery(root, out);
  const page = await readFile(join(out, "prompts", "saas-lp.html"), "utf8");
  assert.equal(page.match(/<h1>([^<]*)<\/h1>/)[1], "SaaS — フィクスチャ（beta-1）");
});

test("build: buildDist bakes the cards into index.html and writes escaped prompt pages with the common constraints", async (t) => {
  const root = fixture("catalog-basic");
  const out = await mkdtemp(join(tmpdir(), "catalog-dist-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  const list = await metas(root);
  await buildDist(root, out);
  const index = await readFile(join(out, "index.html"), "utf8");
  assert.equal(cardsOf(index).length, list.length);
  assert.doesNotMatch(index, /<!--\s*catalog:/);
  for (const meta of list) await readFile(join(out, meta.id, "index.html"));
  const prompt = await readFile(join(out, "prompts", "saas-lp.html"), "utf8");
  assert.match(prompt, /<pre\b[^>]*>[\s\S]*&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; と &amp; と/);
  assert.doesNotMatch(prompt, /<script>alert/);
  assert.ok(prompt.includes("静的な HTML/CSS/JS だけで作る。"), "common constraints on the prompt page");
  assert.match(prompt, /href="\.\.\/"/);
  const common = await readFile(join(out, "prompts", "_template.html"), "utf8");
  assert.match(common, /<pre\b[^>]*>[\s\S]*静的な HTML\/CSS\/JS だけで作る。/);
  assert.equal(await renderIndex(await loadCatalog(root), await template()), index);
});

test("dev: renderRequest renders / and prompt pages with the same output as the build", async (t) => {
  const root = fixture("catalog-basic");
  const out = await mkdtemp(join(tmpdir(), "catalog-dev-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await buildDist(root, out);
  for (const [path, file] of [
    ["/", "index.html"],
    ["/index.html", "index.html"],
    ["/prompts/saas-lp.html", "prompts/saas-lp.html"],
    ["/prompts/_template.html", "prompts/_template.html"],
    ["/genre/saas-lp/", "genre/saas-lp/index.html"],
    ["/genre/saas-lp/index.html", "genre/saas-lp/index.html"],
    ["/genre/product-lp/", "genre/product-lp/index.html"],
  ]) {
    const page = await renderRequest(root, path);
    assert.ok(page, path);
    assert.match(page.type, /^text\/html/);
    assert.equal(page.body, await readFile(join(out, file), "utf8"), path);
  }
  for (const path of ["/prompts/README.html", "/prompts/nope.html", "/prompts/../index.html", "/claude-kakehashi/", "/prompts/saas-lp.md", "/genre/inn/", "/genre/nope/", "/genre/saas-lp", "/genre/../index.html", "/genre/"])
    assert.equal(await renderRequest(root, path), null, path);
});

test("repository: the hub has one card per site folder, each linking to its folder and thumb", async () => {
  const { sites } = await siteCoverage(repo);
  const html = await hub(repo);
  const cards = cardsOf(html);
  assert.equal(cards.length, sites.length);
  for (const site of sites) {
    const card = cards.find((c) => c.includes(`data-id="${site}"`));
    assert.ok(card, site);
    assert.ok(card.includes(`href="${site}/"`), site);
    const meta = await readMeta(repo, site);
    if (meta.thumbnail) assert.ok(card.includes(`src="${site}/${meta.thumbnail}"`), site);
  }
});

test("repository: every link and resource in the hub is relative and no external font is loaded", async () => {
  const html = await hub(repo);
  const refs = [...html.matchAll(/\b(?:href|src|action)="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0);
  for (const ref of refs) {
    assert.doesNotMatch(ref, /^\//, ref);
    assert.doesNotMatch(ref, /^[a-z]+:/i, ref);
  }
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|@import|<link\b[^>]*stylesheet/);
  assert.match(html, /:focus-visible/);
});

test("sort: orderSites puts the newest created first and does not mutate its input", () => {
  const input = [
    { id: "a", created: "2026-11-01" },
    { id: "b", created: "2026-11-24" },
    { id: "c", created: "2026-11-10" },
    { id: "d", created: "2025-12-31" },
  ];
  assert.deepEqual(catalog.orderSites(input).map((site) => site.id), ["b", "c", "a", "d"]);
  assert.deepEqual(input.map((site) => site.id), ["a", "b", "c", "d"]);
});

test("sort: orderSites breaks a created tie by the site slug (id) ascending", () => {
  const input = [
    { id: "zeta", created: "2026-11-01" },
    { id: "mid", created: "2026-11-01" },
    { id: "alpha", created: "2026-11-01" },
    { id: "newest", created: "2026-11-24" },
  ];
  assert.deepEqual(catalog.orderSites(input).map((site) => site.id), ["newest", "alpha", "mid", "zeta"]);
});

test("sort: orderSites puts missing or invalid created last, then slug ascending, in code and in a built fixture", async (t) => {
  const input = [
    { id: "x" },
    { id: "b", created: "2026-02-30" },
    { id: "a", created: "yesterday" },
    { id: "c", created: null },
    { id: "d", created: "2026-1-05" },
    { id: "z", created: "2020-01-01" },
    { id: "e", created: "" },
  ];
  assert.deepEqual(catalog.orderSites(input).map((site) => site.id), ["z", "a", "b", "c", "d", "e", "x"]);
  const out = await built(t, await genreFixture(t));
  assert.deepEqual(idsOf(await genrePage(out, "product-lp")), productOrder);
});

test("top: TOP_LIMIT is 6, each genre keeps all works in the DOM in orderSites order, and only the first TOP_LIMIT show until a filter is set", async (t) => {
  assert.equal(catalog.TOP_LIMIT, 6);
  const root = await genreFixture(t);
  const html = await hub(root);
  const product = groupsOf(html).find((group) => group.key === "product-lp");
  assert.ok(product.ids.length >= 7, product.ids.join(", "));
  assert.deepEqual(product.ids, productOrder);
  assert.equal(capOf(html), catalog.TOP_LIMIT);
  for (const group of groupsOf(html))
    assert.match(group.html, /<ul\b[^>]*\bclass="row"[^>]*\bdata-capped\b/, group.key);
  const visible = product.ids.slice(0, capOf(html));
  assert.deepEqual(visible, ["lamp-b", "lamp-c", "lamp-g", "lamp-a", "lamp-d", "gpt-lamp"]);
  assert.match(html, /document\.body\.toggleAttribute\("data-filtering", chosen\.length > 0\)/);
});

test("top: options.topLimit changes how many cards the default view shows", async () => {
  const root = fixture("catalog-basic");
  assert.equal(capOf(await renderHub(root)), catalog.TOP_LIMIT);
  assert.equal(capOf(await renderHub(root, { topLimit: 3 })), 3);
  assert.equal(capOf(await renderHub(root, { topLimit: 1 })), 1);
});

test("genre pages: build writes dist/genre/<slug>/index.html only for genres with at least one work", async (t) => {
  const out = await built(t, await genreFixture(t));
  assert.deepEqual((await readdir(join(out, "genre"))).sort(), ["corporate-hp", "product-lp", "saas-lp"]);
  const repoOut = await mkdtemp(join(tmpdir(), "catalog-genre-repo-"));
  t.after(() => rm(repoOut, { recursive: true, force: true }));
  await writeGallery(repo, repoOut);
  const types = new Set((await metas(repo)).map((meta) => meta.type));
  assert.equal(types.size, 7);
  assert.deepEqual((await readdir(join(repoOut, "genre"))).sort(), [...types].sort());
  for (const type of types) await genrePage(repoOut, type);
});

test("genre pages: every work of the genre is listed in orderSites order, the same order as the top row and the prompt page", async (t) => {
  for (const root of [await genreFixture(t), repo]) {
    const out = await mkdtemp(join(tmpdir(), "catalog-genre-order-"));
    t.after(() => rm(out, { recursive: true, force: true }));
    await writeGallery(root, out);
    const list = await metas(root);
    const { sites } = await loadCatalog(root);
    const top = groupsOf(await readFile(join(out, "index.html"), "utf8"));
    for (const group of top) {
      const ids = idsOf(await genrePage(out, group.key));
      const expected = catalog.orderSites(sites.filter((site) => site.type === group.key)).map((site) => site.id);
      assert.equal(ids.length, list.filter((meta) => meta.type === group.key).length, `${root} ${group.key}`);
      assert.deepEqual(ids, expected, `${root} ${group.key}`);
      assert.deepEqual(group.ids.slice(0, catalog.TOP_LIMIT), ids.slice(0, catalog.TOP_LIMIT), `${root} ${group.key} top`);
    }
    for (const name of (await catalog.listPrompts(root)).filter((name) => name !== "_template")) {
      const path = `prompts/${name}.md`;
      const ids = idsOf(await promptPage(out, name));
      assert.equal(ids.length, list.filter((meta) => meta.promptPath === path).length, `${root} ${name}`);
      const subset = new Set(ids);
      const genre = top.find((group) => group.key === name);
      assert.deepEqual(ids, genre ? genre.ids.filter((id) => subset.has(id)) : [], `${root} ${name}`);
    }
  }
  const out = await built(t, await genreFixture(t));
  assert.deepEqual(idsOf(await genrePage(out, "saas-lp")), saasOrder);
  assert.deepEqual(idsOf(await promptPage(out, "saas-lp")), saasOrder);
});

test("genre pages: cards are renderCard output with ../../ links, identical to the top card once the prefix is removed, with 制作 and no モデル", async (t) => {
  const root = await genreFixture(t);
  const out = await built(t, root);
  const loaded = await loadCatalog(root);
  const index = await readFile(join(out, "index.html"), "utf8");
  for (const site of loaded.sites) {
    const genre = await genrePage(out, site.type);
    const deep = catalog.renderCard(site, "../../");
    assert.ok(genre.includes(deep), site.id);
    assert.ok(index.includes(catalog.renderCard(site)), site.id);
    const topCard = cardsOf(index).find((card) => card.includes(`data-id="${site.id}"`));
    const genreCard = cardsOf(genre).find((card) => card.includes(`data-id="${site.id}"`));
    assert.equal(genreCard.replaceAll('="../../', '="'), topCard, site.id);
    assert.match(genreCard, new RegExp(`href="\\.\\./\\.\\./${site.id}/"`), site.id);
    if (site.promptPath) assert.ok((await promptPage(out, site.promptPath.slice(8, -3))).includes(catalog.renderCard(site, "../")), site.id);
  }
  const repoOut = await mkdtemp(join(tmpdir(), "catalog-genre-label-"));
  t.after(() => rm(repoOut, { recursive: true, force: true }));
  await writeGallery(repo, repoOut);
  for (const type of new Set((await metas(repo)).map((meta) => meta.type))) {
    const page = await genrePage(repoOut, type);
    assert.match(page, /<dt>制作<\/dt>/, type);
    assert.equal(page.split("モデル").length - 1, 0, `モデル in genre/${type}`);
  }
});

test("genre pages: heading and title use the type label, links back to the top and the prompt are relative, and there is no filter form", async (t) => {
  const out = await mkdtemp(join(tmpdir(), "catalog-genre-head-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await writeGallery(repo, out);
  const types = JSON.parse(await readFile(resolve(repo, "site-types.json"), "utf8"));
  for (const type of new Set((await metas(repo)).map((meta) => meta.type))) {
    const page = await genrePage(out, type);
    const label = types.find((item) => item.id === type).label;
    assert.equal(page.match(/<title>([^<]*)<\/title>/)[1], `${label} — webpage-arena`, type);
    assert.equal(page.match(/<h1\b[^>]*>([^<]*)<\/h1>/)[1], label, type);
    assert.ok(page.includes(`aria-label="${label}の作品、横にスクロール"`), type);
    assert.match(page, /<a href="\.\.\/\.\.\/">ギャラリーに戻る<\/a>/, type);
    assert.ok(page.includes(`<a href="../../prompts/${type}.html">お題を読む</a>`), type);
    assert.doesNotMatch(page, /<form\b|data-filters|data-capped/, type);
    assert.doesNotMatch(page, typeIdParen, type);
    for (const [, ref] of page.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
      assert.doesNotMatch(ref, /^\/|^[a-z]+:/i, `${type}: ${ref}`);
      assert.match(ref, /^\.\.\/\.\.\//, `${type}: ${ref}`);
    }
  }
});

test("prompt pages: このお題の作品 lists the works whose promptPath matches below the body, shows 0 件 when there are none, and _template.html has no list", async (t) => {
  const out = await built(t, await genreFixture(t));
  const saas = await promptPage(out, "saas-lp");
  assert.ok(saas.indexOf("このお題の作品") > saas.indexOf("</pre>"), "below the body");
  assert.match(saas, /<h2 id="works">このお題の作品<\/h2>\s*<p>3 件<\/p>/);
  assert.deepEqual(idsOf(saas), saasOrder);
  assert.match(saas, /<pre>[\s\S]*# SaaS（saas-lp）— フィクスチャ/);
  const inn = await promptPage(out, "inn");
  assert.match(inn, /<h2 id="works">このお題の作品<\/h2>\s*<p>0 件<\/p>/);
  assert.equal(cardsOf(inn).length, 0);
  assert.match(inn, /<pre>[\s\S]*作品のないお題。/);
  assert.match(inn, /<a href="\.\.\/">ギャラリーに戻る<\/a>/);
  assert.ok(inn.includes('<a href="_template.html">単独のページ</a>'));
  const common = await promptPage(out, "_template");
  assert.doesNotMatch(common, /このお題の作品|data-card/);
});


test("links: every href and src in the built HTML resolves to an existing file when served under /webpage-arena/", async (t) => {
  const out = await built(t, await genreFixture(t));
  const { pages, links, missing } = await missingRefs(out, "/webpage-arena/");
  assert.deepEqual(missing, []);
  assert.ok(pages.includes("index.html"));
  assert.ok(pages.includes("genre/saas-lp/index.html"));
  assert.ok(pages.includes("prompts/saas-lp.html"));
  assert.ok(links > pages.length, `${links} links in ${pages.length} pages`);
});

test("subpath: serving the built dist under /webpage-arena/ and crawling every page's href and src finds 0 broken links", async (t) => {
  const out = await built(t, await genreFixture(t));
  const server = fileServer(out, "/webpage-arena/", false);
  const origin = await listen(server);
  t.after(() => close(server));
  const seeds = [...new Set([...(await htmlFiles(out)), "genre/product-lp/", "genre/saas-lp/", "genre/corporate-hp/"])];
  const { pages, links, broken } = await crawl(origin, "/webpage-arena/", seeds);
  assert.deepEqual(broken, []);
  for (const path of ["", "genre/product-lp/", "genre/saas-lp/", "prompts/saas-lp.html", "prompts/inn.html", "lamp-a/"])
    assert.ok(pages.includes(`${origin}/webpage-arena/${path}`), path);
  assert.ok(links > pages.length, `${links} links`);
});
