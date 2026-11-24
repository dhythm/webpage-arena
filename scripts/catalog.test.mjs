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
  assert.match(meta.promptPath, /^briefs\/[a-z0-9-]+\.md$/);
  assert.ok(!meta.id.endsWith("-kakehashi"), meta.id);
  assert.equal(meta.thumbnail, "thumb.webp");
  const types = JSON.parse(await readFile(resolve(repo, "site-types.json"), "utf8"));
  assert.ok(types.some((type) => type.id === meta.type), `${meta.type} in site-types.json`);
  await readFile(resolve(repo, meta.promptPath), "utf8");
  const root = await tempCopy(t, "catalog-contributing");
  await mkdir(join(root, "briefs"), { recursive: true });
  await cp(resolve(repo, meta.promptPath), join(root, meta.promptPath));
  if (meta.id !== "grok-kakehashi") {
    await cp(join(root, "grok-kakehashi"), join(root, meta.id), { recursive: true });
    await rm(join(root, "grok-kakehashi"), { recursive: true });
  }
  const name = meta.promptPath.slice("briefs/".length, -".md".length);
  await writeFile(join(root, meta.id, "making.md"), `# 作り方\n1. [お題](../briefs/${name}.html)を渡した。\n   - 変わったこと：LP を作った。\n`);
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
        assert.doesNotMatch(card, /プロンプトを読む|旧お題/, meta.id);
      } else {
        const name = meta.promptPath.slice("prompts/".length, -".md".length);
        const old = `<a href="prompts/${name}.html">旧お題（固定）</a>`;
        if (meta.making === "oneshot" || meta.making === "refined")
          assert.equal(foot, `<a href="making/${meta.id}.html">作り方を読む</a>${old}`, meta.id);
        else assert.ok(foot.startsWith(old), `${meta.id}: ${foot}`);
        assert.doesNotMatch(card, /プロンプトを読む/, meta.id);
        assert.doesNotMatch(card, /プロンプト未収録/, meta.id);
      }
    }
  }
});

