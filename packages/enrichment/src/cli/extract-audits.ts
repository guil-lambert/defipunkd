#!/usr/bin/env node
/**
 * defipunkd-extract-audits
 *
 * Stage 2 of the audit pipeline. For every active protocol in
 * `data/defillama-snapshot.json`:
 *   1. Seeds entries from the snapshot's `audit_links` (firm inferred from URL host).
 *   2. Fuzzy-matches the protocol's slug + name against `data/auditors/index.json`.
 *   3. Writes `data/enrichment/<slug>/audits.json` with the merged, deduped list.
 *
 * Output dedup key: (firm, url). When a record appears in both sources, the
 * auditor-repo entry wins (canonical URL + parsed date).
 *
 * Usage:
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/extract-audits.ts
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/extract-audits.ts --slug uniswap
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeStableTimestampedJson } from "../stable-write";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ProtocolSnapshot, Snapshot } from "@defipunkd/registry";

import { firmFromUrl, isMatch } from "../audit-match.js";
import type { AuditorEntry } from "../fetch-auditors.js";

interface CliOptions {
  slug: string | null;
  repoRoot: string;
}

interface AuditOut {
  firm: string | null;
  url: string;
  date: string | null;
  source: "defillama" | "auditor-repo";
  raw_name?: string;
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

function loadAuditorIndex(repoRoot: string): AuditorEntry[] {
  const path = join(repoRoot, "data", "auditors", "index.json");
  if (!existsSync(path)) {
    console.error(`[extract-audits] no auditor index at ${path} — run index-auditors first; continuing with defillama-only`);
    return [];
  }
  try {
    const json = JSON.parse(readFileSync(path, "utf8")) as { entries?: AuditorEntry[] };
    return json.entries ?? [];
  } catch (err) {
    console.error(`[extract-audits] failed to parse auditor index: ${(err as Error).message}`);
    return [];
  }
}

function buildForProtocol(p: ProtocolSnapshot, auditorIndex: AuditorEntry[]): AuditOut[] {
  const merged = new Map<string, AuditOut>();

  for (const url of p.audit_links ?? []) {
    if (!url) continue;
    const key = `${(firmFromUrl(url) ?? "").toLowerCase()}|${url}`;
    if (merged.has(key)) continue;
    merged.set(key, {
      firm: firmFromUrl(url),
      url,
      date: null,
      source: "defillama",
    });
  }

  for (const entry of auditorIndex) {
    if (!isMatch({ slug: p.slug, name: p.name }, { tokens: entry.tokens, raw_name: entry.raw_name })) continue;
    const key = `${entry.firm.toLowerCase()}|${entry.url}`;
    merged.set(key, {
      firm: entry.firm,
      url: entry.url,
      date: entry.date,
      source: "auditor-repo",
      raw_name: entry.raw_name,
    });
  }

  return [...merged.values()].sort((a, b) => {
    const fa = a.firm ?? "";
    const fb = b.firm ?? "";
    if (fa !== fb) return fa.localeCompare(fb);
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da !== db) return db.localeCompare(da);
    return a.url.localeCompare(b.url);
  });
}

function writeOutput(repoRoot: string, slug: string, audits: AuditOut[], extractedAt: string): void {
  const outDir = join(repoRoot, "data", "enrichment", slug);
  mkdirSync(outDir, { recursive: true });
  const out = {
    slug,
    extracted_at: extractedAt,
    audits,
  };
  writeStableTimestampedJson(join(outDir, "audits.json"), out, "extracted_at");
}

function loadSnapshot(repoRoot: string): Snapshot {
  return JSON.parse(readFileSync(join(repoRoot, "data", "defillama-snapshot.json"), "utf8")) as Snapshot;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const auditorIndex = loadAuditorIndex(opts.repoRoot);
  console.error(`[extract-audits] loaded ${auditorIndex.length} auditor-repo entries`);

  const snapshot = loadSnapshot(opts.repoRoot);
  const all = Object.values(snapshot.protocols);
  const targets = opts.slug
    ? all.filter((p) => p.slug === opts.slug)
    : all.filter(isActive);

  if (targets.length === 0) {
    console.error(`[extract-audits] no targets matched (slug=${opts.slug ?? "(active)"})`);
    process.exit(1);
  }

  console.error(`[extract-audits] processing ${targets.length} protocols`);
  const extractedAt = new Date().toISOString();

  let withAudits = 0;
  let totalEntries = 0;
  let fromAuditorRepo = 0;
  let fromDefillama = 0;

  for (const p of targets) {
    const audits = buildForProtocol(p, auditorIndex);
    writeOutput(opts.repoRoot, p.slug, audits, extractedAt);
    if (audits.length > 0) withAudits++;
    totalEntries += audits.length;
    for (const a of audits) {
      if (a.source === "auditor-repo") fromAuditorRepo++;
      else fromDefillama++;
    }
  }

  console.error(
    `[extract-audits] done: ${withAudits}/${targets.length} protocols had ≥1 audit; ` +
      `${totalEntries} entries total (${fromDefillama} defillama, ${fromAuditorRepo} auditor-repo)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
