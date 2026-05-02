#!/usr/bin/env node
/**
 * defipunkd-merge-bounties-to-overlays
 *
 * Promotes the chosen bounty URL from each `data/enrichment/<slug>/bounties.json`
 * into the overlay layer at `data/overlays/<slug>.json` under the key
 * `bug_bounty_url`. This makes auto-discovered bounty URLs visible to the UI
 * via `getProtocolMetadata()` (curated assessment values still win).
 *
 * Skip rules:
 *   - No-op when overlay.bug_bounty_url is already set (curated value).
 *   - No-op when bounties.json has no chosen_url.
 *   - When the assessment metadata already supplies a bug_bounty_url for a
 *     slug, we don't bother writing the overlay — saves churn.
 *
 * Usage:
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/merge-bounties-to-overlays.ts
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/merge-bounties-to-overlays.ts --apply
 *   pnpm --filter @defipunkd/enrichment exec tsx src/cli/merge-bounties-to-overlays.ts --slug aave --apply
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface CliOptions {
  apply: boolean;
  slug: string | null;
  repoRoot: string;
}

interface BountiesFile {
  slug: string;
  chosen_url: string | null;
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

function listEnrichmentSlugs(repoRoot: string): string[] {
  const dir = join(repoRoot, "data", "enrichment");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function loadBounties(repoRoot: string, slug: string): BountiesFile | null {
  const path = join(repoRoot, "data", "enrichment", slug, "bounties.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as BountiesFile;
  } catch {
    return null;
  }
}

interface Plan {
  slug: string;
  chosenUrl: string;
  overlayPath: string;
  reason: "would-write" | "already-set-overlay";
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const slugs = opts.slug ? [opts.slug] : listEnrichmentSlugs(opts.repoRoot);
  const overlayDir = join(opts.repoRoot, "data", "overlays");

  let scanned = 0;
  let noChosen = 0;
  let alreadySet = 0;
  let wouldWrite = 0;
  const plans: Plan[] = [];

  for (const slug of slugs) {
    const bounties = loadBounties(opts.repoRoot, slug);
    if (!bounties) continue;
    scanned++;
    if (!bounties.chosen_url) {
      noChosen++;
      continue;
    }
    const overlayPath = join(overlayDir, `${slug}.json`);
    let overlay: Record<string, unknown> = {};
    if (existsSync(overlayPath)) {
      try {
        overlay = JSON.parse(readFileSync(overlayPath, "utf8")) as Record<string, unknown>;
      } catch {
        // overwrite a corrupt overlay
      }
    }
    if (typeof overlay.bug_bounty_url === "string" && overlay.bug_bounty_url.length > 0) {
      alreadySet++;
      continue;
    }
    plans.push({ slug, chosenUrl: bounties.chosen_url, overlayPath, reason: "would-write" });
    wouldWrite++;
  }

  console.error(
    `[merge-bounties] scanned=${scanned}  would_write=${wouldWrite}  already_set=${alreadySet}  no_chosen=${noChosen}`,
  );

  for (const plan of plans.slice(0, 10)) {
    console.error(`  ${plan.slug.padEnd(36)}  → ${plan.chosenUrl}`);
  }
  if (plans.length > 10) console.error(`  …and ${plans.length - 10} more`);

  if (!opts.apply) {
    console.error("[merge-bounties] dry run — pass --apply to write overlays");
    return;
  }

  mkdirSync(overlayDir, { recursive: true });
  let nWritten = 0;
  for (const plan of plans) {
    let overlay: Record<string, unknown> = {};
    if (existsSync(plan.overlayPath)) {
      try {
        overlay = JSON.parse(readFileSync(plan.overlayPath, "utf8")) as Record<string, unknown>;
      } catch {
        // overwrite a corrupt overlay
      }
    }
    overlay.bug_bounty_url = plan.chosenUrl;
    writeFileSync(plan.overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);
    nWritten++;
  }
  console.error(`[merge-bounties] wrote ${nWritten} overlays`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
