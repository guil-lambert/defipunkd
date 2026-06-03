#!/usr/bin/env tsx
/**
 * Build the static data bundle consumed by the DeFiLlama browser-extension
 * showcase (../../extension).
 *
 * Reuses the exact server-side rendering logic the website uses
 * (assessProtocol / deriveTier / getProtocolMetadata) so the extension matches
 * defipunkd.com without reimplementing any grading. One record per protocol
 * that has at least one assessment.
 *
 * Emits two artifacts:
 *   - extension/data/pizza-data.json   (raw map, for inspection / future fetch)
 *   - extension/src/data.js            (content-script wrapper that assigns the
 *                                       map to globalThis.DEFIPUNKD_DATA)
 *
 * Run: pnpm --filter @defipunkd/web build:extension-data
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getAssessments,
  getSubmissions,
  getProtocol,
  getProtocolMetadata,
  type AssessmentSliceId,
} from "@defipunkd/registry";
import { assessProtocol, cexAssessment, type SliceAssessment } from "../src/lib/rationale";
import { deriveTier, TIER_RANK, type TierInput } from "../src/lib/tier";
import { listProtocols } from "@defipunkd/registry";
import { PIZZA_SLICES, type PizzaSliceId } from "../src/lib/pizza";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const OUT_DIR = join(REPO_ROOT, "extension");

type SliceRecord = {
  id: PizzaSliceId;
  label: string;
  grade: string; // green | orange | red | gray
  tentative: boolean;
  partial: boolean;
  modelsCount: number;
  shortHeadline: string | null;
  verdict: string | null;
};

type FamilyEntry = {
  slug: string;
  name: string;
  tier: string;
  slices: SliceRecord[];
};

type ProtocolRecord = {
  name: string;
  category: string;
  tvl: number | null;
  tier: string;
  about: string | null;
  pills: {
    upgradeability: string | null;
    bugBountyUrl: string | null;
    governanceForum: string | null;
    docsUrl: string | null;
  };
  slices: SliceRecord[];
  /** Present on family parents: one tab per child (assessed or heuristic). */
  family?: FamilyEntry[];
};

// DeFiLlama live slugs that differ from our snapshot slugs (rebrands etc.).
// Maps DeFiLlama-slug -> our-snapshot-slug so the overlay still resolves.
const SLUG_ALIASES: Record<string, string> = {
  sky: "maker", // DeFiLlama "Sky" family is "maker" (+ sky-* children) in our snapshot
  "ether.fi": "ether-fi", // DeFiLlama uses a dot; our snapshot family slug is hyphenated
};

const SLICE_ORDER = PIZZA_SLICES.map((s) => s.id) as PizzaSliceId[];

/**
 * Fill grade for the pizza wedge. Mirrors ProtocolSummary.astro `tentativeGrade`:
 * a partial (pre-quorum) slice is filled with the MOST-SEVERE submitted grade
 * (warn first), not left gray. Non-partial slices use their consensus grade.
 */
function fillGrade(s: SliceAssessment): string {
  if (!s.partial || !s.partialModelGrades || s.partialModelGrades.length === 0) return s.grade;
  const order: Record<string, number> = { red: 0, orange: 1, gray: 2, green: 3 };
  const sorted = [...s.partialModelGrades].sort(
    (a, b) => (order[a.grade] ?? 9) - (order[b.grade] ?? 9),
  );
  return sorted[0]?.grade ?? "gray";
}

function buildRecord(slug: string): ProtocolRecord | null {
  const protocol = getProtocol(slug);
  if (!protocol) return null;

  const assessments = getAssessments().get(slug);
  const submissions = getSubmissions().get(slug);
  const metadata = getProtocolMetadata(slug);

  // Mirror ProtocolSummary.astro: CEXes get the all-red assessment.
  const slices =
    protocol.category === "CEX"
      ? cexAssessment()
      : assessProtocol(protocol, assessments, submissions, metadata);

  // Mirror ProtocolSummary.astro tierInput assembly.
  let tierInput: TierInput | undefined;
  if ((assessments && assessments.size > 0) || (submissions && submissions.size > 0)) {
    tierInput = {};
    if (assessments) {
      const tentativeBySlice = new Map<string, boolean>();
      for (const s of slices) tentativeBySlice.set(s.id, !!s.tentative);
      for (const [sliceId, a] of assessments.entries()) {
        tierInput[sliceId as PizzaSliceId] = {
          models: a.models,
          merged_at: a.merged_at,
          human_signoff: a.human_signoff ?? null,
          tentative: tentativeBySlice.get(sliceId) ?? false,
        };
      }
    }
    if (submissions) {
      for (const [sliceId, arr] of submissions.entries()) {
        const existing = tierInput[sliceId as PizzaSliceId] ?? {};
        tierInput[sliceId as PizzaSliceId] = { ...existing, submissionCount: arr.length };
      }
    }
  }
  const tier = deriveTier(tierInput);

  const byId = new Map(slices.map((s) => [s.id, s] as const));
  const sliceRecords: SliceRecord[] = SLICE_ORDER.map((id) => {
    const s = byId.get(id as AssessmentSliceId & PizzaSliceId);
    const meta = PIZZA_SLICES.find((p) => p.id === id)!;
    if (!s) {
      return {
        id,
        label: meta.label,
        grade: "gray",
        tentative: false,
        partial: false,
        modelsCount: 0,
        shortHeadline: null,
        verdict: null,
      };
    }
    return {
      id,
      label: s.label,
      grade: fillGrade(s),
      tentative: !!s.tentative,
      partial: !!s.partial,
      modelsCount: s.models?.length ?? 0,
      shortHeadline: s.short_headline ?? s.headline ?? null,
      verdict: s.rationale ?? null,
    };
  });

  const rawAbout = metadata?.about?.trim() || "";
  const isPlaceholder = /^awaiting\s+defi@home\s+description/i.test(rawAbout);
  const about = rawAbout && !isPlaceholder ? rawAbout : null;

  return {
    name: protocol.name,
    category: protocol.category,
    tvl: protocol.tvl,
    tier,
    about,
    pills: {
      upgradeability: metadata?.upgradeability ?? null,
      bugBountyUrl: metadata?.bug_bounty_url ?? null,
      governanceForum: metadata?.governance_forum ?? null,
      docsUrl: metadata?.docs_url ?? null,
    },
    slices: sliceRecords,
  };
}

