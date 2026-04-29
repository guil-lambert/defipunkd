#!/usr/bin/env node
/**
 * defipunkd-merge-audit-links-to-overlays
 *
 * Promotes the audit URLs we discovered via the auditor-repo index into
 * the overlay layer, so registry consumers see the richer set instead of
 * just DefiLlama's `audit_links`.
 *
 * Read side: `data/enrichment/<slug>/audits.json` (produced by
 * extract-audits) — already contains both DefiLlama links and the
 * fuzzy-matched ToB/Spearbit/Sherlock/Code4rena entries.
 *
 * Write side: `data/overlays/<slug>.json`, key `audit_links` (string[]).
 * The overlay schema only stores URLs, not firm/date, so the structured
 * metadata stays in `audits.json` for callers that want it.
 *
 * The overlay value REPLACES the snapshot value during registry merge, so
 * we always write the union (snapshot links + audits.json links). We only
 * bother writing when the union is strictly larger than the snapshot —
 * otherwise the overlay would just duplicate DefiLlama with no signal,
 * and the audit_links field would lose the ability to detect a missing
 * snapshot value via "was the field set in overlay?".
 *
 * `audit_count` is also written when we update `audit_links`, set to
 * the length of the new union, so the count stays consistent with the
 * URL list a consumer can read.
 *
 * Usage:
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/merge-audit-links-to-overlays.ts
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/merge-audit-links-to-overlays.ts --apply
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/merge-audit-links-to-overlays.ts --slug uniswap-v3 --apply
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ProtocolSnapshot, Snapshot } from "@defipunkd/registry";

interface AuditFileEntry {
  firm: string | null;
  url: string;
  date: string | null;
  source: "defillama" | "auditor-repo";
}

interface CliOptions {
  apply: boolean;
  slug: string | null;
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
  let apply = false;
  let slug: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a === "--slug") slug = argv[++i] ?? null;
    else if (a?.startsWith("--slug=")) slug = a.slice("--slug=".length);
  }
  return {
    apply,
    slug,
    repoRoot: resolve(process.env.DEFIPUNKD_REPO_ROOT ?? findRepoRoot()),
  };
}

function isActive(p: ProtocolSnapshot): boolean {
  return !p.is_dead && p.delisted_at === null && !p.is_parent;
}

function loadAudits(repoRoot: string, slug: string): AuditFileEntry[] {
  const path = join(repoRoot, "data", "enrichment", slug, "audits.json");
  if (!existsSync(path)) return [];
  try {
    const json = JSON.parse(readFileSync(path, "utf8")) as { audits?: AuditFileEntry[] };
    return json.audits ?? [];
  } catch {
    return [];
  }
}

interface Plan {
  slug: string;
  snapshotUrls: string[];
  snapshotCount: number;
  unionUrls: string[];
  added: string[]; // urls in union that weren't in snapshot
}

function buildPlan(p: ProtocolSnapshot, audits: AuditFileEntry[]): Plan | null {
  const snapshotUrls = (p.audit_links ?? []).filter((u) => typeof u === "string" && u.length > 0);
  const snapshotSet = new Set(snapshotUrls);
  const unionSet = new Set(snapshotUrls);
  for (const a of audits) {
    if (!a.url) continue;
    unionSet.add(a.url);
  }
  if (unionSet.size === snapshotSet.size) return null;
  const unionUrls = [...unionSet].sort();
  const added = unionUrls.filter((u) => !snapshotSet.has(u));
  return {
    slug: p.slug,
    snapshotUrls,
    snapshotCount: p.audit_count ?? 0,
    unionUrls,
    added,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const snapshot = JSON.parse(
    readFileSync(join(opts.repoRoot, "data", "defillama-snapshot.json"), "utf8"),
  ) as Snapshot;

  const all = Object.values(snapshot.protocols);
  const candidates = opts.slug
    ? all.filter((p) => p.slug === opts.slug)
    : all.filter(isActive);

  if (candidates.length === 0) {
    console.error("[merge-audit-links] no candidates");
    process.exit(1);
  }

  const plans: Plan[] = [];
  for (const p of candidates) {
    const audits = loadAudits(opts.repoRoot, p.slug);
    if (audits.length === 0) continue;
    const plan = buildPlan(p, audits);
    if (plan) plans.push(plan);
  }

  plans.sort((a, b) => b.added.length - a.added.length);

  console.error(
    `[merge-audit-links] ${plans.length} protocols would gain audit_links via overlay (${
      plans.reduce((sum, p) => sum + p.added.length, 0)
    } URLs added in total)`,
  );

  for (const plan of plans.slice(0, 10)) {
    console.error(
      `  ${plan.slug.padEnd(36)}  snapshot=${plan.snapshotUrls.length}  +${plan.added.length}  → union=${plan.unionUrls.length}`,
    );
  }
  if (plans.length > 10) console.error(`  …and ${plans.length - 10} more`);

  if (!opts.apply) {
    console.error("[merge-audit-links] dry run — pass --apply to write overlays");
    return;
  }

  const overlayDir = join(opts.repoRoot, "data", "overlays");
  mkdirSync(overlayDir, { recursive: true });
  let nWritten = 0;
  let nSkipped = 0;
  for (const plan of plans) {
    const path = join(overlayDir, `${plan.slug}.json`);
    let overlay: Record<string, unknown> = {};
    if (existsSync(path)) {
      try {
        overlay = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      } catch {
        // overwrite a corrupt overlay
      }
    }
    // Don't trample a curated value if the user already wrote one. Same
    // policy as inherit-parent-github / scrape-github-from-website.
    if (Array.isArray(overlay.audit_links) && overlay.audit_links.length > 0) {
      nSkipped++;
      continue;
    }
    overlay.audit_links = plan.unionUrls;
    // Only override audit_count when the new count actually differs from
    // the snapshot's. DefiLlama's audit_count and audit_links.length are
    // independent fields — the count can already match our union length
    // even when the URL set is smaller, in which case writing it triggers
    // an identity-overlay warning at registry build time.
    if (plan.snapshotCount !== plan.unionUrls.length) {
      overlay.audit_count = plan.unionUrls.length;
    } else if ("audit_count" in overlay && overlay.audit_count === plan.snapshotCount) {
      delete overlay.audit_count;
    }
    writeFileSync(path, `${JSON.stringify(overlay, null, 2)}\n`);
    nWritten++;
  }
  console.error(
    `[merge-audit-links] wrote ${nWritten} overlays, skipped ${nSkipped} that already had a curated audit_links`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
