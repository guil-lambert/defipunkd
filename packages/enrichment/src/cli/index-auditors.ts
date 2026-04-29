#!/usr/bin/env node
/**
 * defipunkd-index-auditors
 *
 * Stage 1 of the audit pipeline. Crawls public auditor GitHub repos and
 * writes a single normalized index at `data/auditors/index.json`. This file
 * is consumed by `extract-audits` (stage 2) to merge with each protocol's
 * DefiLlama-supplied audit_links.
 *
 * Usage:
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/index-auditors.ts
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/index-auditors.ts --firm spearbit
 *
 * Environment:
 *   GITHUB_TOKEN  Optional. Required in practice for code4rena (hundreds of
 *                 repos exceed the 60 req/hr unauth limit).
 *   DEFIPUNKD_REPO_ROOT  Override repo root.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  crawlCode4rena,
  crawlSherlock,
  crawlSpearbit,
  crawlTrailOfBits,
  type AuditorEntry,
  type CrawlOptions,
  type CrawlResult,
} from "../fetch-auditors.js";

type FirmKey = "tob" | "spearbit" | "sherlock" | "c4";

const FIRMS: Record<FirmKey, { label: string; run: (o: CrawlOptions) => Promise<CrawlResult> }> = {
  tob: { label: "Trail of Bits", run: crawlTrailOfBits },
  spearbit: { label: "Spearbit", run: crawlSpearbit },
  sherlock: { label: "Sherlock", run: crawlSherlock },
  c4: { label: "Code4rena", run: crawlCode4rena },
};

interface CliOptions {
  firm: FirmKey | null;
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
  let firm: FirmKey | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--firm") {
      const v = argv[++i] ?? "";
      if (v in FIRMS) firm = v as FirmKey;
    } else if (a?.startsWith("--firm=")) {
      const v = a.slice("--firm=".length);
      if (v in FIRMS) firm = v as FirmKey;
    }
  }
  return {
    firm,
    repoRoot: resolve(process.env.DEFIPUNKD_REPO_ROOT ?? findRepoRoot()),
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("[index-auditors] no GITHUB_TOKEN set — code4rena listing will likely 403");
  }
  const crawlOpts: CrawlOptions = {
    fetch: (url) => fetch(url),
    token,
  };

  const targets: FirmKey[] = opts.firm ? [opts.firm] : (["tob", "spearbit", "sherlock", "c4"] as FirmKey[]);

  let all: AuditorEntry[] = [];
  const allWarnings: string[] = [];
  const perFirmCounts: Record<string, number> = {};

  for (const key of targets) {
    const f = FIRMS[key];
    console.error(`[index-auditors] crawling ${f.label}…`);
    const r = await f.run(crawlOpts);
    perFirmCounts[f.label] = r.entries.length;
    console.error(`[index-auditors]   → ${r.entries.length} entries, ${r.warnings.length} warnings`);
    for (const w of r.warnings) console.error(`[index-auditors]     ! ${w}`);
    all = all.concat(r.entries);
    allWarnings.push(...r.warnings.map((w) => `${f.label}: ${w}`));
  }

  // When called with --firm, merge into the existing index instead of replacing.
  const outDir = join(opts.repoRoot, "data", "auditors");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "index.json");
  let merged = all;
  if (opts.firm && existsSync(outPath)) {
    try {
      const prev = JSON.parse(readFileSync(outPath, "utf8")) as { entries: AuditorEntry[] };
      const replacedFirms = new Set(targets.map((k) => FIRMS[k].label));
      merged = prev.entries.filter((e) => !replacedFirms.has(e.firm)).concat(all);
    } catch {
      // fall through, just write the new entries
    }
  }

  // Sort for deterministic output: firm, then date desc, then raw_name.
  merged.sort((a, b) => {
    if (a.firm !== b.firm) return a.firm.localeCompare(b.firm);
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da !== db) return db.localeCompare(da);
    return a.raw_name.localeCompare(b.raw_name);
  });

  const out = {
    generated_at: new Date().toISOString(),
    counts: perFirmCounts,
    warnings: allWarnings,
    entries: merged,
  };
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.error(`[index-auditors] wrote ${merged.length} entries → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
