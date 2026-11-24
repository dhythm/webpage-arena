import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkSites } from "./check-sites.mjs";
import { readMeta, siteCoverage } from "./sites.mjs";
import {
  buildDist,
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

test("order: shared-prompt groups come first, then untracked groups in site-types order, sites by id", async () => {
  const groups = groupsOf(await hub(fixture("catalog-basic")));
  assert.deepEqual(
    groups.map((group) => [group.key, group.ids]),
    [
      ["prompts/saas-lp.md", ["claude-kakehashi", "grok-kakehashi"]],
      ["type:product-lp", ["gpt-lamp", "grok-lamp"]],
      ["type:corporate-hp", ["devin-firm"]],
    ],
  );
});

test("grouping: sites with the same promptPath share one row and untracked sites group by type label", async () => {
  const root = fixture("catalog-basic");
  const list = await metas(root);
  const groups = groupsOf(await hub(root));
  const expected = tally(list, groupKey);
  assert.deepEqual(new Set(groups.map((group) => group.key)), new Set(expected.keys()));
  for (const group of groups) {
    assert.equal(group.ids.length, expected.get(group.key), group.key);
    const rows = group.html.match(/<ul\b[^>]*\bclass="row"/g) ?? [];
    assert.equal(rows.length, 1, `${group.key} has exactly one row`);
    for (const id of group.ids) assert.equal(groupKey(list.find((meta) => meta.id === id)), group.key);
  }
  const types = JSON.parse(await readFile(resolve(repo, "site-types.json"), "utf8"));
  const label = (id) => types.find((type) => type.id === id).label;
  assert.match(groups.find((g) => g.key === "type:product-lp").html, new RegExp(`<h2[^>]*>[^<]*${label("product-lp")}`));
  assert.match(groups.find((g) => g.key === "type:corporate-hp").html, new RegExp(`<h2[^>]*>[^<]*${label("corporate-hp")}`));
  const saas = groups.find((g) => g.key === "prompts/saas-lp.md").html;
  assert.match(saas, /<h2[^>]*>SaaS — フィクスチャ<\/h2>/);
  assert.ok(saas.includes('aria-label="SaaS — フィクスチャの作品、横にスクロール"'), saas);
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
  assert.ok(html.includes('<p class="total">3 作品・制作 3 種・1 グループ</p>'));
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

test("group note: type groups show only 'N 作品' without プロンプト未収録; prompt groups keep 'N 作品・お題を読む'", async () => {
  for (const root of [fixture("catalog-basic"), repo]) {
    const groups = groupsOf(await hub(root));
    assert.ok(groups.some((group) => group.key.startsWith("type:")), root);
    for (const group of groups) {
      const head = group.html.match(/<div class="group-head">([\s\S]*?)<\/div>/)[1];
      const note = head.match(/<p class="group-note">([\s\S]*?)<\/p>/)[1];
      assert.doesNotMatch(head, /プロンプト未収録/, group.key);
      if (group.key.startsWith("type:")) assert.equal(note, `${group.ids.length} 作品`, group.key);
      else {
        const name = group.key.slice("prompts/".length, -".md".length);
        assert.equal(note, `${group.ids.length} 作品・<a href="prompts/${name}.html">お題を読む</a>`, group.key);
      }
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

test("lead and counts: the intro covers prompt rows and type rows, and the filter count starts empty", async () => {
  for (const root of [fixture("catalog-basic"), repo]) {
    const list = await metas(root);
    const html = await hub(root);
    assert.match(html, /<p class="lead">[\s\S]*お題ごとに1行に並べます。プロンプトが残っていない作品は種別ごとにまとめています。[\s\S]*?<\/p>/);
    const groups = new Set(list.map(groupKey)).size;
    const models = new Set(list.map((m) => m.model)).size;
    assert.ok(html.includes(`<p class="total">${list.length} 作品・制作 ${models} 種・${groups} グループ</p>`), root);
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
  const row = groupsOf(html).find((group) => group.key === "prompts/saas-lp.md");
  assert.ok(row.ids.includes("gemini-kakehashi"), row.ids.join(", "));
  assert.ok(optionsOf(html, "model").includes("Gemini"));
  assert.ok(optionsOf(html, "tool").includes("Gemini CLI"));
  const size = before.filter((m) => m.promptPath === "prompts/saas-lp.md").length + 1;
  assert.ok(html.includes(`同じお題のほかの作品 ${size - 1} 件`));
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
  const saas = groups.find((g) => g.key === "prompts/saas-lp.md");
  assert.match(saas.html, /<h2[^>]*>SaaS — カケハシ<\/h2>/);
  const restaurant = groups.find((g) => g.key === "prompts/restaurant.md");
  assert.match(restaurant.html, /<h2[^>]*>飲食 — 青時（あおどき）<\/h2>/);
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

test("prompt pages: every page baked by writeGallery has <title>, <h1> and the first # line in <pre> without a type id, and no （元のプロンプトは残っていません）; the hub has it only inside cards", async (t) => {
  for (const root of [fixture("catalog-basic"), repo]) {
    const out = await mkdtemp(join(tmpdir(), "catalog-prompt-pages-"));
    t.after(() => rm(out, { recursive: true, force: true }));
    const names = await writeGallery(root, out);
    const index = await readFile(join(out, "index.html"), "utf8");
    assert.ok(!withoutCards(index).includes(longMissing), `${root} index outside cards`);
    for (const name of names) {
      const page = await readFile(join(out, "prompts", `${name}.html`), "utf8");
      const title = page.match(/<title>([^<]*)<\/title>/)[1];
      const h1 = page.match(/<h1>([^<]*)<\/h1>/)[1];
      const pre = page.match(/<pre>([\s\S]*?)<\/pre>/)[1];
      const head = pre.match(/^#\s+(.+?)\s*$/m)[1];
      assert.equal(title, `${h1} — webpage-arena`, `${root} ${name}`);
      assert.equal(head, h1, `${root} ${name}`);
      for (const text of [title, h1, head]) assert.doesNotMatch(text, typeIdParen, `${root} ${name}: ${text}`);
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
  ]) {
    const page = await renderRequest(root, path);
    assert.ok(page, path);
    assert.match(page.type, /^text\/html/);
    assert.equal(page.body, await readFile(join(out, file), "utf8"), path);
  }
  for (const path of ["/prompts/README.html", "/prompts/nope.html", "/prompts/../index.html", "/claude-kakehashi/", "/prompts/saas-lp.md"])
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
