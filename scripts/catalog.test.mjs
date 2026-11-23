import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { join, resolve } from "node:path";
import { checkSites } from "./check-sites.mjs";
import { readMeta, siteCoverage } from "./sites.mjs";
import {
  buildDist,
  loadCatalog,
  renderIndex,
  renderRequest,
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
async function hub(root) {
  return renderIndex(await loadCatalog(root), await template());
}
async function sevenRow(t) {
  const root = await tempCopy(t, "catalog-basic");
  const meta = JSON.parse(await readFile(join(root, "grok-lamp", "meta.json"), "utf8"));
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const id = `lamp-${n}`;
    await cp(join(root, "grok-lamp"), join(root, id), { recursive: true });
    await writeFile(join(root, id, "meta.json"), JSON.stringify({ ...meta, id, title: `灯り ${n}` }));
  }
  return root;
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
  assert.match(groups.find((g) => g.key === "prompts/saas-lp.md").html, /<h2[^>]*>[^<]*SaaS（saas-lp）— フィクスチャ/);
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

test("filters: the form is hidden until JS runs and the no-match message exists but starts hidden", async () => {
  const html = await hub(fixture("catalog-basic"));
  assert.match(html, /<form\b[^>]*\bdata-filters\b[^>]*\bhidden\b/);
  assert.match(html, /<p\b[^>]*\bdata-empty\b[^>]*\bhidden\b[^>]*>[^<]*条件に合う作品はありません/);
  for (const card of cardsOf(html)) assert.doesNotMatch(card.match(/<li[^>]*>/)[0], /\bhidden\b/);
});

test("prompt: プロンプト未収録 appears only in the group note; only cards with a prompt link to prompts/<name>.html", async () => {
  const root = fixture("catalog-basic");
  const list = await metas(root);
  const html = await hub(root);
  const cards = cardsOf(html);
  for (const meta of list) {
    const card = cards.find((c) => c.includes(`data-id="${meta.id}"`));
    assert.ok(card, meta.id);
    assert.doesNotMatch(card, /プロンプト未収録/, meta.id);
    if (meta.promptPath === null) {
      assert.doesNotMatch(card, /href="prompts\//, meta.id);
      assert.doesNotMatch(card, /プロンプトを読む/, meta.id);
    } else {
      const name = meta.promptPath.slice("prompts/".length, -".md".length);
      assert.match(card, new RegExp(`<a href="prompts/${name}\\.html">プロンプトを読む</a>`), meta.id);
    }
  }
  for (const group of groupsOf(html)) {
    const heading = group.html.match(/<h2\b[^>]*>([^<]*)<\/h2>/)[1];
    const note = group.html.match(/<p class="group-note">([\s\S]*?)<\/p>/)[1];
    assert.doesNotMatch(heading, /プロンプト未収録/, group.key);
    if (group.key.startsWith("type:")) assert.match(note, /プロンプト未収録/, group.key);
    else assert.doesNotMatch(note, /プロンプト未収録/, group.key);
    assert.equal((group.html.match(/プロンプト未収録/g) ?? []).length, group.key.startsWith("type:") ? 1 : 0, group.key);
  }
});

test("cards: lazy 640x400 thumb, title, tagline, type, model, tool, created and the count of other works in the same row", async () => {
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
    assert.ok(card.includes(`<dt>モデル</dt><dd>${esc(shown(meta.model))}</dd>`), `${meta.id} model`);
    assert.ok(card.includes(`<dt>ツール</dt><dd>${esc(shown(meta.tool))}</dd>`), `${meta.id} tool`);
    const facts = card.match(/<dl\b[\s\S]*?<\/dl>/)[0];
    assert.doesNotMatch(facts, /<dd>unknown<\/dd>/, meta.id);
    const label = types.find((t) => t.id === meta.type).label;
    const others = sizes.get(groupKey(meta)) - 1;
    if (meta.promptPath === null) {
      assert.ok(card.includes(`<dt>種別</dt><dd>${esc(label)}</dd>`), `${meta.id} 種別`);
      assert.doesNotMatch(card, /<dt>お題<\/dt>/, meta.id);
      assert.ok(card.includes(`同じ種別のほかの作品 ${others} 件`), meta.id);
      assert.doesNotMatch(card, /同じお題/, meta.id);
    } else {
      assert.ok(card.includes(`<dt>お題</dt><dd>${esc(label)}</dd>`), `${meta.id} お題`);
      assert.ok(card.includes(`同じお題のほかの作品 ${others} 件`), meta.id);
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
});

test("lead and counts: the intro covers prompt rows and type rows, and the filter count starts empty", async () => {
  for (const root of [fixture("catalog-basic"), repo]) {
    const list = await metas(root);
    const html = await hub(root);
    assert.match(html, /<p class="lead">[\s\S]*お題ごとに1行に並べます。プロンプトが残っていない作品は種別ごとにまとめています。[\s\S]*?<\/p>/);
    const groups = new Set(list.map(groupKey)).size;
    const models = new Set(list.map((m) => m.model)).size;
    assert.ok(html.includes(`<p class="total">${list.length} 作品・${models} モデル・${groups} グループ</p>`), root);
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

test("browser: a row of 7+ cards at 1280px shows about 6.5 cards, snaps to cards, scrolls with the keyboard and counts filtered works", async (t) => {
  const root = await sevenRow(t);
  const out = await mkdtemp(join(tmpdir(), "catalog-seven-"));
  t.after(() => rm(out, { recursive: true, force: true }));
  await buildDist(root, out);
  const list = await metas(root);
  const row = groupsOf(await readFile(join(out, "index.html"), "utf8")).find((g) => g.key === "type:product-lp");
  assert.ok(row.ids.length >= 7, row.ids.join(", "));
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(pathToFileURL(join(out, "index.html")).href);
  const ul = page.locator('[data-group="type:product-lp"] ul.row');
  const box = await ul.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cards = [...el.querySelectorAll("[data-card]")].map((c) => c.getBoundingClientRect());
    return {
      left: r.left,
      right: r.right,
      width: el.clientWidth,
      scroll: el.scrollWidth,
      snap: getComputedStyle(el).scrollSnapType,
      align: getComputedStyle(el.querySelector("[data-card]")).scrollSnapAlign,
      cards: cards.map((c) => ({ left: c.left, right: c.right, width: c.width })),
    };
  });
  assert.ok(box.scroll > box.width, `row overflows: ${box.scroll} > ${box.width}`);
  const full = box.cards.filter((c) => c.right <= box.right + 0.5).length;
  const peek = box.cards.find((c) => c.left < box.right && c.right > box.right + 0.5);
  assert.equal(full, 6, JSON.stringify(box.cards));
  assert.ok(peek, "the 7th card peeks past the right edge");
  const visible = (box.right - peek.left) / peek.width;
  assert.ok(visible > 0.25 && visible < 0.75, `7th card shows ${visible.toFixed(2)} of its width`);
  assert.match(box.snap, /x mandatory/);
  assert.equal(box.align, "start");
  await ul.focus();
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "商品LPの作品、横にスクロール");
  assert.notEqual(await ul.evaluate((el) => getComputedStyle(el).outlineStyle), "none");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction((el) => el.scrollLeft > 0, await ul.elementHandle(), { timeout: 3000 });
  await ul.evaluate((el) => el.scrollTo({ left: 37, behavior: "instant" }));
  await page.waitForTimeout(500);
  const stop = await ul.evaluate((el) => {
    const start = el.getBoundingClientRect().left;
    return [...el.querySelectorAll("[data-card]")].map((c) => Math.round(c.getBoundingClientRect().left - start));
  });
  assert.ok(stop.some((x) => Math.abs(x) <= 1), `a card edge sits at the row start after scrolling: ${stop}`);
  const count = page.locator("[data-count]");
  assert.equal((await count.innerText()).trim(), "");
  const want = list.filter((m) => m.type === "product-lp").length;
  await page.selectOption("select[name=type]", "product-lp");
  assert.equal((await count.innerText()).trim(), `${list.length} 作品中 ${want} 作品を表示`);
  await page.click("button[type=reset]");
  await page.waitForFunction(() => document.querySelector("[data-count]").textContent === "");
  await page.setViewportSize({ width: 375, height: 812 });
  const phone = await ul.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [...el.querySelectorAll("[data-card]")].map((c) => c.getBoundingClientRect()).filter((c) => c.left < r.right && c.right > r.right).length;
  });
  assert.equal(phone, 1, "at 375px the next card peeks too");
});
