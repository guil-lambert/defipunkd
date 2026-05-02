#!/usr/bin/env node
/**
 * defipunkd-extract-bounties
 *
 * Stage 2 of the bug-bounty pipeline. For every active protocol in
 * `data/defillama-snapshot.json`:
 *   1. Loads the bounty index produced by `index-bounties`.
 *   2. Fuzzy-matches the protocol's slug + name against bounty entries
 *      using the same `isMatch()` utility as the auditors pipeline.
 *   3. Picks one URL by platform priority (Immunefi > Cantina), tied on
 *      max reward.
 *   4. Writes `data/enrichment/<slug>/bounties.json` with the matched
 *      candidates and the chosen URL.
 *
 * Usage:
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/extract-bounties.ts
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/extract-bounties.ts --slug aave
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ProtocolSnapshot, Snapshot } from "@defipunkd/registry";

import { isMatch } from "../audit-match.js";
import type { BountyEntry, BountyPlatform } from "../fetch-bounties.js";

interface CliOptions {
  slug: string | null;
  repoRoot: string;
}

const PLATFORM_PRIORITY: Record<BountyPlatform, number> = {
  Immunefi: 0,
  Cantina: 1,
};

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
  let slug: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") slug = argv[++i] ?? null;
    else if (a?.startsWith("--slug=")) slug = a.slice("--slug=".length);
  }
  return {
    slug,
    repoRoot: resolve(process.env.DEFIPUNKD_REPO_ROOT ?? findRepoRoot()),
  };
}

function isActive(p: ProtocolSnapshot): boolean {
  return !p.is_dead && p.delisted_at === null && !p.is_parent;
}

function loadBountyIndex(repoRoot: string): BountyEntry[] {
  const path = join(repoRoot, "data", "bounties", "index.json");
  if (!existsSync(path)) {
    console.error(`[extract-bounties] no bounty index at ${path} — run index-bounties first`);
    return [];
  }
  try {
    const json = JSON.parse(readFileSync(path, "utf8")) as { entries?: BountyEntry[] };
    return json.entries ?? [];
  } catch (err) {
    console.error(`[extract-bounties] failed to parse bounty index: ${(err as Error).message}`);
    return [];
  }
}

function chooseUrl(matched: BountyEntry[]): string | null {
  if (matched.length === 0) return null;
  const sorted = [...matched].sort((a, b) => {
    const ra = a.max_reward_usd ?? 0;
    const rb = b.max_reward_usd ?? 0;
    if (ra !== rb) return rb - ra;
    return PLATFORM_PRIORITY[a.platform] - PLATFORM_PRIORITY[b.platform];
  });
  return sorted[0]!.url;
}

function buildForProtocol(p: ProtocolSnapshot, index: BountyEntry[]): BountyEntry[] {
  const out: BountyEntry[] = [];
  for (const e of index) {
    if (!isMatch({ slug: p.slug, name: p.name }, { tokens: e.tokens, raw_name: e.project })) continue;
    out.push(e);
  }
  out.sort((a, b) => {
    const pa = PLATFORM_PRIORITY[a.platform];
    const pb = PLATFORM_PRIORITY[b.platform];
    if (pa !== pb) return pa - pb;
    return (b.max_reward_usd ?? 0) - (a.max_reward_usd ?? 0);
  });
  return out;
}

function writeOutput(
  repoRoot: string,
  slug: string,
  matched: BountyEntry[],
  chosenUrl: string | null,
  extractedAt: string,
): void {
  const outDir = join(repoRoot, "data", "enrichment", slug);
  mkdirSync(outDir, { recursive: true });
  const out = {
    slug,
    extracted_at: extractedAt,
    chosen_url: chosenUrl,
    matched,
  };
  writeFileSync(join(outDir, "bounties.json"), `${JSON.stringify(out, null, 2)}\n`);
}

function loadSnapshot(repoRoot: string): Snapshot {
  return JSON.parse(readFileSync(join(repoRoot, "data", "defillama-snapshot.json"), "utf8")) as Snapshot;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const index = loadBountyIndex(opts.repoRoot);
  console.error(`[extract-bounties] loaded ${index.length} bounty entries`);
  if (index.length === 0) process.exit(1);

  const snapshot = loadSnapshot(opts.repoRoot);
  const all = Object.values(snapshot.protocols);
  const targets = opts.slug
    ? all.filter((p) => p.slug === opts.slug)
    : all.filter(isActive);

  if (targets.length === 0) {
    console.error(`[extract-bounties] no targets matched (slug=${opts.slug ?? "(active)"})`);
    process.exit(1);
  }

  console.error(`[extract-bounties] processing ${targets.length} protocols`);
  const extractedAt = new Date().toISOString();

  let withMatch = 0;
  let totalMatches = 0;
  const perPlatform: Record<string, number> = {};

  for (const p of targets) {
    const matched = buildForProtocol(p, index);
    const chosen = chooseUrl(matched);
    if (matched.length > 0 || opts.slug) {
      writeOutput(opts.repoRoot, p.slug, matched, chosen, extractedAt);
    }
    if (matched.length > 0) withMatch++;
    totalMatches += matched.length;
    for (const m of matched) perPlatform[m.platform] = (perPlatform[m.platform] ?? 0) + 1;
  }

  console.error(
    `[extract-bounties] done: ${withMatch}/${targets.length} protocols had ≥1 match; ${totalMatches} matches total ${JSON.stringify(perPlatform)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
