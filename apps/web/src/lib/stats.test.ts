import { describe, expect, it } from "vitest";
import type {
  AssessmentSliceId,
  LoadedAssessment,
  LoadedSubmission,
  Protocol,
} from "@defipunkd/registry";
import { buildStats, modelFamily } from "./stats";

const proto = (over: Partial<Protocol> = {}): Protocol =>
  ({
    slug: "x",
    name: "X",
    category: "Lending",
    chains: ["Ethereum"],
    tvl: 100,
    tvl_by_chain: {},
    website: null,
    twitter: null,
    github: null,
    audit_count: 0,
    audit_links: [],
    hallmarks: [],
    parent_slug: null,
    forked_from: null,
    logo: null,
    is_dead: false,
    is_parent: false,
    first_seen_at: "2026-01-01T00:00:00Z",
    last_seen_at: "2026-04-30T00:00:00Z",
    delisted_at: null,
    module: null,
    _provenance: {},
    ...over,
  } as Protocol);

const assess = (over: Partial<LoadedAssessment> = {}): LoadedAssessment => ({
  slug: "x",
  slice: "control",
  grade: "green",
  strength: "strong",
  headline: "h",
  rationale: { findings: [], steelman: null, verdict: "v" },
  models: ["m1", "m2", "m3"],
  models_with_chat_url: 3,
  model_sources: [],
  consensus_sources: [
    { model: "claude-sonnet-4-6", chat_url: "https://claude.ai/share/x", weight: 1 },
    { model: "gpt-5.5-thinking", chat_url: "https://chatgpt.com/share/y", weight: 1 },
    { model: "gemini-3-pro", chat_url: "https://gemini.google.com/share/z", weight: 1 },
  ],
  ...over,
});

const submission = (over: Partial<LoadedSubmission> = {}): LoadedSubmission => ({
  slug: "x",
  slice: "control",
  model: "claude-sonnet-4-6",
  chat_url: null,
  grade: "green",
  headline: "h",
  rationale: { findings: [], steelman: null, verdict: "v" },
  evidence: [],
  source_path: "data/submissions/x/control/models-2026-04-30.json",
  ...over,
});

function aMap(
  rows: Array<[slug: string, slice: AssessmentSliceId, a: LoadedAssessment]>,
): Map<string, Map<AssessmentSliceId, LoadedAssessment>> {
  const m = new Map<string, Map<AssessmentSliceId, LoadedAssessment>>();
  for (const [slug, slice, a] of rows) {
    if (!m.has(slug)) m.set(slug, new Map());
    m.get(slug)!.set(slice, a);
  }
  return m;
}

function sMap(
  rows: Array<[slug: string, slice: AssessmentSliceId, ss: LoadedSubmission[]]>,
): Map<string, Map<AssessmentSliceId, LoadedSubmission[]>> {
  const m = new Map<string, Map<AssessmentSliceId, LoadedSubmission[]>>();
  for (const [slug, slice, ss] of rows) {
    if (!m.has(slug)) m.set(slug, new Map());
    m.get(slug)!.set(slice, ss);
  }
  return m;
}

describe("modelFamily", () => {
  it("buckets common model names", () => {
    expect(modelFamily("claude-sonnet-4-6")).toBe("claude");
    expect(modelFamily("gpt-5.5-thinking")).toBe("gpt");
    expect(modelFamily("openai-o1")).toBe("gpt");
    expect(modelFamily("gemini-3-pro")).toBe("gemini");
    expect(modelFamily("grok-4")).toBe("grok");
    expect(modelFamily("Mistral-Large")).toBe("other");
  });
});

