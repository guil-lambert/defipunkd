import type {
  AssessmentSliceId,
  LoadedAssessment,
  LoadedSubmission,
  Protocol,
} from "@defipunkd/registry";
import {
  assessConfidence,
  isHallucinationProneModel,
  isThinkingModel,
} from "./confidence";
import { PIZZA_SLICES, type PizzaSliceId } from "./pizza";
import { assessProtocol, cexAssessment } from "./rationale";
import { deriveTier, maxTier, TIER_RANK, type Tier, type TierInput } from "./tier";

export type CoverageState = "none" | "insufficient" | "disagreement" | "weak" | "strong";

export type ModelFamily = "claude" | "gpt" | "gemini" | "grok" | "other";

/** Submission quality bucket — mirrors the quorum penalty tiers:
 *  - "low":  hallucination-prone (×0.05, 20× penalty)
 *  - "med":  non-thinking         (×0.2,  5× penalty)
 *  - "high": thinking              (no penalty) */
export type ModelQuality = "low" | "med" | "high";

export type GradeBucket = {
  red: number;
  orange: number;
  green: number;
  unknown: number;
};

export type CoverageRow = {
  slug: string;
  name: string;
  logo: string | null;
  tier: Tier;
  /** Set when the protocol is a child rendered under its parent's family
   *  page; deep-links must target /protocol/{parent_slug}#{slug}-{slice}
   *  because the bare /protocol/{slug} URL 301-redirects to the parent
   *  with `#{slug}` and drops the original hash. */
  parent_slug: string | null;
  submissionCount: number;
  cells: Record<PizzaSliceId, CoverageState>;
};

export type MostReviewed = {
  slug: string;
  name: string;
  logo: string | null;
  submissionCount: number;
};

export type ModelBreakdownEntry = {
  model: string;
  family: ModelFamily;
  quality: ModelQuality;
  count: number;
};

export type Stats = {
  totalProtocols: number;
  reviewedProtocols: number;
  totalSubmissions: number;
  tierCounts: Record<Tier, number>;
  tvlByTier: Record<Tier, number>;
  totalTvl: number;
  /** True when an "Ungraded" segment (`tier === "none"`) dominates the stacked
   *  bar so much that the page should render an axis break to keep the graded
   *  tiers visible. Page-side renderer caps the segment width when this is on. */
  needsAxisBreak: { count: boolean; tvl: boolean; gradeBySlice: Record<PizzaSliceId, boolean> };
  mostReviewed: MostReviewed[];
  modelBreakdown: ModelBreakdownEntry[];
  /** Counts only among protocols that have an assessment for that slice.
   *  Excludes the long tail of unreviewed protocols. */
  gradeBySlice: Record<PizzaSliceId, GradeBucket>;
  coverage: CoverageRow[];
};

const EMPTY_TIER_COUNTS = (): Record<Tier, number> => ({
  none: 0,
  wood: 0,
  bronze: 0,
  silver: 0,
  gold: 0,
});

const EMPTY_GRADE_BUCKET = (): GradeBucket => ({
  red: 0,
  orange: 0,
  green: 0,
  unknown: 0,
});

export function modelFamily(model: string): ModelFamily {
  const m = model.toLowerCase();
  if (m.includes("claude")) return "claude";
  if (m.includes("gpt") || m.includes("openai")) return "gpt";
  if (m.includes("gemini")) return "gemini";
  if (m.includes("grok")) return "grok";
  return "other";
}

export function modelQuality(model: string): ModelQuality {
  if (isHallucinationProneModel(model)) return "low";
  if (isThinkingModel(model)) return "high";
  return "med";
}

function isLive(p: Protocol): boolean {
  if (p.delisted_at) return false;
  if (p.is_dead) return false;
  return true;
}

function tierInputFor(
  slug: string,
  assessments: Map<string, Map<AssessmentSliceId, LoadedAssessment>>,
  submissions: Map<string, Map<AssessmentSliceId, LoadedSubmission[]>>,
): TierInput | undefined {
  const bySlice = assessments.get(slug);
  const subBySlice = submissions.get(slug);
  if (!bySlice && !subBySlice) return undefined;
  const out: TierInput = {};
  if (bySlice) {
    for (const [sliceId, a] of bySlice.entries()) {
      const conf = assessConfidence(a.consensus_sources, a.strength);
      out[sliceId as PizzaSliceId] = {
        models: a.models,
        merged_at: a.merged_at,
        human_signoff: a.human_signoff ?? null,
        tentative: conf.tentative,
      };
    }
  }
  if (subBySlice) {
    for (const [sliceId, arr] of subBySlice.entries()) {
      const existing = out[sliceId as PizzaSliceId] ?? {};
      out[sliceId as PizzaSliceId] = { ...existing, submissionCount: arr.length };
    }
  }
  return out;
}

