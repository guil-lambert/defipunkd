import { describe, it, expect } from "vitest";
import { buildDraftMaster, MasterSchema } from "./master";
import { computeQuorum } from "./quorum";
import type { Submission } from "./schema";

function mkSub(over: Partial<Submission> = {}): Submission {
  return {
    schema_version: 3,
    slug: "lido",
    slice: "control",
    snapshot_generated_at: "2026-04-22T22:09:47.359Z",
    prompt_version: 6,
    analysis_date: "2026-04-23",
    model: "claude-sonnet-4-6",
    chat_url: null,
    grade: "orange",
    headline: "deterministic headline",
    rationale: { findings: [], steelman: { red: "a", orange: "b", green: "c" }, verdict: "x" },
    evidence: [{ url: "https://etherscan.io/address/0x1", shows: "y" }],
    unknowns: [],
    ...over,
  };
}

describe("buildDraftMaster", () => {
  it("produces a schema-valid master with per-slice consensus from deterministic quorum", () => {
    const sA = mkSub({ slice: "control", model: "a" });
    const sB = mkSub({ slice: "control", model: "b" });
    const q = computeQuorum(
      [
        { submission: sA, sourcePath: "a.json" },
        { submission: sB, sourcePath: "b.json" },
      ],
      { currentPromptVersion: 6, currentSnapshotGeneratedAt: sA.snapshot_generated_at, now: "2026-04-23T12:00:00Z" },
    );
    expect(q.kind).toBe("assessment");
    if (q.kind !== "assessment") return;

    const submissionsBySlice = new Map<Submission["slice"], Array<{ submission: Submission; sourcePath: string }>>();
    submissionsBySlice.set("control", [
      { submission: sA, sourcePath: "a.json" },
      { submission: sB, sourcePath: "b.json" },
    ]);
    const assessmentsBySlice = new Map<Submission["slice"], typeof q.assessment>();
    assessmentsBySlice.set("control", q.assessment);

    const master = buildDraftMaster({
      slug: "lido",
      now: "2026-04-23T12:00:00Z",
      submissionsBySlice,
      assessmentsBySlice,
    });

    expect(MasterSchema.safeParse(master).success).toBe(true);
    expect(master.slices.control.grade).toBe("orange");
    expect(master.slices.control.strength).toBe("weak");
    expect(master.source_submissions).toHaveLength(2);
    expect(master.reconciler_kind).toBe("deterministic-fallback");
  });

  it("flags slices with no submissions", () => {
    const submissionsBySlice = new Map<Submission["slice"], Array<{ submission: Submission; sourcePath: string }>>();
    submissionsBySlice.set("control", [{ submission: mkSub(), sourcePath: "a.json" }]);
    const assessmentsBySlice = new Map<Submission["slice"], never>();

    const master = buildDraftMaster({
      slug: "lido",
      now: "2026-04-23T12:00:00Z",
      submissionsBySlice,
      // 4 other slices have no assessments and no submissions
      assessmentsBySlice: assessmentsBySlice as unknown as Map<Submission["slice"], ReturnType<typeof computeQuorum> extends { kind: "assessment"; assessment: infer A } ? A : never>,
    });
    expect(master.flags.some((f) => f.includes("ability-to-exit") && f.includes("no submissions"))).toBe(true);
    expect(master.slices.dependencies.grade).toBe("unknown");
  });

  it("merges protocol_metadata across all slices", () => {
    const submissionsBySlice = new Map<Submission["slice"], Array<{ submission: Submission; sourcePath: string }>>();
    submissionsBySlice.set("control", [
      {
        submission: mkSub({
          slice: "control",
          protocol_metadata: { docs_url: "https://docs.lido.fi", upgradeability: "upgradeable" },
        }),
        sourcePath: "a.json",
      },
    ]);
    submissionsBySlice.set("verifiability", [
      {
        submission: mkSub({
          slice: "verifiability",
          protocol_metadata: { github: ["https://github.com/lidofinance/lido-dao"] },
        }),
        sourcePath: "v.json",
      },
    ]);

    const master = buildDraftMaster({
      slug: "lido",
      now: "2026-04-23T12:00:00Z",
      submissionsBySlice,
      assessmentsBySlice: new Map(),
    });

    expect(master.protocol_metadata.docs_url).toBe("https://docs.lido.fi");
    expect(master.protocol_metadata.upgradeability).toBe("upgradeable");
    expect(master.protocol_metadata.github).toEqual(["https://github.com/lidofinance/lido-dao"]);
  });
});
