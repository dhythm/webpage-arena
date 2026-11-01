import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
const dir = resolve(import.meta.dirname, "..", "qa", "screenshots");
for (const file of await readdir(dir))
  if (file.endsWith(".png")) {
    execFileSync("cwebp", [
      "-quiet",
      "-q",
      "90",
      join(dir, file),
      "-o",
      join(dir, file.replace(/\.png$/, ".webp")),
    ]);
    console.log(file.replace(/\.png$/, ".webp"));
  }