test("group note: every genre links すべて見る（N件） to genre/<slug>/ with its total, plus お題を読む only when the type has a genre brief", async (t) => {
  for (const root of [fixture("catalog-basic"), repo, await genreFixture(t)]) {
    const list = await metas(root);
    const prompts = new Map((await catalog.listBriefs(root)).map((brief) => [brief.type, brief]));
    const groups = groupsOf(await hub(root));
    assert.ok(groups.some((group) => !prompts.has(group.key)) || root === repo, root);
    for (const group of groups) {
      const total = list.filter((meta) => meta.type === group.key).length;
      assert.equal(group.ids.length, total, `${root} ${group.key} keeps every card in the DOM`);
      const head = group.html.match(/<div class="group-head">([\s\S]*?)<\/div>/)[1];
      const note = head.match(/<p class="group-note">([\s\S]*?)<\/p>/)[1];
      assert.doesNotMatch(head, /プロンプト未収録/, group.key);
      const all = `<a href="genre/${group.key}/">すべて見る（${total}件）</a>`;
      if (prompts.has(group.key)) assert.match(note, new RegExp(`^${all.replace(/[()（）]/g, "\\$&")}・<a href="briefs/[^"]+">お題を読む</a>$`), `${root} ${group.key}`);
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

test("genre pages: cards are renderCard output with ../../ links, identical to the top card once the prefix and the sibling count are removed, with 制作 and no モデル", async (t) => {
  const root = await genreFixture(t);
  const out = await built(t, root);
  const loaded = await loadCatalog(root);
  const index = await readFile(join(out, "index.html"), "utf8");
  for (const site of loaded.sites) {
    const genre = await genrePage(out, site.type);
    const deep = catalog.renderCard(site, "../../", { siblings: false });
    assert.ok(genre.includes(deep), site.id);
    assert.equal(deep, catalog.renderCard({ ...site, others: 0 }, "../../"), site.id);
    assert.ok(index.includes(catalog.renderCard(site)), site.id);
    const topCard = cardsOf(index).find((card) => card.includes(`data-id="${site.id}"`));
    const genreCard = cardsOf(genre).find((card) => card.includes(`data-id="${site.id}"`));
    const sibling = /<span class="siblings">同じ(?:種別|お題)のほかの作品 \d+ 件<\/span>/;
    assert.equal(sibling.test(topCard), site.others > 0, site.id);
    assert.equal(genreCard.replaceAll('="../../', '="'), topCard.replace(sibling, ""), site.id);
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
    assert.ok(page.includes(`aria-label="${label}の作品"`), type);
    assert.doesNotMatch(page, /横にスクロール/, type);
    assert.match(page, /<a href="\.\.\/\.\.\/">ギャラリーに戻る<\/a>/, type);
    assert.match(page, /<a href="\.\.\/\.\.\/briefs\/[^"]+">お題を読む<\/a>/, type);
    assert.doesNotMatch(page, /<a href="[^"]*prompts\/[^"]*">お題を読む<\/a>/, type);
    assert.doesNotMatch(page, /<form\b|data-filters|data-capped/, type);
    assert.doesNotMatch(page, typeIdParen, type);
    for (const [, ref] of page.matchAll(/\b(?:href|src)="([^"]*)"/g)) {
      assert.doesNotMatch(ref, /^\/|^[a-z]+:/i, `${type}: ${ref}`);
      assert.match(ref, /^\.\.\/\.\.\//, `${type}: ${ref}`);
    }
  }
});

test("genre pages: works are a wrapping grid without data-capped, scroll-snap or 横にスクロール, while the top keeps the capped scroll row", async (t) => {
  const root = await genreFixture(t);
  const out = await built(t, root);
  const index = await readFile(join(out, "index.html"), "utf8");
  for (const group of groupsOf(index)) {
    const row = group.html.match(/<ul\b[^>]*>/)[0];
    assert.match(row, /\bclass="row"/, group.key);
    assert.match(row, /\bdata-capped\b/, group.key);
    assert.match(row, /aria-label="[^"]*横にスクロール"/, group.key);
  }
  for (const slug of ["product-lp", "saas-lp", "corporate-hp"]) {
    const page = await genrePage(out, slug);
    const lists = [...page.matchAll(/<ul\b[^>]*>/g)].map((m) => m[0]);
    assert.equal(lists.length, 1, slug);
    assert.match(lists[0], /\bclass="grid"/, slug);
    assert.doesNotMatch(lists[0], /\bclass="row"|data-capped|tabindex|横にスクロール/, slug);
    assert.match(lists[0], /aria-label="[^"]+の作品"/, slug);
    assert.doesNotMatch(page, /横にスクロール|data-capped/, slug);
  }
  const css = (await readFile(resolve(repo, "index.html"), "utf8")).match(/<style>([\s\S]*?)<\/style>/)[1];
  const rule = (selector) => {
    const m = css.match(new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\>]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
    return m && m[1];
  };
  const grid = rule(".grid");
  assert.ok(grid, "no .grid rule");
  assert.match(grid, /display:\s*grid/);
  assert.match(grid, /grid-template-columns:[^;]*minmax\(/);
  assert.doesNotMatch(grid, /overflow-x|scroll-snap/);
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/scroll-snap|overflow-x|flex:\s*0 0/.test(body)) assert.match(selector.trim(), /^\.row\b/, `${selector.trim()} { ${body.trim()} }`);
  }
  assert.match(rule(".row") ?? "", /scroll-snap-type:\s*x mandatory/);
  assert.match(rule(".row > .card") ?? "", /scroll-snap-align:\s*start/);
});

test("genre pages: no 同じ種別/お題のほかの作品 sibling count, while the top still shows it for genres with 2+ works", async (t) => {
  const root = await genreFixture(t);
  const out = await built(t, root);
  const index = await readFile(join(out, "index.html"), "utf8");
  for (const slug of ["product-lp", "saas-lp"]) {
    const group = groupsOf(index).find((item) => item.key === slug);
    assert.match(group.html, /class="siblings"[^>]*>同じ(?:種別|お題)のほかの作品 \d+ 件/, slug);
  }
  for (const slug of ["product-lp", "saas-lp", "corporate-hp"]) {
    const page = await genrePage(out, slug);
    assert.ok(cardsOf(page).length > 0, slug);
    assert.doesNotMatch(page, /class="siblings"|ほかの作品/, slug);
  }
  const repoOut = await mkdtemp(join(tmpdir(), "catalog-genre-siblings-"));
  t.after(() => rm(repoOut, { recursive: true, force: true }));
  await writeGallery(repo, repoOut);
  for (const type of new Set((await metas(repo)).map((meta) => meta.type)))
    assert.doesNotMatch(await genrePage(repoOut, type), /class="siblings"|ほかの作品/, type);
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

const disclaimer = "作ったときの指示の流れを、読みやすく整えて記録したものです。再現手順ではなく、同じ指示を渡しても同じページになるとは限りません。";
const makingDd = (html) => html.match(/<div><dt>作り方<\/dt><dd>([\s\S]*?)<\/dd><\/div>/)?.[1] ?? null;
const makingRow = (html) => makingDd(html)?.replace(/<[^>]+>/g, "") ?? null;
const footOf = (html) => html.match(/<p class="card-foot">([\s\S]*?)<\/p>/)[1];
const cardIn = (html, id) => cardsOf(html).find((card) => card.includes(`data-id="${id}"`));
const makingFixture = {
  "grok-oneshot": "ワンショット",
  "grok-twostep": "ブラッシュアップ（追加の指示1回）",
  "grok-fourstep": "ブラッシュアップ（追加の指示3回）",
};
const madeWorks = {
  "claude-kakehashi": ["カケハシ", "saas-lp", 2],
  "claude-aodoki": ["青時", "restaurant", 2],
  "claude-nomamichi": ["のまみち", "app-lp", 1],
  "claude-minato-fes": ["港暮らしフェス 2027", "event", 1],
  "claude-kishine": ["岸ねの宿", "inn", 1],
};
function assertMakingCard(card, id, badge, prefix) {
  assert.ok(card, id);
  assert.equal(makingRow(card), badge, id);
  const foot = footOf(card);
  assert.equal(foot.match(/<a\b[^>]*>作り方を読む<\/a>/g)?.length ?? 0, 1, `${id}: ${foot}`);
  assert.ok(foot.includes(`<a href="${prefix}making/${id}.html">作り方を読む</a>`), `${id}: ${foot}`);
  assert.doesNotMatch(foot, /プロンプトを読む|プロンプト未収録/, id);
  assert.match(foot, /<a href="[^"]*prompts\/[a-z-]+\.html">旧お題（固定）<\/a>/, id);
}
function assertPlainCard(card, id, prompt) {
  assert.ok(card, id);
  assert.equal(makingRow(card), null, id);
  assert.doesNotMatch(card, /作り方|ワンショット|ブラッシュアップ/, id);
  const foot = footOf(card);
  if (prompt) assert.match(foot, /<a href="[^"]*prompts\/[a-z-]+\.html">旧お題（固定）<\/a>/, id);
  else {
    assert.ok(foot.includes(`<span aria-hidden="true">${missingPrompt}</span>`), id);
    assert.ok(foot.includes(`<span class="sr-only">${fullMissing}</span>`), id);
  }
}

test("making cards: oneshot shows ワンショット, refined shows ブラッシュアップ（追加の指示N回） with N = steps − 1 (2 steps → 1, 4 steps → 3), each with 作り方を読む to making/<id>.html on top, genre and prompt pages", async (t) => {
  const root = fixture("catalog-making");
  const out = await built(t, root, "catalog-making-cards-");
  const top = await readFile(join(out, "index.html"), "utf8");
  const genre = await genrePage(out, "saas-lp");
  const prompt = await promptPage(out, "saas-lp");
  for (const [id, badge] of Object.entries(makingFixture)) {
    assertMakingCard(cardIn(top, id), id, badge, "");
    assertMakingCard(cardIn(genre, id), id, badge, "../../");
    assertMakingCard(cardIn(prompt, id), id, badge, "../");
  }
});

test("making cards: unknown with a prompt shows no 作り方 row and keeps プロンプトを読む; no promptPath shows no row and keeps the short 未収録 plus the sr-only sentence", async (t) => {
  const out = await built(t, fixture("catalog-making"), "catalog-making-plain-");
  const top = await readFile(join(out, "index.html"), "utf8");
  assertPlainCard(cardIn(top, "grok-norecord"), "grok-norecord", true);
  assertPlainCard(cardIn(await genrePage(out, "saas-lp"), "grok-norecord"), "grok-norecord", true);
  assertPlainCard(cardIn(await promptPage(out, "saas-lp"), "grok-norecord"), "grok-norecord", true);
  assertPlainCard(cardIn(top, "devin-unrecorded"), "devin-unrecorded", false);
  assertPlainCard(cardIn(await genrePage(out, "product-lp"), "devin-unrecorded"), "devin-unrecorded", false);
  for (const id of ["claude-kakehashi", "grok-kakehashi", "devin-firm", "gpt-lamp", "grok-lamp"])
    assertPlainCard(cardIn(await hub(fixture("catalog-basic")), id), id, id.includes("kakehashi"));
});

test("making cards: the five recorded works show ブラッシュアップ with N 2, 2, 1, 1, 1 and 作り方を読む on top, genre and prompt pages, and the twelve unrecorded works keep 未収録 with no 作り方 row", async (t) => {
  const out = await mkdtemp(join(tmpdir(), "catalog-making-repo-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await writeGallery(repo, out);
  const top = await readFile(join(out, "index.html"), "utf8");
  for (const [id, [, type, extra]] of Object.entries(madeWorks)) {
    const badge = `ブラッシュアップ（追加の指示${extra}回）`;
    assertMakingCard(cardIn(top, id), id, badge, "");
    assertMakingCard(cardIn(await genrePage(out, type), id), id, badge, "../../");
    assertMakingCard(cardIn(await promptPage(out, type), id), id, badge, "../");
  }
  const unrecorded = (await metas(repo)).filter((meta) => meta.promptPath === null);
  assert.equal(unrecorded.length, 12);
  for (const meta of unrecorded) {
    assertPlainCard(cardIn(top, meta.id), meta.id, false);
    assertPlainCard(cardIn(await genrePage(out, meta.type), meta.id), meta.id, false);
  }
  assert.equal(top.split("作り方を読む").length - 1, 5);
});

test("making pages: build writes dist/making/<id>.html only for works with a record, with the 作り方 heading, the disclaimer once, the first step linking to the prompt page, and no HTML comment or folder id", async (t) => {
  const root = fixture("catalog-making");
  const out = await built(t, root, "catalog-making-pages-");
  assert.deepEqual((await readdir(join(out, "making"))).sort(), ["grok-fourstep.html", "grok-oneshot.html", "grok-twostep.html"]);
  const titles = { "grok-oneshot": "一発", "grok-twostep": "二段", "grok-fourstep": "四段" };
  const counts = { "grok-oneshot": 1, "grok-twostep": 2, "grok-fourstep": 4 };
  for (const [id, title] of Object.entries(titles)) {
    const page = await readFile(join(out, "making", `${id}.html`), "utf8");
    assert.equal(page.match(/<h1>([^<]*)<\/h1>/)[1], `作り方 — ${title}`, id);
    assert.match(page, new RegExp(`<title>作り方 — ${title} — webpage-arena</title>`), id);
    assert.equal(page.split(disclaimer).length - 1, 1, id);
    assert.doesNotMatch(page, /<!--|根拠|原文は載せない/, id);
    assert.ok(!page.includes(`（${id}）`) && !page.includes(`>${id}<`), id);
    assert.doesNotMatch(page, /<pre\b/, id);
    assert.match(page, /<a href="\.\.\/">ギャラリーに戻る<\/a>/, id);
    const list = page.match(/<ol class="steps">([\s\S]*?)<\/ol>/);
    assert.ok(list, id);
    assert.equal([...list[1].matchAll(/^\s*<li>/gm)].length, counts[id], id);
    const first = list[1].split(/^\s*<li>/m)[1];
    assert.ok(first.includes('<a href="../prompts/saas-lp.html">お題「SaaS」</a>を渡した。'), first);
  }
  const four = await readFile(join(out, "making", "grok-fourstep.html"), "utf8");
  assert.ok(four.includes("<code>&lt;br&gt;</code> と &amp; の扱い"), "inline code and & are escaped");
  assert.ok(four.includes("&lt;b&gt;崩れ&lt;/b&gt;"), "raw HTML is escaped");
  assert.doesNotMatch(four, /<b>崩れ/);
  assert.doesNotMatch(four, /ステップに数えない/);
  assert.ok(four.includes("<li>変わったこと：ラベルが読みやすくなった。</li>"));
  await assert.rejects(readFile(join(out, "making", "grok-norecord.html")));
  await assert.rejects(readFile(join(out, "making", "devin-unrecorded.html")));
  await assert.rejects(readFile(join(out, "grok-fourstep", "making.md")));
  await readFile(join(out, "grok-fourstep", "thumb.webp"));
  const basic = await built(t, fixture("catalog-basic"), "catalog-making-none-");
  await assert.rejects(readdir(join(basic, "making")));
});

test("making pages: the five recorded works get 作り方 — <title> pages whose first step links to their お題 page", async (t) => {
  const out = await mkdtemp(join(tmpdir(), "catalog-making-repo-pages-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await writeGallery(repo, out);
  assert.deepEqual((await readdir(join(out, "making"))).sort(), Object.keys(madeWorks).map((id) => `${id}.html`).sort());
  for (const [id, [title, type, extra]] of Object.entries(madeWorks)) {
    const page = await readFile(join(out, "making", `${id}.html`), "utf8");
    assert.equal(page.match(/<h1>([^<]*)<\/h1>/)[1], `作り方 — ${title}`, id);
    assert.equal(page.split(disclaimer).length - 1, 1, id);
    assert.doesNotMatch(page, /<!--|根拠/, id);
    assert.ok(!page.includes(`（${id}）`), id);
    const list = page.match(/<ol class="steps">([\s\S]*?)<\/ol>/)[1];
    assert.equal([...list.matchAll(/^\s*<li>/gm)].length, extra + 1, id);
    const first = list.split(/^\s*<li>/m)[1];
    assert.match(first, new RegExp(`<a href="\\.\\./prompts/${type}\\.html">お題「[^」]+」</a>を渡した`), id);
  }
});

test("dev: renderRequest serves /making/<id>.html with the same output as the build and null for works without a record", async (t) => {
  const root = fixture("catalog-making");
  const out = await built(t, root, "catalog-making-dev-");
  for (const id of Object.keys(makingFixture)) {
    const page = await renderRequest(root, `/making/${id}.html`);
    assert.ok(page, id);
    assert.match(page.type, /^text\/html/);
    assert.equal(page.body, await readFile(join(out, "making", `${id}.html`), "utf8"), id);
  }
  for (const path of ["/making/grok-norecord.html", "/making/devin-unrecorded.html", "/making/nope.html", "/making/../index.html", "/making/", "/making/grok-oneshot.md", "/grok-oneshot/making.md.html"])
    assert.equal(await renderRequest(root, path), null, path);
});

test("folder add: copying one site folder with making.md and a thumbnail shows the badge and 作り方を読む on top, genre and prompt cards, writes dist/making/<id>.html, passes checkSites, and leaves every other file unchanged", async (t) => {
  const root = await tempCopy(t, "catalog-basic");
  const beforeSources = await hashTree(root);
  const beforeOut = await built(t, root, "catalog-making-add-before-");
  const beforeDist = await hashTree(beforeOut);
  const id = "grok-fourstep";
  await cp(join(fixture("catalog-making"), id), join(root, id), { recursive: true });
  assert.deepEqual((await readdir(join(root, id))).sort(), ["index.html", "making.md", "meta.json", "thumb.webp"]);
  const afterSources = await hashTree(root, new Set([id]));
  assert.equal(afterSources.hash, beforeSources.hash);
  assert.deepEqual(afterSources.files, beforeSources.files);
  assert.deepEqual((await checkSites(root, { tracked: [] })).errors, []);
  const afterOut = await built(t, root, "catalog-making-add-after-");
  const badge = makingFixture[id];
  assertMakingCard(cardIn(await readFile(join(afterOut, "index.html"), "utf8"), id), id, badge, "");
  assertMakingCard(cardIn(await genrePage(afterOut, "saas-lp"), id), id, badge, "../../");
  assertMakingCard(cardIn(await promptPage(afterOut, "saas-lp"), id), id, badge, "../");
  const page = await readFile(join(afterOut, "making", `${id}.html`), "utf8");
  assert.equal(page.match(/<h1>([^<]*)<\/h1>/)[1], "作り方 — 四段");
  const afterDist = await hashTree(afterOut);
  const added = afterDist.files.filter((file) => !beforeDist.files.includes(file));
  assert.deepEqual(added.sort(), [`${id}/index.html`, `${id}/meta.json`, `${id}/thumb.webp`, `making/${id}.html`]);
  const kept = await hashTree(afterOut, new Set([id, "making", "index.html", "genre/saas-lp", "prompts/saas-lp.html"]));
  assert.equal(kept.hash, (await hashTree(beforeOut, new Set(["index.html", "genre/saas-lp", "prompts/saas-lp.html"]))).hash);
});

test("links: the built making pages are crawled under /webpage-arena/ with 0 broken links, in the fixture and in the repository", async (t) => {
  const out = await built(t, fixture("catalog-making"), "catalog-making-links-");
  const { pages, missing } = await missingRefs(out, "/webpage-arena/");
  assert.deepEqual(missing, []);
  for (const id of Object.keys(makingFixture)) assert.ok(pages.includes(`making/${id}.html`), id);
  const server = fileServer(out, "/webpage-arena/", false);
  const origin = await listen(server);
  t.after(() => close(server));
  const crawled = await crawl(origin, "/webpage-arena/", [""]);
  assert.deepEqual(crawled.broken, []);
  for (const id of Object.keys(makingFixture)) assert.ok(crawled.pages.includes(`${origin}/webpage-arena/making/${id}.html`), id);
  assert.ok(crawled.pages.includes(`${origin}/webpage-arena/prompts/saas-lp.html`));
  const repoOut = await built(t, repo, "catalog-making-repo-links-");
  const repoRefs = await missingRefs(repoOut, "/webpage-arena/");
  assert.deepEqual(repoRefs.missing, []);
  for (const id of Object.keys(madeWorks)) assert.ok(repoRefs.pages.includes(`making/${id}.html`), id);
});

const styleRules = (html) =>
  [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].flatMap((m) => [...m[1].matchAll(/([^{}]+)\{([^}]*)\}/g)].map((r) => ({ selector: r[1].trim(), body: r[2] })));
const nowrapClasses = (html) =>
  styleRules(html)
    .filter((rule) => /white-space:\s*nowrap/.test(rule.body))
    .flatMap((rule) => [...rule.selector.matchAll(/\.([\w-]+)\s*(?:,|$)/g)].map((m) => m[1]));
async function makingWorks(root) {
  const works = {};
  for (const meta of await metas(root)) if (meta.making === "oneshot" || meta.making === "refined") works[meta.id] = meta;
  return works;
}

test("making pages: work link — under the heading, <title>を見る links to ../<id>/ (plus the thumb when there is one), and the target exists in the built dist, for the five works and the fixture", async (t) => {
  for (const [root, ids] of [[fixture("catalog-making"), Object.keys(makingFixture)], [repo, Object.keys(madeWorks)]]) {
    const out = await built(t, root, "catalog-making-worklink-");
    const works = await makingWorks(root);
    assert.deepEqual(Object.keys(works).sort(), [...ids].sort());
    for (const [id, meta] of Object.entries(works)) {
      const page = await readFile(join(out, "making", `${id}.html`), "utf8");
      const afterHeading = page.split(/<h1>[^<]*<\/h1>/)[1];
      assert.ok(afterHeading, id);
      const beforeSteps = afterHeading.split('<ol class="steps">')[0];
      assert.ok(beforeSteps.includes(`<a href="../${id}/">${meta.title}を見る</a>`), `${id}: ${beforeSteps}`);
      const thumb = beforeSteps.match(/<a\b[^>]*href="([^"]*)"[^>]*>\s*<img\b[^>]*src="([^"]*)"/);
      if (meta.thumbnail) {
        assert.ok(thumb, id);
        assert.deepEqual([thumb[1], thumb[2]], [`../${id}/`, `../${id}/${meta.thumbnail}`], id);
        await readFile(join(out, id, meta.thumbnail));
      } else assert.equal(thumb, null, id);
      assert.ok((await readdir(join(out, id))).includes("index.html"), id);
    }
    const { missing } = await missingRefs(out, "/webpage-arena/");
    assert.deepEqual(missing, []);
    const server = fileServer(out, "/webpage-arena/", false);
    const origin = await listen(server);
    t.after(() => close(server));
    const crawled = await crawl(origin, "/webpage-arena/", Object.keys(works).map((id) => `making/${id}.html`));
    assert.deepEqual(crawled.broken, []);
    for (const id of Object.keys(works)) assert.ok(crawled.pages.includes(`${origin}/webpage-arena/${id}/`), id);
  }
});

test("making cards: nowrap — the （追加の指示N回） part sits in a white-space: nowrap span from index.html, the visible text stays ブラッシュアップ（追加の指示N回）, and ワンショット has no span", async (t) => {
  const css = nowrapClasses(await template());
  const out = await built(t, fixture("catalog-making"), "catalog-making-nowrap-");
  const repoOut = await mkdtemp(join(tmpdir(), "catalog-making-nowrap-repo-"));
  t.after(() => rm(repoOut, { recursive: true, force: true }));
  await writeGallery(repo, repoOut);
  const cases = [
    ...Object.entries(makingFixture).map(([id, badge]) => [out, id, badge]),
    ...Object.entries(madeWorks).map(([id, [, , n]]) => [repoOut, id, `ブラッシュアップ（追加の指示${n}回）`]),
  ];
  for (const [dir, id, badge] of cases) {
    const top = await readFile(join(dir, "index.html"), "utf8");
    assert.deepEqual(nowrapClasses(top), css);
    const dd = makingDd(cardIn(top, id));
    assert.equal(makingRow(cardIn(top, id)), badge, id);
    const n = badge.match(/（追加の指示(\d+)回）/);
    if (!n) {
      assert.equal(dd, badge, id);
      continue;
    }
    const span = dd.match(/^ブラッシュアップ<span class="([^"]+)">([^<]*)<\/span>$/);
    assert.ok(span, `${id}: ${dd}`);
    assert.equal(span[2], n[0], id);
    assert.ok(css.includes(span[1]), `${span[1]} not in ${css}`);
  }
});

test("making pages: link style — links use color: inherit with text-underline-offset like the gallery, never #173cda as the link color, on making and お題 pages", async (t) => {
  const out = await built(t, fixture("catalog-making"), "catalog-making-linkstyle-");
  const gallery = styleRules(await template()).find((rule) => rule.selector === "a");
  assert.match(gallery.body, /color:\s*inherit/);
  const pages = [...Object.keys(makingFixture).map((id) => `making/${id}.html`), "prompts/saas-lp.html", "prompts/_template.html"];
  for (const path of pages) {
    const html = await readFile(join(out, path), "utf8");
    const rules = styleRules(html).filter((rule) => rule.selector === "a");
    assert.ok(rules.length, path);
    const last = rules.at(-1).body;
    assert.match(last, /color:\s*inherit/, path);
    assert.match(last, /text-underline-offset:\s*4px/, path);
    for (const rule of rules) assert.doesNotMatch(rule.body, /#173cda/i, path);
    const hover = styleRules(html).filter((rule) => rule.selector === "a:hover");
    assert.ok(hover.length, path);
  }
});

const briefSlugs = {
  "accounting-saas": ["経理系SaaS", "saas-lp"],
  "recruiting-saas": ["採用系SaaS", "saas-lp"],
  restaurant: ["飲食店", "restaurant"],
  "lifestyle-app": ["生活・移動アプリ", "app-lp"],
  "local-event": ["地域イベント", "event"],
  inn: ["宿・旅館", "inn"],
  corporate: ["企業コーポレート", "corporate-hp"],
  product: ["物販・プロダクト", "product-lp"],
};
const headerOf = (html) => html.match(/<header>([\s\S]*?)<\/header>/)?.[1] ?? html.match(/<main>\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? "";
const odaiHref = (html) => html.match(/<a href="([^"]*)">お題を読む<\/a>/)?.[1] ?? null;
const sectionById = (html, id) => html.match(new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</section>`))?.[1] ?? null;
const briefPage = (out, name) => readFile(join(out, "briefs", `${name}.html`), "utf8");
async function briefFixture(t) {
  const root = await tempCopy(t, "catalog-basic");
  await mkdir(join(root, "briefs"));
  for (const slug of ["accounting-saas", "recruiting-saas", "product"]) await cp(resolve(repo, "briefs", `${slug}.md`), join(root, "briefs", `${slug}.md`));
  await cp(join(root, "claude-kakehashi"), join(root, "grok-ledgerline"), { recursive: true });
  const meta = JSON.parse(await readFile(join(root, "claude-kakehashi", "meta.json"), "utf8"));
  await writeFile(
    join(root, "grok-ledgerline", "meta.json"),
    JSON.stringify({ ...meta, id: "grok-ledgerline", title: "Ledgerline", model: "Grok", tool: "Cursor", promptPath: "briefs/accounting-saas.md", created: "2026-12-09", making: "oneshot" }),
  );
  await writeFile(join(root, "grok-ledgerline", "making.md"), "# 作り方：Ledgerline\n1. [お題「経理系SaaS」](../briefs/accounting-saas.html)を渡した。\n   - 変わったこと：LP を作った。\n");
  return root;
}

test("briefs: お題を読む on every top row and genre page of the repository opens a genre brief under briefs/, never prompts/", async (t) => {
  const out = await mkdtemp(join(tmpdir(), "catalog-briefs-odai-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await writeGallery(repo, out);
  const top = await readFile(join(out, "index.html"), "utf8");
  const types = new Set((await metas(repo)).map((meta) => meta.type));
  for (const group of groupsOf(top)) {
    const href = odaiHref(group.html.match(/<p class="group-note">([\s\S]*?)<\/p>/)[1]);
    assert.ok(href, group.key);
    assert.match(href, /^briefs\//, group.key);
    const page = await genrePage(out, group.key);
    assert.equal(odaiHref(page), `../../${href}`, group.key);
  }
  assert.equal(groupsOf(top).length, types.size);
  assert.doesNotMatch(withoutCards(top), /href="prompts\/[a-z-]+\.html"/);
  for (const [slug, [, type]] of Object.entries(briefSlugs)) {
    const href = odaiHref(groupsOf(top).find((group) => group.key === type).html);
    if (type === "saas-lp") assert.match(href, /^briefs\/index\.html#type-saas-lp$/);
    else assert.equal(href, `briefs/${slug}.html`, type);
  }
});

test("briefs: the saas-lp destination lists both 経理系SaaS and 採用系SaaS, and the index lists all eight briefs with relative links", async (t) => {
  const out = await mkdtemp(join(tmpdir(), "catalog-briefs-index-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await writeGallery(repo, out);
  const index = await briefPage(out, "index");
  const saas = sectionById(index, "type-saas-lp");
  assert.ok(saas, "section#type-saas-lp");
  assert.ok(saas.includes('<a href="accounting-saas.html">経理系SaaS</a>'), saas);
  assert.ok(saas.includes('<a href="recruiting-saas.html">採用系SaaS</a>'), saas);
  for (const [slug, [label, type]] of Object.entries(briefSlugs)) {
    assert.ok(sectionById(index, `type-${type}`).includes(`<a href="${slug}.html">${label}</a>`), slug);
    const page = await briefPage(out, slug);
    assert.equal(page.match(/<h1>([^<]*)<\/h1>/)[1], label, slug);
    assert.ok(page.includes("作る側が自由に決める"), slug);
    assert.ok(page.includes("全お題に共通の制約"), slug);
  }
  for (const [, ref] of index.matchAll(/\b(?:href|src)="([^"]*)"/g)) assert.doesNotMatch(ref, /^\/|^[a-z]+:/i, ref);
});

test("briefs: a type without a genre brief shows no お題を読む and never falls back to prompts/", async (t) => {
  const root = await briefFixture(t);
  const top = await hub(root);
  for (const group of groupsOf(top)) {
    const note = group.html.match(/<p class="group-note">([\s\S]*?)<\/p>/)[1];
    if (group.key === "corporate-hp") assert.doesNotMatch(note, /お題を読む/);
    else assert.match(odaiHref(note), /^briefs\//, group.key);
    assert.doesNotMatch(note, /prompts\//, group.key);
  }
  const plain = await hub(fixture("catalog-basic"));
  assert.doesNotMatch(plain, /お題を読む/);
});

test("briefs: the header links to the genre-brief list on the top, genre, brief, old prompt and making pages", async (t) => {
  const out = await mkdtemp(join(tmpdir(), "catalog-briefs-header-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await writeGallery(repo, out);
  const link = (base) => `<a href="${base}briefs/index.html">ジャンルのお題を見る</a>`;
  assert.ok(headerOf(await readFile(join(out, "index.html"), "utf8")).includes(link("")));
  assert.ok(headerOf(await genrePage(out, "saas-lp")).includes(link("../../")));
  for (const page of ["briefs/index.html", "briefs/accounting-saas.html", "prompts/saas-lp.html", "prompts/_template.html", "making/claude-kakehashi.html"]) {
    const html = await readFile(join(out, page), "utf8");
    assert.ok(headerOf(html).includes(link("../")), `${page}: ${headerOf(html)}`);
    assert.doesNotMatch(headerOf(html), /お題を読む/, page);
  }
});

test("briefs: old-prompt cards show 旧お題（固定） to prompts/<name>.html on top, genre and prompt pages while keeping 作り方を読む", async (t) => {
  const out = await mkdtemp(join(tmpdir(), "catalog-briefs-old-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await writeGallery(repo, out);
  const old = (await metas(repo)).filter((meta) => typeof meta.promptPath === "string" && meta.promptPath.startsWith("prompts/"));
  assert.equal(old.length, 5);
  const top = await readFile(join(out, "index.html"), "utf8");
  for (const meta of old) {
    const name = meta.promptPath.slice("prompts/".length, -".md".length);
    for (const [html, base] of [[top, ""], [await genrePage(out, meta.type), "../../"], [await promptPage(out, name), "../"]]) {
      const foot = footOf(cardIn(html, meta.id));
      assert.ok(foot.includes(`<a href="${base}prompts/${name}.html">旧お題（固定）</a>`), `${meta.id} ${base}: ${foot}`);
      assert.ok(foot.includes(`<a href="${base}making/${meta.id}.html">作り方を読む</a>`), `${meta.id} ${base}: ${foot}`);
      assert.doesNotMatch(foot, /プロンプトを読む/, meta.id);
    }
  }
});

test("briefs: a work whose promptPath is briefs/<slug>.md passes checkSites and links its card to the brief, not 旧お題", async (t) => {
  const root = await briefFixture(t);
  assert.deepEqual((await checkSites(root, { tracked: [] })).errors, []);
  const out = await built(t, root, "catalog-briefs-work-");
  const top = await readFile(join(out, "index.html"), "utf8");
  const brief = await briefPage(out, "accounting-saas");
  for (const [html, base] of [[top, ""], [await genrePage(out, "saas-lp"), "../../"], [brief, "../"]]) {
    const card = cardIn(html, "grok-ledgerline");
    assert.ok(card, base);
    const foot = footOf(card);
    assert.ok(foot.includes(`<a href="${base}briefs/accounting-saas.html">お題を読む</a>`), `${base}: ${foot}`);
    assert.ok(foot.includes(`<a href="${base}making/grok-ledgerline.html">作り方を読む</a>`), `${base}: ${foot}`);
    assert.doesNotMatch(card, /旧お題|prompts\//, base);
  }
  assert.ok(sectionById(brief, "works") === null || brief.includes("このお題の作品"));
  assert.ok(brief.includes("このお題の作品"));
  assert.deepEqual(idsOf(brief), ["grok-ledgerline"]);
  const making = await readFile(join(out, "making", "grok-ledgerline.html"), "utf8");
  assert.ok(making.includes('<a href="../briefs/accounting-saas.html">お題「経理系SaaS」</a>'));
  const labels = new Map(optionLabelsOf(top, "prompt"));
  assert.match(labels.get("briefs/accounting-saas.md"), /^経理系SaaS（1）$/);
});

test("briefs: build writes dist/briefs/<slug>.html and index.html, and a second build into the same dist gives identical files", async (t) => {
  const out = await mkdtemp(join(tmpdir(), "catalog-briefs-twice-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  const first = await buildDist(repo, out);
  const before = await hashTree(join(out, "briefs"));
  const all = await hashTree(out);
  const second = await buildDist(repo, out);
  assert.deepEqual(before.files, ["index.html", ...Object.keys(briefSlugs).map((slug) => `${slug}.html`)].sort());
  assert.equal((await hashTree(join(out, "briefs"))).hash, before.hash);
  assert.equal((await hashTree(out)).hash, all.hash);
  assert.deepEqual(first.briefs, second.briefs);
  assert.deepEqual(first.briefs, Object.keys(briefSlugs).sort());
});

test("briefs: dev renderRequest serves /briefs/ pages with the same output as the build and null for unknown paths", async (t) => {
  const root = await briefFixture(t);
  const out = await built(t, root, "catalog-briefs-dev-");
  for (const [path, file] of [["/briefs/index.html", "briefs/index.html"], ["/briefs/", "briefs/index.html"], ["/briefs/accounting-saas.html", "briefs/accounting-saas.html"], ["/briefs/product.html", "briefs/product.html"]]) {
    const page = await renderRequest(root, path);
    assert.ok(page, path);
    assert.equal(page.type, "text/html; charset=utf-8");
    assert.equal(page.body, await readFile(join(out, file), "utf8"), path);
  }
  for (const path of ["/briefs/README.html", "/briefs/nope.html", "/briefs/../index.html", "/briefs/accounting-saas.md", "/briefs/_template.html"])
    assert.equal(await renderRequest(root, path), null, path);
});

test("briefs: crawling the built repository and a briefs fixture under /webpage-arena/ finds 0 broken links across briefs, old prompts and making pages", async (t) => {
  for (const root of [repo, await briefFixture(t)]) {
    const out = await built(t, root, "catalog-briefs-crawl-");
    const { pages, missing } = await missingRefs(out, "/webpage-arena/");
    assert.deepEqual(missing, [], root);
    assert.ok(pages.includes("briefs/index.html"), root);
    assert.ok(pages.includes("briefs/accounting-saas.html"), root);
    assert.ok(pages.includes("prompts/saas-lp.html"), root);
    const server = fileServer(out, "/webpage-arena/", false);
    const origin = await listen(server);
    const { pages: crawled, broken } = await crawl(origin, "/webpage-arena/", ["", "briefs/index.html"]);
    await close(server);
    assert.deepEqual(broken, [], root);
    assert.ok(crawled.includes(`${origin}/webpage-arena/briefs/recruiting-saas.html`), root);
  }
});

test("docs: README and CONTRIBUTING add a work from a genre brief in briefs/ with a <model>-<own slug> folder, and keep prompts/ as 旧お題（固定）", async () => {
  const readme = await readFile(resolve(repo, "README.md"), "utf8");
  const contributing = await readFile(resolve(repo, "CONTRIBUTING.md"), "utf8");
  for (const [name, text] of [["README", readme], ["CONTRIBUTING", contributing]]) {
    assert.ok(text.includes("briefs/"), name);
    assert.ok(text.includes("ジャンルのお題"), name);
    assert.ok(text.includes("旧お題（固定）"), name);
    assert.ok(text.includes("作品独自の slug"), name);
    assert.doesNotMatch(text, /prefix だけ変え/, name);
  }
  assert.match(contributing, /`promptPath` \| 必須 \| `null`[^|\n]*`briefs\/\*\.md`/);
});
