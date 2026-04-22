#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const snapshotPath = join(repoRoot, "data", "defillama-snapshot.json");
const outDir = join(here, "..", "src", "generated");
const outPath = join(outDir, "delisted-manifest.json");

const snap = JSON.parse(readFileSync(snapshotPath, "utf8"));
const entries = {};
for (const [slug, p] of Object.entries(snap.protocols)) {
  if (p.delisted_at) {
    entries[slug] = { name: p.name, delisted_at: p.delisted_at };
  }
}
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(entries, null, 2) + "\n");
console.error(`[gen-delisted-manifest] wrote ${Object.keys(entries).length} delisted entries to ${outPath}`);
