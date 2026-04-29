#!/usr/bin/env node
/**
 * defipunkd-audits-without-github
 *
 * Lists active protocols that carry ≥1 audit reference (from
 * data/enrichment/<slug>/audits.json) but have no `github` entry in
 * data/defillama-snapshot.json. Useful for filling holes in the protocol
 * registry — if a protocol has been audited, the auditor's report
 * generally points at a public repo we should also know about.
 *
 * Usage:
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/audits-without-github.ts
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/audits-without-github.ts --csv > out.csv
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/audits-without-github.ts --min-tvl 1000000
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ProtocolSnapshot, Snapshot } from "@defipunkd/registry";

interface AuditFileEntry {
  firm: string | null;
  url: string;
  date: string | null;
  source: "defillama" | "auditor-repo";
}

interface AuditFile {
  audits?: AuditFileEntry[];
}

interface CliOptions {
  csv: boolean;
  minTvl: number;
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
  let csv = false;
  let minTvl = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--csv") csv = true;
    else if (a === "--min-tvl") minTvl = Number(argv[++i] ?? 0);
    else if (a?.startsWith("--min-tvl=")) minTvl = Number(a.slice("--min-tvl=".length));
  }
  return {
    csv,
    minTvl: Number.isFinite(minTvl) ? minTvl : 0,
    repoRoot: resolve(process.env.DEFIPUNKD_REPO_ROOT ?? findRepoRoot()),
  };
}

function isActive(p: ProtocolSnapshot): boolean {
  return !p.is_dead && p.delisted_at === null && !p.is_parent;
}

function hasGithub(p: ProtocolSnapshot, repoRoot: string): boolean {
  if (Array.isArray(p.github) && p.github.length > 0) return true;
  const overlayPath = join(repoRoot, "data", "overlays", `${p.slug}.json`);
  if (!existsSync(overlayPath)) return false;
  try {
    const overlay = JSON.parse(readFileSync(overlayPath, "utf8")) as { github?: string[] | null };
    return Array.isArray(overlay.github) && overlay.github.length > 0;
  } catch {
    return false;
  }
}

function loadAudits(repoRoot: string, slug: string): AuditFileEntry[] {
  const path = join(repoRoot, "data", "enrichment", slug, "audits.json");
  if (!existsSync(path)) return [];
  try {
    const json = JSON.parse(readFileSync(path, "utf8")) as AuditFile;
    return json.audits ?? [];
  } catch {
    return [];
  }
}

function escapeCsv(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

interface Row {
  slug: string;
  name: string;
  tvl: number | null;
  category: string;
  website: string | null;
  audit_count: number;
  firms: string[];
  first_url: string;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const snapshot = JSON.parse(
    readFileSync(join(opts.repoRoot, "data", "defillama-snapshot.json"), "utf8"),
  ) as Snapshot;

  const rows: Row[] = [];
  for (const p of Object.values(snapshot.protocols)) {
    if (!isActive(p)) continue;
    if (hasGithub(p, opts.repoRoot)) continue;
    if ((p.tvl ?? 0) < opts.minTvl) continue;
    const audits = loadAudits(opts.repoRoot, p.slug);
    if (audits.length === 0) continue;
    const firms = [...new Set(audits.map((a) => a.firm ?? "unknown"))];
    rows.push({
      slug: p.slug,
      name: p.name,
      tvl: p.tvl,
      category: p.category,
      website: p.website,
      audit_count: audits.length,
      firms,
      first_url: audits[0]!.url,
    });
  }

  // Sort by TVL desc; protocols without TVL fall to the bottom.
  rows.sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1));

  if (opts.csv) {
    console.log("slug,name,tvl,category,website,audit_count,firms,first_audit_url");
    for (const r of rows) {
      console.log(
        [
          r.slug,
          r.name,
          r.tvl ?? "",
          r.category,
          r.website ?? "",
          r.audit_count,
          r.firms.join("|"),
          r.first_url,
        ].map((v) => escapeCsv(String(v))).join(","),
      );
    }
  } else {
    for (const r of rows) {
      const tvl = r.tvl == null ? "—" : `$${Math.round(r.tvl).toLocaleString()}`;
      console.log(
        `${r.slug.padEnd(40)} ${tvl.padStart(16)}  ${r.audit_count}× [${r.firms.join(", ")}]  ${r.category}`,
      );
    }
    console.error(`\n[audits-without-github] ${rows.length} protocols matched`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
