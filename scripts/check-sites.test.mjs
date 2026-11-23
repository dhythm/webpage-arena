import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
};
const page = "<!doctype html>\n<title>fixture</title>\n";
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

test("repository: all twelve sites pass check", async () => {
  const { sites, errors } = await checkSites(repo);
  assert.deepEqual(errors, []);
  assert.equal(sites.length, 12);
});

test('README: has the "LP の追加手順" section', async () => {
  const readme = await readFile(resolve(repo, "README.md"), "utf8");
  assert.match(readme, /^## LP の追加手順$/m);
  assert.match(readme, /\(CONTRIBUTING\.md\)/);
});