function coverageCell(
  slug: string,
  slice: PizzaSliceId,
  assessments: Map<string, Map<AssessmentSliceId, LoadedAssessment>>,
  submissions: Map<string, Map<AssessmentSliceId, LoadedSubmission[]>>,
): CoverageState {
  const a = assessments.get(slug)?.get(slice);
  if (a) {
    // Mirror the protocol page: a strong-strength consensus that the
    // confidence check flags as tentative (low share-URL coverage, total
    // weight below floor, hallucination-heavy weight, …) renders dashed
    // there, so the matrix must not advertise it as "strong consensus".
    const conf = assessConfidence(a.consensus_sources, a.strength);
    if (a.strength === "strong" && !conf.tentative) return "strong";
    return "weak";
  }
  const subs = submissions.get(slug)?.get(slice) ?? [];
  if (subs.length === 0) return "none";
  // Mirrors the quorum cutoff in packages/validator/src/quorum.ts: <2 submissions
  // means the validator returned "insufficient"; ≥2 with no merged consensus
  // file means the validator returned "disagreement".
  if (subs.length < 2) return "insufficient";
  return "disagreement";
}

function submissionCountFor(
  slug: string,
  submissions: Map<string, Map<AssessmentSliceId, LoadedSubmission[]>>,
): number {
  const bySlice = submissions.get(slug);
  if (!bySlice) return 0;
  let n = 0;
  for (const arr of bySlice.values()) n += arr.length;
  return n;
}

/** Mirror of buildNodes() + tabCountsFromNodes() in landing.ts: collapse
 *  parent/child pairs across ALL protocols (so a child of a dead parent
 *  still nests), then return the live top-level entries with summed TVL
 *  and the best tier across the family. */
function topLevelView(
  protocols: Protocol[],
  tierBySlug: Map<string, Tier>,
): { slugs: string[]; tvlBySlug: Map<string, number | null>; tierBySlug: Map<string, Tier> } {
  const bySlug = new Map<string, Protocol>();
  for (const p of protocols) bySlug.set(p.slug, p);

  const childrenByParent = new Map<string, Protocol[]>();
  for (const p of protocols) {
    if (p.is_parent) continue;
    if (!p.parent_slug) continue;
    if (!bySlug.has(p.parent_slug)) continue;
    const bucket = childrenByParent.get(p.parent_slug) ?? [];
    bucket.push(p);
    childrenByParent.set(p.parent_slug, bucket);
  }

  const nested = new Set<string>();
  const slugs: string[] = [];
  const tvlBySlugOut = new Map<string, number | null>();
  const tierOut = new Map<string, Tier>();

  for (const p of protocols) {
    if (!p.is_parent) continue;
    const kids = childrenByParent.get(p.slug);
    if (!kids || kids.length === 0) continue;
    for (const k of kids) nested.add(k.slug);
    if (!isLive(p)) continue;
    let total = 0;
    let any = false;
    for (const k of kids) {
      if (typeof k.tvl === "number") {
        total += k.tvl;
        any = true;
      }
    }
    slugs.push(p.slug);
    tvlBySlugOut.set(p.slug, any ? total : null);
    const ownTier = tierBySlug.get(p.slug) ?? "none";
    const kidTiers = kids.map((k) => tierBySlug.get(k.slug) ?? "none");
    tierOut.set(p.slug, maxTier([ownTier, ...kidTiers]));
  }

  for (const p of protocols) {
    if (p.is_parent) continue;
    if (nested.has(p.slug)) continue;
    if (!isLive(p)) continue;
    slugs.push(p.slug);
    tvlBySlugOut.set(p.slug, p.tvl);
    tierOut.set(p.slug, tierBySlug.get(p.slug) ?? "none");
  }

  return { slugs, tvlBySlug: tvlBySlugOut, tierBySlug: tierOut };
}

