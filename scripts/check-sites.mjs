import { spawnSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { readMeta, siteCoverage, stepsOf } from "./sites.mjs";
const repo = resolve(import.meta.dirname, "..");
const required = [
  "id",
  "title",
  "tagline",
  "type",
  "model",
  "tool",
  "promptPath",
  "promptNotes",
  "created",
  "thumbnail",
  "legacy",
  "externalOrigins",
];
const optional = ["modelVersion", "thumbWait", "making"];
const makings = ["oneshot", "refined", "unknown"];
const nonEmpty = ["id", "title", "tagline", "type", "model", "tool"];
const sizeLimit = 2 * 1024 * 1024;
const codeExtensions = new Set([".html", ".htm", ".js", ".mjs", ".css"]);
const apiHosts = [
  "api.anthropic.com",
  "api.openai.com",
  "api.x.ai",
  "generativelanguage.googleapis.com",
  "api.mistral.ai",
  "api.groq.com",
  "api.deepseek.com",
  "openrouter.ai",
];
const forbidden = [
  ...apiHosts.map((host) => ({
    label: `AI API host ${host}`,
    pattern: new RegExp(host.replaceAll(".", "\\."), "i"),
  })),
  {
    label: "key-like string",
    pattern: /(?<![A-Za-z0-9_-])(?:sk|xai)-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{35}/,
  },
  {
    label: '<form action="http',
    pattern: /<form\b[^>]*\baction\s*=\s*["']?\s*https?:/i,
  },
];
const isString = (value) => typeof value === "string";
async function files(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await files(path)));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}
async function exists(path) {
  return (await stat(path).catch(() => null))?.isFile() ?? false;
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
function validOrigin(value) {
  if (!isString(value)) return false;
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}
export function gitTracked(root) {
  const run = spawnSync("git", ["ls-files", "--", "dist", "sites.json"], {
    cwd: root,
    encoding: "utf8",
  });
  if (run.status !== 0)
    throw new Error(`git ls-files failed in ${root}: ${run.stderr.trim()}`);
  return run.stdout.split("\n").filter(Boolean);
}
async function checkMeta(root, site, meta, types) {
  const errors = [];
  if (meta === null || typeof meta !== "object" || Array.isArray(meta))
    return ["meta.json must be a JSON object"];
  for (const key of required)
    if (!(key in meta)) errors.push(`missing required field "${key}"`);
  for (const key of Object.keys(meta))
    if (!required.includes(key) && !optional.includes(key))
      errors.push(`unknown field "${key}"`);
  for (const key of nonEmpty)
    if (key in meta && !(isString(meta[key]) && meta[key].trim()))
      errors.push(`${key} must be a non-empty string`);
  for (const key of optional)
    if (key !== "making" && key in meta && !(isString(meta[key]) && meta[key].trim()))
      errors.push(`${key} must be a non-empty string`);
  if ("promptNotes" in meta && !isString(meta.promptNotes))
    errors.push("promptNotes must be a string");
  if ("legacy" in meta && typeof meta.legacy !== "boolean")
    errors.push("legacy must be a boolean");
  if (
    "externalOrigins" in meta &&
    !(Array.isArray(meta.externalOrigins) && meta.externalOrigins.every(validOrigin))
  )
    errors.push("externalOrigins must be an array of origins");
  if (isString(meta.id) && meta.id !== site)
    errors.push(`id "${meta.id}" must equal the folder name`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(site))
    errors.push("folder name must be <model>-<slug> in lowercase");
  if (isString(meta.type) && !types.has(meta.type))
    errors.push(`type "${meta.type}" is not in site-types.json`);
  if (isString(meta.model) && meta.model.trim()) {
    const slug = meta.model.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const prefix = `${slug}-`;
    if (slug && !site.startsWith(prefix)) errors.push(`id must start with "${prefix}"`);
  }
  if ("created" in meta && !(isString(meta.created) && validDate(meta.created)))
    errors.push("created must be YYYY-MM-DD");
  if ("promptPath" in meta && meta.promptPath !== null) {
    if (!isString(meta.promptPath) || !/^(?:prompts|briefs)\/[A-Za-z0-9_-]+\.md$/.test(meta.promptPath))
      errors.push("promptPath must be null, prompts/<name>.md or briefs/<name>.md");
    else if (!(await exists(join(root, meta.promptPath))))
      errors.push(`promptPath "${meta.promptPath}" does not exist`);
  }
  if ("thumbnail" in meta && meta.thumbnail !== null) {
    const folder = resolve(root, site);
    const path = isString(meta.thumbnail) ? resolve(folder, meta.thumbnail) : "";
    if (!path.startsWith(folder + sep) || !(await exists(path)))
      errors.push(`thumbnail "${meta.thumbnail}" does not exist in the folder`);
  }
  if (meta.legacy === false && Array.isArray(meta.externalOrigins) && meta.externalOrigins.length)
    errors.push("externalOrigins must be empty for a new site (legacy: false)");
  return [...errors, ...(await checkMaking(root, site, meta))];
}
async function checkMaking(root, site, meta) {
  const errors = [];
  if (meta.legacy === false && !("making" in meta)) errors.push('missing required field "making" (legacy: false)');
  if ("making" in meta && !makings.includes(meta.making))
    return [...errors, 'making must be "oneshot", "refined" or "unknown"'];
  const making = meta.making ?? "unknown";
  const record = await readFile(join(root, site, "making.md"), "utf8").catch(() => null);
  if (meta.promptPath === null && making !== "unknown") errors.push('promptPath null allows only making "unknown"');
  if (record === null) {
    if (making !== "unknown") errors.push(`making "${making}" needs making.md`);
    return errors;
  }
  if (making === "unknown") return [...errors, 'making.md exists but making is "unknown"'];
  const steps = stepsOf(record);
  if (making === "oneshot" && steps.length !== 1)
    errors.push(`making "oneshot" needs exactly 1 step in making.md, found ${steps.length}`);
  if (making === "refined" && steps.length < 2)
    errors.push(`making "refined" needs 2 or more steps in making.md, found ${steps.length}`);
  if (isString(meta.promptPath)) {
    const [dir, file] = meta.promptPath.split("/");
    const href = `../${dir}/${file.slice(0, -".md".length)}.html`;
    if (!steps[0]?.includes(`](${href})`)) errors.push(`first step of making.md must link to ${href}`);
  }
  return errors;
}
export async function checkSites(root, options = {}) {
  const types = new Set(
    JSON.parse(
      await readFile(options.typesPath ?? join(repo, "site-types.json"), "utf8"),
    ).map((type) => type.id),
  );
  const coverage = await siteCoverage(root);
  const errors = [...coverage.problems];
  for (const site of coverage.sites) {
    const report = (message) => errors.push(`${site}: ${message}`);
    let meta;
    try {
      meta = await readMeta(root, site);
    } catch (error) {
      report(`meta.json is not valid JSON (${error.message})`);
    }
    if (meta !== undefined)
      for (const message of await checkMeta(root, site, meta, types)) report(message);
    let size = 0;
    for (const path of await files(join(root, site))) {
      size += (await stat(path)).size;
      if (!codeExtensions.has(extname(path).toLowerCase())) continue;
      const text = await readFile(path, "utf8");
      const relative = path.slice(join(root, site).length + 1).split(sep).join("/");
      for (const { label, pattern } of forbidden)
        if (pattern.test(text)) report(`${relative} contains ${label}`);
    }
    if (meta?.legacy === false && size > sizeLimit)
      report(`folder is ${size} bytes, over the 2MB limit`);
  }
  for (const path of options.tracked ?? gitTracked(root))
    errors.push(`${path}: generated file is tracked by Git`);
  return { sites: coverage.sites, errors };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { sites, errors } = await checkSites(repo);
  for (const error of errors) console.log(`FAIL ${error}`);
  console.log(`Checked ${sites.length} sites: ${errors.length} problems`);
  process.exit(errors.length === 0 ? 0 : 1);
}
