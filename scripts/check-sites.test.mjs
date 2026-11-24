import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkSites } from "./check-sites.mjs";
const repo = resolve(import.meta.dirname, "..");
const fixture = (name) => resolve(repo, "tests/fixtures", name);
function assertError(errors, site, pattern) {
  assert.ok(
    errors.some((error) => error.startsWith(`${site}: `) && pattern.test(error)),
    `expected "${site}: ${pattern}" in:\n${errors.join("\n") || "(no errors)"}`,
  );
}
const baseMeta = {
  id: "grok-sample",
  title: "Fixture",
  tagline: "検査用の作品。",
  type: "product-lp",
  model: "Grok",
  tool: "Cursor",
  promptPath: null,
  promptNotes: "検査用",
  created: "2026-11-24",
  thumbnail: null,
  legacy: false,
  externalOrigins: [],
  making: "unknown",
};
const page = "<!doctype html>\n<title>fixture</title>\n";
const legacySites = [
  "claude-corporate",
  "claude-lp",
  "devin-meguru",
  "devin-tsumugiya",
  "gemini-corporate",
  "gemini-lp",
  "gpt-nagi",
  "gpt-umi",
  "grok-corporate",
  "grok-lp",
  "muse-arcline-hp",
  "muse-halo-lp",
];
function assertIncludesLegacy(sites) {
  for (const site of legacySites)
    assert.ok(sites.includes(site), `${site} not in: ${sites.join(", ")}`);
}
async function makeRoot(t, files) {
  const root = await mkdtemp(join(tmpdir(), "check-sites-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(
      join(root, path),
      typeof content === "string" || Buffer.isBuffer(content)
        ? content
        : JSON.stringify(content),
    );
  }
  return root;
}
async function checkSample(t, meta, extra = {}) {
  const root = await makeRoot(t, {
    "grok-sample/index.html": page,
    "grok-sample/meta.json": { ...baseMeta, ...meta },
    ...extra,
  });
  return (await checkSites(root, { tracked: [] })).errors;
}

