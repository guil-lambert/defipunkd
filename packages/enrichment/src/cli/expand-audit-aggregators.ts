#!/usr/bin/env node
/**
 * defipunkd-expand-audit-aggregators
 *
 * Reads each `data/enrichment/<slug>/audits.json`, finds entries pointing at
 * a github audit-aggregator repo (e.g. `github.com/lidofinance/audits`), and
 * fans them out into one audit entry per .pdf file in the repo. Mutates the
 * audits.json files in place. Idempotent — re-runs replace prior
 * github-aggregator entries with a fresh listing.
 *
 * Usage:
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/expand-audit-aggregators.ts
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/expand-audit-aggregators.ts --slug lido
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/expand-audit-aggregators.ts --apply --force
 *
 * Tip: set GITHUB_TOKEN to lift the unauthenticated rate limit.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { writeStableTimestampedJson } from "../stable-write";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  expandAggregator,
  isAggregatorUrl,
  type AggregatorAudit,
} from "../fetch-audit-aggregator.js";

interface CliOptions {
  apply: boolean;
  force: boolean;
  slug: string | null;
  repoRoot: string;
}

interface AuditEntry {
  firm: string | null;
  url: string;
  date: string | null;
  source: "defillama" | "auditor-repo" | "github-aggregator";
  raw_name?: string;
}

interface AuditsFile {
  slug: string;
  extracted_at: string;
  audits: AuditEntry[];
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
  let apply = false;
  let force = false;
  let slug: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a === "--force") force = true;
    else if (a === "--slug") slug = argv[++i] ?? null;
    else if (a?.startsWith("--slug=")) slug = a.slice("--slug=".length);
  }
  return {
    apply,
    force,
    slug,
    repoRoot: resolve(process.env.DEFIPUNKD_REPO_ROOT ?? findRepoRoot()),
  };
}

function listEnrichmentSlugs(repoRoot: string): string[] {
  const dir = join(repoRoot, "data", "enrichment");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function loadAudits(repoRoot: string, slug: string): { path: string; data: AuditsFile } | null {
  const path = join(repoRoot, "data", "enrichment", slug, "audits.json");
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as AuditsFile;
    return { path, data };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const slugs = opts.slug ? [opts.slug] : listEnrichmentSlugs(opts.repoRoot);

  let scanned = 0;
  let withAggregator = 0;
  let totalAdded = 0;
  let written = 0;
  const sample: { slug: string; aggregator: string; added: number }[] = [];

  for (const slug of slugs) {
    const loaded = loadAudits(opts.repoRoot, slug);
    if (!loaded) continue;
    scanned++;
    const aggregators = loaded.data.audits.filter((a) => isAggregatorUrl(a.url));
    if (aggregators.length === 0) continue;
    withAggregator++;

    // Drop any prior github-aggregator entries before re-fanning out so
    // re-runs replace stale paths if the upstream repo reorganized.
    const baseAudits = loaded.data.audits.filter((a) => a.source !== "github-aggregator");
    const expanded: AggregatorAudit[] = [];
    for (const agg of aggregators) {
      try {
        const r = await expandAggregator(agg.url, { repoRoot: opts.repoRoot, force: opts.force });
        if (r) expanded.push(...r.audits);
      } catch (err) {
        console.error(`[expand-aggregators] ${slug}: ${(err as Error).message}`);
      }
    }

    // Dedupe (firm, url) — multiple aggregators in one protocol shouldn't double-list.
    const seen = new Set<string>();
    const merged: AuditEntry[] = [...baseAudits];
    for (const e of expanded) {
      const key = `${(e.firm ?? "").toLowerCase()}|${e.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(e);
    }

    const added = merged.length - baseAudits.length;
    totalAdded += added;
    if (sample.length < 10) sample.push({ slug, aggregator: aggregators[0]!.url, added });

    if (opts.apply) {
      const out: AuditsFile = {
        slug: loaded.data.slug,
        extracted_at: new Date().toISOString(),
        audits: merged.sort((a, b) => {
          const fa = a.firm ?? "";
          const fb = b.firm ?? "";
          if (fa !== fb) return fa.localeCompare(fb);
          const da = a.date ?? "";
          const db = b.date ?? "";
          if (da !== db) return db.localeCompare(da);
          return a.url.localeCompare(b.url);
        }),
      };
      mkdirSync(dirname(loaded.path), { recursive: true });
      const result = writeStableTimestampedJson(loaded.path, out as unknown as Record<string, unknown>, "extracted_at");
      if (result.wrote) written++;
    }
  }

  console.error(
    `[expand-aggregators] scanned=${scanned}  with_aggregator=${withAggregator}  added=${totalAdded}  written=${written}`,
  );
  for (const s of sample) {
    console.error(`  ${s.slug.padEnd(36)}  +${s.added}  ← ${s.aggregator}`);
  }
  if (!opts.apply) {
    console.error("[expand-aggregators] dry run — pass --apply to write audits.json files");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
