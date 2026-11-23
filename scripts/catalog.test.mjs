import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkSites } from "./check-sites.mjs";
const repo = resolve(import.meta.dirname, "..");
const fixture = (name) => resolve(repo, "tests/fixtures", name);
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