export function buildStats(
  protocols: Protocol[],
  assessments: Map<string, Map<AssessmentSliceId, LoadedAssessment>>,
  submissions: Map<string, Map<AssessmentSliceId, LoadedSubmission[]>>,
): Stats {
  const live = protocols.filter(isLive);

  const perProtoTier = new Map<string, Tier>();
  for (const p of protocols) {
    perProtoTier.set(p.slug, deriveTier(tierInputFor(p.slug, assessments, submissions)));
  }
  const top = topLevelView(protocols, perProtoTier);

  const tierCounts = EMPTY_TIER_COUNTS();
  const tvlByTier = EMPTY_TIER_COUNTS();
  let totalTvl = 0;
  for (const slug of top.slugs) {
    const tier = top.tierBySlug.get(slug) ?? "none";
    tierCounts[tier] += 1;
    const tvl = top.tvlBySlug.get(slug);
    if (typeof tvl === "number") {
      totalTvl += tvl;
      tvlByTier[tier] += tvl;
    }
  }

  const subCountBySlug = new Map<string, number>();
  for (const p of live) subCountBySlug.set(p.slug, submissionCountFor(p.slug, submissions));

  let reviewedProtocols = 0;
  for (const n of subCountBySlug.values()) if (n > 0) reviewedProtocols += 1;

  const mostReviewed: MostReviewed[] = live
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      logo: p.logo,
      submissionCount: subCountBySlug.get(p.slug) ?? 0,
    }))
    .filter((r) => r.submissionCount > 0)
    .sort((a, b) => b.submissionCount - a.submissionCount || a.slug.localeCompare(b.slug))
    .slice(0, 10);

  const modelCounts = new Map<string, number>();
  let totalSubmissions = 0;
  for (const bySlice of submissions.values()) {
    for (const arr of bySlice.values()) {
      for (const s of arr) {
        modelCounts.set(s.model, (modelCounts.get(s.model) ?? 0) + 1);
        totalSubmissions += 1;
      }
    }
  }
  const modelBreakdown: ModelBreakdownEntry[] = Array.from(modelCounts.entries())
    .map(([model, count]) => ({
      model,
      family: modelFamily(model),
      quality: modelQuality(model),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model));

  // Walk every top-level live entry's slice list (rule-based + AI overrides)
  // so verifiability/autonomy report wide coverage. Parents inherit their
  // biggest live child's slice grades, mirroring index.astro's logic so the
  // count totals match the live-protocol count rendered in the header.
  const bySlugMap = new Map<string, Protocol>();
  for (const p of protocols) bySlugMap.set(p.slug, p);
  const liveChildrenByParent = new Map<string, Protocol[]>();
  for (const p of live) {
    if (p.is_parent || !p.parent_slug) continue;
    if (!bySlugMap.has(p.parent_slug)) continue;
    const bucket = liveChildrenByParent.get(p.parent_slug) ?? [];
    bucket.push(p);
    liveChildrenByParent.set(p.parent_slug, bucket);
  }
  const gradeSource = (slug: string): Protocol | null => {
    const p = bySlugMap.get(slug);
    if (!p) return null;
    if (!p.is_parent) return p;
    const kids = liveChildrenByParent.get(slug) ?? [];
    if (kids.length === 0) return p;
    return [...kids].sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1))[0]!;
  };
  const gradeBySlice = {} as Record<PizzaSliceId, GradeBucket>;
  for (const { id } of PIZZA_SLICES) gradeBySlice[id] = EMPTY_GRADE_BUCKET();
  for (const slug of top.slugs) {
    const src = gradeSource(slug);
    if (!src) continue;
    const bySlice = assessments.get(src.slug);
    const subBySlice = submissions.get(src.slug);
    const sliceList = src.category === "CEX" ? cexAssessment() : assessProtocol(src, bySlice, subBySlice);
    for (const s of sliceList) {
      const bucket = gradeBySlice[s.id as PizzaSliceId];
      const key = s.grade === "gray" ? "unknown" : s.grade;
      bucket[key] += 1;
    }
  }

  const coverage: CoverageRow[] = live
    .filter((p) => assessments.has(p.slug) || submissions.has(p.slug))
    .map((p) => {
      const cells = {} as Record<PizzaSliceId, CoverageState>;
      for (const { id } of PIZZA_SLICES) {
        cells[id] = coverageCell(p.slug, id, assessments, submissions);
      }
      return {
        slug: p.slug,
        name: p.name,
        logo: p.logo,
        tier: perProtoTier.get(p.slug) ?? "none",
        parent_slug: p.parent_slug && bySlugMap.has(p.parent_slug) ? p.parent_slug : null,
        submissionCount: subCountBySlug.get(p.slug) ?? 0,
        cells,
      };
    })
    .sort((a, b) => {
      const t = TIER_RANK[b.tier] - TIER_RANK[a.tier];
      if (t !== 0) return t;
      const s = b.submissionCount - a.submissionCount;
      if (s !== 0) return s;
      return a.slug.localeCompare(b.slug);
    });

  // Axis break is needed when the "none" segment would dominate a stacked bar.
  // We cap at "graded outweighs ungraded by ≥2x" so the rest of the segments
  // stay visible without misrepresenting the relative proportions of the
  // graded tiers themselves.
  const gradedCount =
    tierCounts.wood + tierCounts.bronze + tierCounts.silver + tierCounts.gold;
  const gradedTvl = tvlByTier.wood + tvlByTier.bronze + tvlByTier.silver + tvlByTier.gold;
  const sliceAxisBreak = {} as Record<PizzaSliceId, boolean>;
  for (const { id } of PIZZA_SLICES) {
    const b = gradeBySlice[id as PizzaSliceId];
    const colored = b.red + b.orange + b.green;
    sliceAxisBreak[id as PizzaSliceId] = colored > 0 && b.unknown > colored * 2;
  }
  const needsAxisBreak = {
    count: gradedCount > 0 && tierCounts.none > gradedCount * 2,
    tvl: gradedTvl > 0 && tvlByTier.none > gradedTvl * 2,
    gradeBySlice: sliceAxisBreak,
  };

  return {
    totalProtocols: top.slugs.length,
    reviewedProtocols,
    totalSubmissions,
    tierCounts,
    tvlByTier,
    totalTvl,
    needsAxisBreak,
    mostReviewed,
    modelBreakdown,
    gradeBySlice,
    coverage,
  };
}