test("meta-ok: a valid new site passes", async () => {
  const { sites, errors } = await checkSites(fixture("meta-ok"), {
    tracked: [],
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(sites, ["grok-sample"]);
});

test("meta-missing: a folder with index.html but no meta.json fails", async () => {
  const { errors } = await checkSites(fixture("meta-missing"), { tracked: [] });
  assertError(errors, "grok-orphan", /index\.html without meta\.json/);
});

test("meta-unknown-type: a type that is not in site-types.json fails", async () => {
  const { errors } = await checkSites(fixture("meta-unknown-type"), {
    tracked: [],
  });
  assertError(errors, "grok-sample", /type "blog" is not in site-types\.json/);
});

test("meta-grok-prefix: model Grok with an id not starting with grok- fails", async () => {
  const { errors } = await checkSites(fixture("meta-grok-prefix"), {
    tracked: [],
  });
  assertError(errors, "claude-sample", /id must start with "grok-"/);
});

test("meta-api-host: an AI API host in site code fails", async () => {
  const { errors } = await checkSites(fixture("meta-api-host"), {
    tracked: [],
  });
  assertError(errors, "grok-sample", /main\.js.*api\.openai\.com/);
});

test("meta-external-origins: legacy false with external origins fails", async () => {
  const { errors } = await checkSites(fixture("meta-external-origins"), {
    tracked: [],
  });
  assertError(errors, "grok-sample", /externalOrigins must be empty/);
});

test("meta-no-index: a folder with meta.json but no index.html fails", async () => {
  const { errors } = await checkSites(fixture("meta-no-index"), {
    tracked: [],
  });
  assertError(errors, "grok-sample", /meta\.json without index\.html/);
});

test("schema: a missing required field fails", async (t) => {
  const meta = { ...baseMeta };
  delete meta.tagline;
  const root = await makeRoot(t, {
    "grok-sample/index.html": page,
    "grok-sample/meta.json": meta,
  });
  const { errors } = await checkSites(root, { tracked: [] });
  assertError(errors, "grok-sample", /missing required field "tagline"/);
});

test("schema: an unknown field fails", async (t) => {
  assertError(
    await checkSample(t, { externalOrigin: [] }),
    "grok-sample",
    /unknown field "externalOrigin"/,
  );
});

test("schema: wrong field types fail", async (t) => {
  const errors = await checkSample(t, {
    legacy: "no",
    title: "",
    externalOrigins: "none",
    thumbWait: 3,
  });
  assertError(errors, "grok-sample", /legacy must be a boolean/);
  assertError(errors, "grok-sample", /title must be a non-empty string/);
  assertError(errors, "grok-sample", /externalOrigins must be an array of origins/);
  assertError(errors, "grok-sample", /thumbWait must be a non-empty string/);
});

test("schema: optional modelVersion and thumbWait are accepted", async (t) => {
  assert.deepEqual(
    await checkSample(t, { modelVersion: "grok-4", thumbWait: ".hero img" }),
    [],
  );
});

test("id: an id different from the folder name fails", async (t) => {
  assertError(
    await checkSample(t, { id: "grok-other" }),
    "grok-sample",
    /id "grok-other" must equal the folder name/,
  );
});

test("id: the id must start with the lowercase model name", async (t) => {
  assertError(
    await checkSample(t, { model: "Claude" }),
    "grok-sample",
    /id must start with "claude-"/,
  );
});

test("model: DeepSeek, GLM and Claude Code (folder claude-code-…) pass in the catalog-new-models fixture", async () => {
  const { sites, errors } = await checkSites(fixture("catalog-new-models"), { tracked: [] });
  assert.deepEqual(errors, []);
  assert.deepEqual(sites, ["claude-code-lamp", "deepseek-lamp", "glm-lamp"]);
});

test("model: the prefix lowercases the value and turns each run of non-alphanumerics into one hyphen", async (t) => {
  const sample = (folder, model) =>
    makeRoot(t, {
      [`${folder}/index.html`]: page,
      [`${folder}/meta.json`]: { ...baseMeta, id: folder, model },
    }).then(async (root) => (await checkSites(root, { tracked: [] })).errors);
  assert.deepEqual(await sample("claude-code-lamp", "Claude Code"), []);
  assert.deepEqual(await sample("gpt-5-1-lamp", "GPT-5.1"), []);
  assert.deepEqual(await sample("deepseek-lamp", "DeepSeek"), []);
  assert.deepEqual(await sample("glm-lamp", "GLM"), []);
  assert.deepEqual(await sample("cursor-lamp", "  Cursor!  "), []);
  assertError(await sample("claude-lamp", "Claude Code"), "claude-lamp", /id must start with "claude-code-"/);
  assertError(await sample("gpt-lamp", "GPT-5.1"), "gpt-lamp", /id must start with "gpt-5-1-"/);
});

test("model: a value with no letters or digits (Japanese only) skips the prefix check but stays required and non-empty", async (t) => {
  assert.deepEqual(await checkSample(t, { model: "社内チーム" }), []);
  assertError(await checkSample(t, { model: "" }), "grok-sample", /model must be a non-empty string/);
  assertError(await checkSample(t, { model: "   " }), "grok-sample", /model must be a non-empty string/);
});

test("created: a date that is not YYYY-MM-DD fails", async (t) => {
  assertError(
    await checkSample(t, { created: "2026/11/24" }),
    "grok-sample",
    /created must be YYYY-MM-DD/,
  );
  assertError(
    await checkSample(t, { created: "2026-02-30" }),
    "grok-sample",
    /created must be YYYY-MM-DD/,
  );
});

test("promptPath: a missing prompts/*.md file fails and an existing one passes", async (t) => {
  assertError(
    await checkSample(t, { promptPath: "prompts/nope.md" }),
    "grok-sample",
    /promptPath "prompts\/nope\.md" does not exist/,
  );
  assertError(
    await checkSample(t, { promptPath: "grok-sample/index.html" }),
    "grok-sample",
    /promptPath must be null or prompts\/<name>\.md/,
  );
  assert.deepEqual(
    await checkSample(
      t,
      { promptPath: "prompts/lp.md" },
      { "prompts/lp.md": "# lp\n" },
    ),
    [],
  );
});

test("thumbnail: a missing file or a path outside the folder fails", async (t) => {
  assertError(
    await checkSample(t, { thumbnail: "thumb.webp" }),
    "grok-sample",
    /thumbnail "thumb\.webp" does not exist in the folder/,
  );
  assertError(
    await checkSample(
      t,
      { thumbnail: "../outside.webp" },
      { "outside.webp": "x" },
    ),
    "grok-sample",
    /thumbnail "\.\.\/outside\.webp" does not exist in the folder/,
  );
  assert.deepEqual(
    await checkSample(
      t,
      { thumbnail: "thumb.webp" },
      { "grok-sample/thumb.webp": "x" },
    ),
    [],
  );
});

test("size: a new site over 2MB fails and a legacy one does not", async (t) => {
  const big = { "grok-sample/big.bin": Buffer.alloc(2 * 1024 * 1024 + 1) };
  assertError(
    await checkSample(t, {}, big),
    "grok-sample",
    /folder is \d+ bytes, over the 2MB limit/,
  );
  assert.deepEqual(await checkSample(t, { legacy: true }, big), []);
});

test("code scan: key-like strings and external form actions fail, mask-image does not", async (t) => {
  const key = ["sk", "-", "a".repeat(24)].join("");
  const xai = ["xai", "-", "b".repeat(24)].join("");
  const errors = await checkSample(
    t,
    { legacy: true },
    {
      "grok-sample/a.js": `const k = "${key}";\n`,
      "grok-sample/b.css": `/* ${xai} */\n.x { mask-image: none; -webkit-mask-image: none; }\n`,
      "grok-sample/c.html": '<form action="https://example.com/send"></form>\n',
      "grok-sample/d.js": 'fetch("https://generativelanguage.googleapis.com/v1");\n',
    },
  );
  assertError(errors, "grok-sample", /a\.js.*key-like string/);
  assertError(errors, "grok-sample", /b\.css.*key-like string/);
  assertError(errors, "grok-sample", /c\.html.*<form action="http/);
  assertError(errors, "grok-sample", /d\.js.*generativelanguage\.googleapis\.com/);
  assert.equal(errors.length, 4, errors.join("\n"));
});

test("git: tracked dist/ or sites.json fails", async () => {
  const { errors } = await checkSites(fixture("meta-ok"), {
    tracked: ["dist/index.html", "sites.json"],
  });
  assert.ok(errors.includes("dist/index.html: generated file is tracked by Git"));
  assert.ok(errors.includes("sites.json: generated file is tracked by Git"));
});

test("repository: all sites pass check and the twelve legacy sites are listed", async () => {
  const { sites, errors } = await checkSites(repo);
  assert.deepEqual(errors, []);
  assertIncludesLegacy(sites);
});

test("repository: adding one valid new LP to the legacy sites still passes check", async (t) => {
  const files = {
    "prompts/saas-lp.md": await readFile(resolve(repo, "prompts/saas-lp.md"), "utf8"),
    "tests/fixtures/.keep": "",
    "claude-zzsample/meta.json": {
      ...baseMeta,
      id: "claude-zzsample",
      type: "saas-lp",
      model: "Claude",
      tool: "Claude Code",
      promptPath: "prompts/saas-lp.md",
    },
    "claude-zzsample/index.html": ["problem", "product", "features", "pricing", "faq", "demo"]
      .map((id) => `<section id="${id}"></section>`)
      .join("\n"),
  };
  const root = await makeRoot(t, files);
  for (const site of legacySites) {
    await mkdir(join(root, site));
    const meta = JSON.parse(await readFile(join(repo, site, "meta.json"), "utf8"));
    const files = ["meta.json", "index.html"];
    if (typeof meta.thumbnail === "string") files.push(meta.thumbnail);
    for (const file of files)
      await cp(join(repo, site, file), join(root, site, file));
  }
  const { sites, errors } = await checkSites(root, { tracked: [] });
  assert.deepEqual(errors, []);
  assertIncludesLegacy(sites);
  assert.ok(sites.includes("claude-zzsample"), sites.join(", "));
  assert.ok(!sites.includes("prompts") && !sites.includes("tests"), sites.join(", "));
});

const saasPrompt = { "prompts/saas-lp.md": "---\ntype: saas-lp\n---\n\n# SaaS（saas-lp）\n" };
const recordOf = (steps, first = "1. [お題「SaaS」](../prompts/saas-lp.html)を渡した。\n   - 変わったこと：LP を作った。") =>
  [
    "# 作り方：Fixture（grok-sample）",
    "<!-- 根拠：fixture -->",
    first,
    ...Array.from({ length: steps - 1 }, (_, i) => `${i + 2}. 修正 ${i + 1} を頼んだ。\n   - 変わったこと：直った。`),
    "",
  ].join("\n");
async function checkMaking(t, meta, record) {
  const extra = { ...saasPrompt };
  if (record !== undefined) extra["grok-sample/making.md"] = record;
  return checkSample(t, { promptPath: "prompts/saas-lp.md", ...meta }, extra);
}

test("making: oneshot with exactly one step and refined with two or more steps pass", async (t) => {
  assert.deepEqual(await checkMaking(t, { making: "oneshot" }, recordOf(1)), []);
  assert.deepEqual(await checkMaking(t, { making: "refined" }, recordOf(2)), []);
  assert.deepEqual(await checkMaking(t, { making: "refined" }, recordOf(4)), []);
  assert.deepEqual(await checkMaking(t, { making: "unknown" }), []);
  assert.deepEqual(await checkMaking(t, { legacy: true, making: undefined }), []);
});

test("making: oneshot with two steps fails", async (t) => {
  assertError(await checkMaking(t, { making: "oneshot" }, recordOf(2)), "grok-sample", /making "oneshot" needs exactly 1 step in making\.md, found 2/);
});

test("making: refined with one step fails", async (t) => {
  assertError(await checkMaking(t, { making: "refined" }, recordOf(1)), "grok-sample", /making "refined" needs 2 or more steps in making\.md, found 1/);
});

test("making: oneshot or refined without making.md fails", async (t) => {
  assertError(await checkMaking(t, { making: "oneshot" }), "grok-sample", /making "oneshot" needs making\.md/);
  assertError(await checkMaking(t, { making: "refined" }), "grok-sample", /making "refined" needs making\.md/);
});

test("making: making.md with making unknown or no making key fails", async (t) => {
  assertError(await checkMaking(t, { making: "unknown" }, recordOf(2)), "grok-sample", /making\.md exists but making is "unknown"/);
  assertError(await checkMaking(t, { legacy: true, making: undefined }, recordOf(2)), "grok-sample", /making\.md exists but making is "unknown"/);
});

test("making: promptPath null allows only unknown", async (t) => {
  const errors = await checkSample(t, { making: "oneshot" }, { "grok-sample/making.md": recordOf(1) });
  assertError(errors, "grok-sample", /promptPath null allows only making "unknown"/);
  assertError(await checkSample(t, { making: "refined" }), "grok-sample", /promptPath null allows only making "unknown"/);
  assert.deepEqual(await checkSample(t, { making: "unknown" }), []);
});

test("making: the first step must link to the prompt page of promptPath", async (t) => {
  assertError(
    await checkMaking(t, { making: "refined" }, recordOf(2, "1. お題を渡した。\n   - 変わったこと：LP を作った。")),
    "grok-sample",
    /first step of making\.md must link to \.\.\/prompts\/saas-lp\.html/,
  );
  assertError(
    await checkMaking(t, { making: "oneshot" }, recordOf(1, "1. [お題「飲食」](../prompts/restaurant.html)を渡した。")),
    "grok-sample",
    /first step of making\.md must link to \.\.\/prompts\/saas-lp\.html/,
  );
  assertError(
    await checkMaking(t, { making: "refined" }, recordOf(2, "1. LP を作った。").replace("2. 修正 1", "2. [お題「SaaS」](../prompts/saas-lp.html) と修正 1")),
    "grok-sample",
    /first step of making\.md must link to/,
  );
});

test("making: legacy false requires the making key and the value must be oneshot, refined or unknown", async (t) => {
  assertError(await checkMaking(t, { making: undefined }), "grok-sample", /missing required field "making" \(legacy: false\)/);
  assertError(await checkMaking(t, { making: "twice" }), "grok-sample", /making must be "oneshot", "refined" or "unknown"/);
  assertError(await checkMaking(t, { legacy: true, making: 2 }), "grok-sample", /making must be "oneshot", "refined" or "unknown"/);
});

test("making: HTML comments and indented lines are not steps", async (t) => {
  const record = recordOf(1) + "<!--\n2. これはコメントの中\n-->\n   3. 字下げした行\n";
  assert.deepEqual(await checkMaking(t, { making: "oneshot" }, record), []);
});

const madeWorks = {
  "claude-kakehashi": ["saas-lp", 2],
  "claude-aodoki": ["restaurant", 2],
  "claude-nomamichi": ["app-lp", 1],
  "claude-minato-fes": ["event", 1],
  "claude-kishine": ["inn", 1],
};

test("repository: the five new works are refined with making.md and the right step counts, and the twelve legacy works have no making key and no making.md", async () => {
  const { stepsOf } = await import("./sites.mjs");
  for (const [site, [type, extra]] of Object.entries(madeWorks)) {
    const meta = JSON.parse(await readFile(resolve(repo, site, "meta.json"), "utf8"));
    assert.equal(meta.making, "refined", site);
    assert.equal(meta.promptPath, `prompts/${type}.md`, site);
    const steps = stepsOf(await readFile(resolve(repo, site, "making.md"), "utf8"));
    assert.equal(steps.length - 1, extra, site);
    assert.match(steps[0], new RegExp(`\\]\\(\\.\\./prompts/${type}\\.html\\)`), site);
  }
  for (const site of legacySites) {
    const meta = JSON.parse(await readFile(resolve(repo, site, "meta.json"), "utf8"));
    assert.ok(!("making" in meta), site);
    await assert.rejects(readFile(resolve(repo, site, "making.md")), site);
  }
});

test('README: has the "LP の追加手順" section', async () => {
  const readme = await readFile(resolve(repo, "README.md"), "utf8");
  assert.match(readme, /^## LP の追加手順$/m);
  assert.match(readme, /\(CONTRIBUTING\.md\)/);
});

test("docs: CONTRIBUTING, prompts/README and AGENTS describe 作り方の残し方, and the CONTRIBUTING example is a valid two-step record", async () => {
  const { stepsOf } = await import("./sites.mjs");
  const contributing = await readFile(resolve(repo, "CONTRIBUTING.md"), "utf8");
  assert.match(contributing, /^## 作り方の残し方$/m);
  for (const word of ["原文は貼りません", "1〜2 行", "誤字は直します。意味は変えません", "お題「○○」を渡した", "追加指示", "npm run check"])
    assert.ok(contributing.includes(word), word);
  const example = contributing.match(/^## 作り方の残し方$[\s\S]*?```md\n([\s\S]*?)\n```/m);
  assert.ok(example, "md example under 作り方の残し方");
  const steps = stepsOf(example[1]);
  assert.equal(steps.length, 2);
  assert.ok(steps[0].includes("](../prompts/saas-lp.html)"));
  const readme = await readFile(resolve(repo, "prompts/README.md"), "utf8");
  assert.match(readme, /^## 作り方の残し方$/m);
  assert.ok(readme.includes("CONTRIBUTING.md#作り方の残し方"));
  const agents = await readFile(resolve(repo, "AGENTS.md"), "utf8");
  assert.ok(agents.includes("CONTRIBUTING.md#作り方の残し方"));
  assert.ok(agents.includes("原文は貼らない"));
});
