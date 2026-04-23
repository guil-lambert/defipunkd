import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Snapshot } from "@defibeat/registry";

export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not find repo root (no pnpm-workspace.yaml) starting from ${start}`);
}

export function loadSnapshot(repoRoot: string): Snapshot {
  const path = join(repoRoot, "data", "defillama-snapshot.json");
  return JSON.parse(readFileSync(path, "utf8")) as Snapshot;
}
