import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(join(fileURLToPath(import.meta.url), "../.."));
const sourceRoots = ["apps", "packages", "scripts", "tests"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const forbidden = [
  { pattern: /\bas any\b/g, label: "as any" },
  { pattern: /@ts-ignore/g, label: "@ts-ignore" },
  { pattern: /@ts-expect-error/g, label: "@ts-expect-error" },
];

const checkedFiles = [];
const findings = [];
for (const sourceRoot of sourceRoots) {
  scan(join(root, sourceRoot));
}

if (findings.length > 0) {
  for (const finding of findings) process.stderr.write(`${finding}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`lint: ${countFiles()} source files checked\n`);
}

function scan(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "coverage") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(path);
      continue;
    }
    const extension = path.slice(path.lastIndexOf("."));
    if (!extensions.has(extension)) continue;
    checkedFiles.push(path);
    const content = readFileSync(path, "utf8");
    if (relative(root, path) === "scripts/lint.mjs") continue;
    for (const rule of forbidden) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(content)) findings.push(`${relative(root, path)}: forbidden ${rule.label}`);
    }
  }
}

function countFiles() {
  return checkedFiles.length;
}