describe("buildStats", () => {
  it("ignores delisted/dead protocols", () => {
    const protocols = [
      proto({ slug: "live", tvl: 100 }),
      proto({ slug: "dead", tvl: 50, is_dead: true }),
      proto({ slug: "delisted", tvl: 25, delisted_at: "2026-04-01" }),
    ];
    const stats = buildStats(protocols, aMap([]), sMap([]));
    expect(stats.totalProtocols).toBe(1);
    expect(stats.totalTvl).toBe(100);
    expect(stats.tierCounts.none).toBe(1);
  });

  it("collapses parent/child pairs into a single top-level entry", () => {
    const protocols = [
      proto({ slug: "uniswap", tvl: null, is_parent: true }),
      proto({ slug: "uniswap-v2", tvl: 100, parent_slug: "uniswap" }),
      proto({ slug: "uniswap-v3", tvl: 300, parent_slug: "uniswap" }),
      proto({ slug: "standalone", tvl: 50 }),
    ];
    const stats = buildStats(protocols, aMap([]), sMap([]));
    expect(stats.totalProtocols).toBe(2); // uniswap (parent) + standalone, not the children
    expect(stats.totalTvl).toBe(450); // 100 + 300 + 50, with parent inheriting its kids' TVL
  });

  it("rolls a parent's tier up to the best of its children", () => {
    const protocols = [
      proto({ slug: "p", tvl: null, is_parent: true }),
      proto({ slug: "p-good", tvl: 100, parent_slug: "p" }),
      proto({ slug: "p-bad", tvl: 50, parent_slug: "p" }),
    ];
    const allFive: AssessmentSliceId[] = [
      "control",
      "ability-to-exit",
      "autonomy",
      "open-access",
      "verifiability",
    ];
    const stats = buildStats(
      protocols,
      aMap(allFive.map((s) => ["p-good", s, assess({ slug: "p-good", slice: s })] as const) as never),
      sMap([]),
    );
    expect(stats.tierCounts.gold).toBe(1); // parent inherits child's gold tier
    expect(stats.tvlByTier.gold).toBe(150);
  });

  it("counts submissions and ranks most-reviewed", () => {
    const protocols = [proto({ slug: "a" }), proto({ slug: "b" }), proto({ slug: "c" })];
    const stats = buildStats(
      protocols,
      aMap([]),
      sMap([
        ["a", "control", [submission({ slug: "a", model: "claude-sonnet-4-6" }), submission({ slug: "a", model: "gpt-5.5" })]],
        ["a", "autonomy", [submission({ slug: "a", model: "gemini-3-pro" })]],
        ["b", "control", [submission({ slug: "b", model: "claude-sonnet-4-6" })]],
      ]),
    );
    expect(stats.totalSubmissions).toBe(4);
    expect(stats.reviewedProtocols).toBe(2);
    expect(stats.mostReviewed[0]).toEqual({ slug: "a", name: "X", logo: null, submissionCount: 3 });
    expect(stats.mostReviewed[1]).toEqual({ slug: "b", name: "X", logo: null, submissionCount: 1 });
    expect(stats.mostReviewed.find((r) => r.slug === "c")).toBeUndefined();
  });

  it("aggregates model breakdown across all submissions", () => {
    const protocols = [proto({ slug: "a" })];
    const stats = buildStats(
      protocols,
      aMap([]),
      sMap([
        [
          "a",
          "control",
          [
            submission({ model: "claude-sonnet-4-6" }),
            submission({ model: "claude-sonnet-4-6" }),
            submission({ model: "gpt-5.5" }),
          ],
        ],
      ]),
    );
    expect(stats.modelBreakdown[0]).toEqual({
      model: "claude-sonnet-4-6",
      family: "claude",
      quality: "med",
      count: 2,
    });
    expect(stats.modelBreakdown[1]).toEqual({
      model: "gpt-5.5",
      family: "gpt",
      quality: "med",
      count: 1,
    });
  });

  it("tags model quality buckets (low / med / high) on the breakdown", () => {
    const protocols = [proto({ slug: "a" })];
    const stats = buildStats(
      protocols,
      aMap([]),
      sMap([
        [
          "a",
          "control",
          [
            submission({ model: "claude-opus-4-7" }),
            submission({ model: "claude-sonnet-4-6" }),
            submission({ model: "gemini-3-flash-preview" }),
            submission({ model: "gpt-5.5-thinking" }),
            submission({ model: "gemini-3-pro" }),
          ],
        ],
      ]),
    );
    const byModel = new Map(stats.modelBreakdown.map((m) => [m.model, m.quality]));
    expect(byModel.get("claude-opus-4-7")).toBe("high");
    expect(byModel.get("gpt-5.5-thinking")).toBe("high");
    expect(byModel.get("gemini-3-pro")).toBe("high");
    expect(byModel.get("claude-sonnet-4-6")).toBe("med");
    expect(byModel.get("gemini-3-flash-preview")).toBe("low");
  });

  it("derives grade-by-slice across all live protocols (rule-based + AI)", () => {
    // 3 plain protocols: assessProtocol gives them a verifiability grade
    // ("red" for no github+no audits) and "gray" for the unreviewed slices.
    // protocol "a" has an AI assessment for control (green), which overrides.
    const protocols = [
      proto({ slug: "a" }),
      proto({ slug: "b" }),
      proto({ slug: "c" }),
    ];
    const stats = buildStats(
      protocols,
      aMap([["a", "control", assess({ slug: "a", slice: "control", grade: "green" })]]),
      sMap([]),
    );
    // verifiability is rule-based: all three are red (no github, no audits)
    expect(stats.gradeBySlice.verifiability.red).toBe(3);
    expect(stats.gradeBySlice.verifiability.green + stats.gradeBySlice.verifiability.orange).toBe(0);
    // control: 1 green (a) + 2 unknown (b, c)
    expect(stats.gradeBySlice.control.green).toBe(1);
    expect(stats.gradeBySlice.control.unknown).toBe(2);
    // ability-to-exit: all unknown (no AI assessment, no rule-based grade)
    expect(stats.gradeBySlice["ability-to-exit"].unknown).toBe(3);
  });

  it("derives coverage cells: strong / weak / disagreement / insufficient / none", () => {
    const protocols = [proto({ slug: "p" })];
    const stats = buildStats(
      protocols,
      aMap([
        ["p", "control", assess({ slug: "p", slice: "control", strength: "strong" })],
        ["p", "autonomy", assess({ slug: "p", slice: "autonomy", strength: "weak" })],
      ]),
      sMap([
        ["p", "verifiability", [submission({ slug: "p", slice: "verifiability" })]],
        [
          "p",
          "open-access",
          [
            submission({ slug: "p", slice: "open-access", model: "m1" }),
            submission({ slug: "p", slice: "open-access", model: "m2" }),
          ],
        ],
      ]),
    );
    expect(stats.coverage).toHaveLength(1);
    const row = stats.coverage[0]!;
    expect(row.cells.control).toBe("strong");
    expect(row.cells.autonomy).toBe("weak");
    expect(row.cells.verifiability).toBe("insufficient");
    expect(row.cells["open-access"]).toBe("disagreement");
    expect(row.cells["ability-to-exit"]).toBe("none");
  });

  it("flags axis-break when ungraded swamps the graded tiers", () => {
    const protocols: Protocol[] = [];
    for (let i = 0; i < 100; i++) protocols.push(proto({ slug: `u${i}`, tvl: 10 }));
    protocols.push(proto({ slug: "g" }));
    const allFive: AssessmentSliceId[] = [
      "control",
      "ability-to-exit",
      "autonomy",
      "open-access",
      "verifiability",
    ];
    const stats = buildStats(
      protocols,
      aMap(allFive.map((s) => ["g", s, assess({ slug: "g", slice: s })] as const) as never),
      sMap([]),
    );
    expect(stats.needsAxisBreak.count).toBe(true);
    expect(stats.needsAxisBreak.tvl).toBe(true);
  });

  it("does not flag axis-break when ungraded is comparable to graded", () => {
    const protocols = [proto({ slug: "g1" }), proto({ slug: "g2" }), proto({ slug: "u" })];
    const allFive: AssessmentSliceId[] = [
      "control",
      "ability-to-exit",
      "autonomy",
      "open-access",
      "verifiability",
    ];
    const stats = buildStats(
      protocols,
      aMap([
        ...allFive.map((s) => ["g1", s, assess({ slug: "g1", slice: s })] as const),
        ...allFive.map((s) => ["g2", s, assess({ slug: "g2", slice: s })] as const),
      ] as never),
      sMap([]),
    );
    expect(stats.needsAxisBreak.count).toBe(false);
  });
});
