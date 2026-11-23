import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readMeta, siteCoverage } from "./sites.mjs";
import { parseArgs, selectTargets, webpSize } from "./thumbs.mjs";
const repo = resolve(import.meta.dirname, "..");
const { sites } = await siteCoverage(repo);
const thumb = (site) => join(repo, site, "thumb.webp");
const knownIds = [
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
function assertOriginalSitesListed(listed) {
  for (const id of knownIds) assert.ok(listed.includes(id), id);
  assert.equal(listed.includes("tests"), false);
  assert.equal(listed.includes("prompts"), false);
}
async function writeFixtureSite(root, id) {
  const dir = join(root, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), "<!doctype html><title>fixture</title>");
  await writeFile(join(dir, "meta.json"), "{}");
}
function riff(chunk, payload) {
  const body = Buffer.concat([Buffer.from("WEBP"), Buffer.from(chunk), Buffer.alloc(4), payload]);
  body.writeUInt32LE(payload.length, 8);
  const head = Buffer.alloc(8);
  head.write("RIFF", 0);
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

test("repository: the original twelve site ids are listed and tests/prompts are not sites", () => {
  assertOriginalSitesListed(sites);
});

test("repository: a valid extra LP is listed alongside the original twelve", async () => {
  const root = await mkdtemp(join(tmpdir(), "thumb-plus-one-"));
  try {
    for (const id of knownIds) await writeFixtureSite(root, id);
    await writeFixtureSite(root, "grok-extra");
    await writeFixtureSite(root, "tests");
    await writeFixtureSite(root, "prompts");
    const coverage = await siteCoverage(root);
    assert.deepEqual(coverage.problems, []);
    assertOriginalSitesListed(coverage.sites);
    assert.ok(coverage.sites.includes("grok-extra"));
    assert.equal(coverage.sites.length, knownIds.length + 1);
    assert.equal(coverage.expected, knownIds.length + 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("thumbs: every site has thumb.webp", async () => {
  const missing = [];
  for (const site of sites)
    if (!(await stat(thumb(site)).catch(() => null))?.isFile()) missing.push(site);
  assert.deepEqual(missing, []);
});

test("thumbs: every thumb.webp has a RIFF/WEBP header", async () => {
  for (const site of sites) {
    const data = await readFile(thumb(site));
    assert.equal(data.toString("latin1", 0, 4), "RIFF", site);
    assert.equal(data.toString("latin1", 8, 12), "WEBP", site);
    assert.equal(data.readUInt32LE(4) + 8, data.length, site);
  }
});

test("thumbs: every thumb.webp is at most 800px wide and 640x400 as generated", async () => {
  for (const site of sites) {
    const size = webpSize(await readFile(thumb(site)));
    assert.ok(size.width <= 800, `${site} is ${size.width}px wide`);
    assert.deepEqual(size, { width: 640, height: 400 }, site);
  }
});

test("thumbs: every thumb.webp is at most 60KB", async () => {
  for (const site of sites) {
    const { size } = await stat(thumb(site));
    assert.ok(size <= 60 * 1024, `${site} is ${size} bytes`);
  }
});

test("thumbs: meta thumbnail points to an existing file", async () => {
  for (const site of sites) {
    const meta = await readMeta(repo, site);
    assert.equal(meta.thumbnail, "thumb.webp", site);
    assert.ok((await stat(join(repo, site, meta.thumbnail))).isFile(), site);
  }
});

test("webpSize: reads VP8, VP8L and VP8X headers", () => {
  const vp8 = Buffer.alloc(10);
  vp8.set([0x9d, 0x01, 0x2a], 3);
  vp8.writeUInt16LE(640, 6);
  vp8.writeUInt16LE(400, 8);
  assert.deepEqual(webpSize(riff("VP8 ", vp8)), { width: 640, height: 400 });
  const vp8l = Buffer.alloc(5);
  vp8l[0] = 0x2f;
  vp8l.writeUInt32LE((639 | (399 << 14)) >>> 0, 1);
  assert.deepEqual(webpSize(riff("VP8L", vp8l)), { width: 640, height: 400 });
  const vp8x = Buffer.alloc(10);
  vp8x.writeUIntLE(1279, 4, 3);
  vp8x.writeUIntLE(799, 7, 3);
  assert.deepEqual(webpSize(riff("VP8X", vp8x)), { width: 1280, height: 800 });
  assert.throws(() => webpSize(Buffer.from("not a webp file at all")));
});

test("selectTargets: by default only sites without thumb.webp are generated", () => {
  const all = ["a-one", "b-two", "c-three"];
  assert.deepEqual(selectTargets(all, new Set(["a-one", "c-three"]), parseArgs([])), ["b-two"]);
  assert.deepEqual(selectTargets(all, new Set(all), parseArgs([])), []);
});

test("selectTargets: ids or --all overwrite existing thumbs", () => {
  const all = ["a-one", "b-two", "c-three"];
  const existing = new Set(all);
  assert.deepEqual(selectTargets(all, existing, parseArgs(["c-three", "a-one"])), ["a-one", "c-three"]);
  assert.deepEqual(selectTargets(all, existing, parseArgs(["--all"])), all);
  assert.throws(() => selectTargets(all, existing, parseArgs(["nope"])), /unknown site: nope/);
});

test("parseArgs: reads ids, --all and --root", () => {
  assert.deepEqual(parseArgs(["--root", "tests/x", "a-one", "--all"]), {
    ids: ["a-one"],
    all: true,
    root: "tests/x",
  });
});

test("cli: a second run over existing thumbs generates 0 and leaves the file as is, without a browser", async () => {
  const site = resolve(repo, "tests/fixtures/thumb-existing/grok-sample/thumb.webp");
  const before = await readFile(site);
  const { mtimeMs } = await stat(site);
  const run = spawnSync(
    process.execPath,
    [resolve(repo, "scripts/thumbs.mjs"), "--root", "tests/fixtures/thumb-existing"],
    {
      cwd: repo,
      encoding: "utf8",
      timeout: 60000,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(repo, "tests/fixtures/thumb-existing/no-browsers") },
    },
  );
  const output = `${run.stdout}${run.stderr}`;
  assert.equal(run.status, 0, output);
  assert.match(output, /^Thumbs: generated 0, skipped 1 \(already have thumb\.webp\)$/m);
  assert.deepEqual(await readFile(site), before);
  assert.equal((await stat(site)).mtimeMs, mtimeMs);
});
