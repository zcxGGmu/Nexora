import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { MemoryVaultError } from "./errors.js";

export type SafeVaultPath = {
  readonly absolute_path: string;
  readonly relative_path: string;
};

export function resolveVaultPath(root: string, path: string): SafeVaultPath {
  if (path.includes("\0") || path.split(/[\\/]+/).includes("..") || isAbsolute(path)) throw new MemoryVaultError("VAULT_PATH_INVALID", "Vault path must stay inside the vault");
  const normalized = normalize(path);
  if (normalized === "." || normalized.startsWith(`..${sep}`)) throw new MemoryVaultError("VAULT_PATH_INVALID", "Vault path must stay inside the vault");
  mkdirSync(root, { recursive: true });
  const rootReal = realpathSync(root);
  const absolutePath = resolve(rootReal, normalized);
  const rootRelativePath = relative(rootReal, absolutePath);
  if (rootRelativePath === "" || rootRelativePath.startsWith("..") || isAbsolute(rootRelativePath)) throw new MemoryVaultError("VAULT_PATH_INVALID", "Vault path must stay inside the vault");
  assertNoEscapingSymlink(rootReal, absolutePath);
  assertParentInsideRoot(rootReal, absolutePath);
  return { absolute_path: absolutePath, relative_path: normalized };
}

function assertNoEscapingSymlink(rootReal: string, absolutePath: string): void {
  if (!existsSync(absolutePath)) return;
  const stats = lstatSync(absolutePath);
  if (!stats.isSymbolicLink()) return;
  const target = realpathSync(absolutePath);
  const targetRelative = relative(rootReal, target);
  if (targetRelative.startsWith("..") || isAbsolute(targetRelative)) throw new MemoryVaultError("VAULT_PATH_INVALID", "Vault symlink escapes the workspace vault");
}

function assertParentInsideRoot(rootReal: string, absolutePath: string): void {
  let parent = dirname(absolutePath);
  while (!existsSync(parent) && parent !== dirname(parent)) parent = dirname(parent);
  const parentReal = realpathSync(parent);
  const parentRelative = relative(rootReal, parentReal);
  if (parentRelative.startsWith("..") || isAbsolute(parentRelative)) throw new MemoryVaultError("VAULT_PATH_INVALID", "Vault parent escapes the workspace vault");
}