function main(): void {
  const all = listProtocols();
  const tvlOf = (slug: string) => getProtocol(slug)?.tvl ?? -1;
  const tierRank = (rec: ProtocolRecord) => TIER_RANK[rec.tier as keyof typeof TIER_RANK] ?? 0;

  // Memoized record builder (children are built on demand for family tabs).
  const cache = new Map<string, ProtocolRecord | null>();
  const getRec = (slug: string): ProtocolRecord | null => {
    if (cache.has(slug)) return cache.get(slug)!;
    const rec = buildRecord(slug);
    cache.set(slug, rec);
    return rec;
  };

  const out: Record<string, ProtocolRecord> = {};
  const slugs = [...getAssessments().keys()].sort();
  let skipped = 0;
  for (const slug of slugs) {
    const rec = getRec(slug);
    if (rec) out[slug] = rec;
    else skipped += 1;
  }

  const childrenByParent = new Map<string, string[]>();
  for (const p of all) {
    if (!p.parent_slug) continue;
    const bucket = childrenByParent.get(p.parent_slug) ?? [];
    bucket.push(p.slug);
    childrenByParent.set(p.parent_slug, bucket);
  }
  const ownAssessed = new Set(slugs);

  // Family defaulting + tabs: DeFiLlama's ranking row for a family links to the
  // parent slug. Per defipunkd, the family pizza is the BEST-assessed child
  // (highest tier, tie-break by TVL), even when the parent has its own (often
  // sparse) assessment. The parent record also carries a `family` list — one tab
  // per child (assessed children get real pizzas; others get the Phase-0
  // heuristic) — sorted best-first.
  let aliased = 0;
  for (const parent of all) {
    if (!parent.is_parent) continue;
    const kids = childrenByParent.get(parent.slug) ?? [];
    if (!kids.some((s) => ownAssessed.has(s))) continue; // need ≥1 assessed child

    const entries: FamilyEntry[] = [];
    for (const childSlug of kids) {
      const rec = getRec(childSlug);
      if (!rec) continue;
      entries.push({ slug: childSlug, name: rec.name, tier: rec.tier, slices: rec.slices });
    }
    entries.sort((a, b) => {
      const aRec = getRec(a.slug)!;
      const bRec = getRec(b.slug)!;
      const tierDelta = tierRank(bRec) - tierRank(aRec);
      if (tierDelta !== 0) return tierDelta;
      return tvlOf(b.slug) - tvlOf(a.slug);
    });

    const repRec = getRec(entries[0].slug)!;
    out[parent.slug] = {
      ...repRec,
      name: parent.name,
      category: parent.category || repRec.category,
      tvl: parent.tvl ?? repRec.tvl,
      family: entries,
    };
    aliased += 1;
  }

  // Slug aliases (rebrands): mirror an existing record under a DeFiLlama-live slug.
  let slugAliased = 0;
  for (const [dst, src] of Object.entries(SLUG_ALIASES)) {
    if (out[dst] || !out[src]) continue;
    out[dst] = out[src];
    slugAliased += 1;
  }

  mkdirSync(join(OUT_DIR, "data"), { recursive: true });
  mkdirSync(join(OUT_DIR, "src"), { recursive: true });

  const json = JSON.stringify(out, null, 2);
  writeFileSync(join(OUT_DIR, "data", "pizza-data.json"), json + "\n");

  const banner =
    "// AUTO-GENERATED by apps/web/scripts/build-extension-data.ts — do not edit by hand.\n" +
    "// Run `pnpm --filter @defipunkd/web build:extension-data` to refresh.\n";
  const dataJs = `${banner}globalThis.DEFIPUNKD_DATA = ${json};\n`;
  writeFileSync(join(OUT_DIR, "src", "data.js"), dataJs);

  console.log(
    `[build-extension-data] wrote ${Object.keys(out).length} protocols ` +
      `(${skipped} skipped, ${aliased} family parents, ${slugAliased} slug aliases) → ` +
      `extension/data/pizza-data.json + extension/src/data.js`,
  );
}

main();
