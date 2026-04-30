#!/usr/bin/env node
/**
 * defipunkd-index-bounties
 *
 * Stage 1 of the bug-bounty pipeline. Crawls public bounty-platform
 * directories (Immunefi, Cantina) and writes a single normalized index at
 * `data/bounties/index.json`. Consumed by `extract-bounties` (stage 2).
 *
 * Usage:
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/index-bounties.ts
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/index-bounties.ts --platforms immunefi
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  crawlCantina,
  crawlImmunefi,
  type BountyEntry,
  type BountyPlatform,
  type CrawlBountyResult,
} from "../fetch-bounties.js";

type PlatformKey = "immunefi" | "cantina";

const PLATFORMS: Record<PlatformKey, { label: BountyPlatform; run: () => Promise<CrawlBountyResult> }> = {
  immunefi: { label: "Immunefi", run: crawlImmunefi },
  cantina: { label: "Cantina", run: crawlCantina },
};

interface CliOptions {
  platforms: PlatformKey[];
  repoRoot: string;
}

function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function parseArgs(argv: string[]): CliOptions {
  let platforms: PlatformKey[] | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--platforms" || a === "--platform") {
      const v = argv[++i] ?? "";
      platforms = v.split(",").map((s) => s.trim()).filter((s): s is PlatformKey => s in PLATFORMS);
    } else if (a?.startsWith("--platforms=")) {
      const v = a.slice("--platforms=".length);
      platforms = v.split(",").map((s) => s.trim()).filter((s): s is PlatformKey => s in PLATFORMS);
    }
  }
  return {
    platforms: platforms ?? (Object.keys(PLATFORMS) as PlatformKey[]),
    repoRoot: resolve(process.env.DEFIPUNKD_REPO_ROOT ?? findRepoRoot()),
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  let all: BountyEntry[] = [];
  const allWarnings: string[] = [];
  const counts: Record<string, number> = {};

  for (const key of opts.platforms) {
    const p = PLATFORMS[key];
    console.error(`[index-bounties] crawling ${p.label}…`);
    const r = await p.run();
    counts[p.label] = r.entries.length;
    console.error(`[index-bounties]   → ${r.entries.length} entries, ${r.warnings.length} warnings`);
    for (const w of r.warnings) console.error(`[index-bounties]     ! ${w}`);
    all = all.concat(r.entries);
    allWarnings.push(...r.warnings.map((w) => `${p.label}: ${w}`));
  }

  // Dedup on (platform, url).
  const seen = new Set<string>();
  const deduped: BountyEntry[] = [];
  for (const e of all) {
    const key = `${e.platform}|${e.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }

  deduped.sort((a, b) => {
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
    return a.project.localeCompare(b.project);
  });

  const outDir = join(opts.repoRoot, "data", "bounties");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "index.json");
  const out = {
    generated_at: new Date().toISOString(),
    counts,
    warnings: allWarnings,
    entries: deduped,
  };
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.error(`[index-bounties] wrote ${deduped.length} entries → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
