#!/usr/bin/env node
/**
 * defipunkd-inherit-parent-github
 *
 * Walks the snapshot and, for every active protocol with a non-null
 * `parent_slug` and `github == null`, looks up the parent record. If the
 * parent has a non-empty `github` list, the child inherits it via a
 * per-protocol overlay at `data/overlays/<slug>.json`.
 *
 * Overlays are the durable curation mechanism — the snapshot is regenerated
 * from DefiLlama on every sync, but overlays survive and get layered on top
 * with [curated] provenance.
 *
 * By default this runs in dry-run mode. Pass `--apply` to write overlay
 * files. Existing overlays are merged: we set the `github` key only and
 * preserve any other curated fields already present in the file.
 *
 * Usage:
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/inherit-parent-github.ts
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/inherit-parent-github.ts --apply
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/inherit-parent-github.ts --only-with-audits
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ProtocolSnapshot, Snapshot } from "@defipunkd/registry";

interface CliOptions {
  apply: boolean;
  onlyWithAudits: boolean;
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
  let onlyWithAudits = false;
  for (const a of argv) {
    if (a === "--apply") apply = true;
    else if (a === "--only-with-audits") onlyWithAudits = true;
  }
  return {
    apply,
    onlyWithAudits,
    repoRoot: resolve(process.env.DEFIPUNKD_REPO_ROOT ?? findRepoRoot()),
  };
}

function isActive(p: ProtocolSnapshot): boolean {
  return !p.is_dead && p.delisted_at === null && !p.is_parent;
}

function hasAudits(repoRoot: string, slug: string): boolean {
  const path = join(repoRoot, "data", "enrichment", slug, "audits.json");
  if (!existsSync(path)) return false;
  try {
    const json = JSON.parse(readFileSync(path, "utf8")) as { audits?: unknown[] };
    return Array.isArray(json.audits) && json.audits.length > 0;
  } catch {
    return false;
  }
}

interface InheritRow {
  slug: string;
  name: string;
  parent_slug: string;
  inherited: string[];
  tvl: number | null;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const snapshotPath = join(opts.repoRoot, "data", "defillama-snapshot.json");
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as Snapshot;

  const rows: InheritRow[] = [];
  for (const p of Object.values(snapshot.protocols)) {
    if (!isActive(p)) continue;
    if (p.github && p.github.length > 0) continue;
    if (!p.parent_slug) continue;
    if (opts.onlyWithAudits && !hasAudits(opts.repoRoot, p.slug)) continue;
    const parent = snapshot.protocols[p.parent_slug];
    if (!parent || !parent.github || parent.github.length === 0) continue;
    rows.push({
      slug: p.slug,
      name: p.name,
      parent_slug: p.parent_slug,
      inherited: parent.github,
      tvl: p.tvl,
    });
  }

  rows.sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1));

  for (const r of rows) {
    const tvl = r.tvl == null ? "—" : `$${Math.round(r.tvl).toLocaleString()}`;
    console.log(
      `${r.slug.padEnd(40)} ${tvl.padStart(16)}  ← ${r.parent_slug}  [${r.inherited.join(", ")}]`,
    );
  }

  console.error(
    `\n[inherit-parent-github] ${rows.length} protocols would inherit github from their parent`,
  );

  if (!opts.apply) {
    console.error(`[inherit-parent-github] dry run — pass --apply to write overlay files`);
    return;
  }

  const overlayDir = join(opts.repoRoot, "data", "overlays");
  mkdirSync(overlayDir, { recursive: true });
  let written = 0;
  let skipped = 0;
  for (const r of rows) {
    const path = join(overlayDir, `${r.slug}.json`);
    let overlay: Record<string, unknown> = {};
    if (existsSync(path)) {
      try {
        overlay = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      } catch {
        // fall through and overwrite
      }
    }
    // Don't trample an existing curated github value.
    if (Array.isArray(overlay.github) && overlay.github.length > 0) {
      skipped++;
      continue;
    }
    overlay.github = [...r.inherited];
    writeFileSync(path, `${JSON.stringify(overlay, null, 2)}\n`);
    written++;
  }
  console.error(
    `[inherit-parent-github] wrote ${written} overlays, skipped ${skipped} that already had a curated github`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
