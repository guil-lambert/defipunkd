/**
 * Shared lib for building DeFiPunk'd assessment data consumed by the
 * DeFiLlama browser-extension and the live JSON API routes.
 *
 * Reuses the exact server-side rendering logic the website uses
 * (assessProtocol / deriveTier / getProtocolMetadata) so the extension matches
 * defipunkd.com without reimplementing any grading. One record per protocol
 * that has at least one assessment.
 *
 * The full map is process-memoized (cachedMap) so warm serverless invocations
 * are cheap — the registry already caches its own file reads.
 */
import {
  getAssessments,
  getSubmissions,
  getProtocol,
  getProtocolMetadata,
  listProtocols,
  type AssessmentSliceId,
} from "@defipunkd/registry";
import { assessProtocol, cexAssessment, type SliceAssessment } from "./rationale.js";
import { deriveTier, TIER_RANK, type TierInput } from "./tier.js";
import { PIZZA_SLICES, type PizzaSliceId } from "./pizza.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SliceRecord = {
  id: PizzaSliceId;
  label: string;
  grade: string; // green | orange | red | gray
  tentative: boolean;
  partial: boolean;
  modelsCount: number;
  shortHeadline: string | null;
  verdict: string | null;
};

export type FamilyEntry = {
  slug: string;
  name: string;
  tier: string;
  slices: SliceRecord[];
};

export type ProtocolRecord = {
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

// Lightweight index types (drops about/pills/verdict/shortHeadline/modelsCount/family)
export type SliceIndexRecord = {
  id: PizzaSliceId;
  label: string;
  grade: string;
  tentative: boolean;
  partial: boolean;
};

export type IndexRecord = {
  name: string;
  category: string;
  tvl: number | null;
  tier: string;
  slices: SliceIndexRecord[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// DeFiLlama live slugs that differ from our snapshot slugs (rebrands etc.).
// Maps DeFiLlama-slug -> our-snapshot-slug so the overlay still resolves.
export const SLUG_ALIASES: Record<string, string> = {
  sky: "maker", // DeFiLlama "Sky" family is "maker" (+ sky-* children) in our snapshot
  "ether.fi": "ether-fi", // DeFiLlama uses a dot; our snapshot family slug is hyphenated
};

const SLICE_ORDER = PIZZA_SLICES.map((s) => s.id) as PizzaSliceId[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fill grade for the pizza wedge. Mirrors ProtocolSummary.astro `tentativeGrade`:
 * a partial (pre-quorum) slice is filled with the MOST-SEVERE submitted grade
 * (warn first), not left gray. Non-partial slices use their consensus grade.
 */
export function fillGrade(s: SliceAssessment): string {
  if (!s.partial || !s.partialModelGrades || s.partialModelGrades.length === 0) return s.grade;
  const order: Record<string, number> = { red: 0, orange: 1, gray: 2, green: 3 };
  const sorted = [...s.partialModelGrades].sort(
    (a, b) => (order[a.grade] ?? 9) - (order[b.grade] ?? 9),
  );
  return sorted[0]?.grade ?? "gray";
}

export function buildRecord(slug: string): ProtocolRecord | null {
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

// ---------------------------------------------------------------------------
// Map assembly (process-memoized)
// ---------------------------------------------------------------------------

let cachedMap: Record<string, ProtocolRecord> | null = null;

/**
 * Build (or return cached) the full protocol record map.
 * Keys include family parent slugs and slug aliases so a raw DeFiLlama slug
 * resolves directly.
 */
export function buildExtensionMap(): Record<string, ProtocolRecord> {
  if (cachedMap) return cachedMap;

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
  for (const slug of slugs) {
    const rec = getRec(slug);
    if (rec) out[slug] = rec;
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

    const firstEntry = entries[0];
    if (!firstEntry) continue;
    const repRec = getRec(firstEntry.slug)!;
    if (!repRec) continue;
    out[parent.slug] = {
      ...repRec,
      name: parent.name,
      category: parent.category || repRec.category,
      tvl: parent.tvl ?? repRec.tvl,
      family: entries,
    };
  }

  // Slug aliases (rebrands): mirror an existing record under a DeFiLlama-live slug.
  for (const [dst, src] of Object.entries(SLUG_ALIASES)) {
    if (out[dst] || !out[src]) continue;
    out[dst] = out[src];
  }

  cachedMap = out;
  return out;
}

// ---------------------------------------------------------------------------
// Index (lightweight map for the extension fallback)
// ---------------------------------------------------------------------------

/**
 * Strip each ProtocolRecord to the lightweight IndexRecord shape.
 * Drops about, pills, verdict, shortHeadline, modelsCount, family.
 */
export function toIndex(map: Record<string, ProtocolRecord>): Record<string, IndexRecord> {
  const index: Record<string, IndexRecord> = {};
  for (const [slug, rec] of Object.entries(map)) {
    index[slug] = {
      name: rec.name,
      category: rec.category,
      tvl: rec.tvl,
      tier: rec.tier,
      slices: rec.slices.map((s) => ({
        id: s.id,
        label: s.label,
        grade: s.grade,
        tentative: s.tentative,
        partial: s.partial,
      })),
    };
  }
  return index;
}
