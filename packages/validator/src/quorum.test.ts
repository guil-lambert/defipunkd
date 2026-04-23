import { describe, it, expect } from "vitest";
import { computeQuorum, type QuorumContext } from "./quorum";
import type { Submission } from "./schema";

const ctx: QuorumContext = {
  currentPromptVersion: 4,
  currentSnapshotGeneratedAt: "2026-04-22T22:09:47.359Z",
  now: "2026-04-23T12:00:00Z",
};

function mkSub(over: Partial<Submission> = {}): Submission {
  return {
    schema_version: 1,
    slug: "lido",
    slice: "ability-to-exit",
    snapshot_generated_at: "2026-04-22T22:09:47.359Z",
    prompt_version: 4,
    analysis_date: "2026-04-23",
    model: "claude-sonnet-4-6",
    chat_url: null,
    grade: "orange",
    headline: "x",
    rationale: "x",
    evidence: [{ url: "https://etherscan.io/address/0x1", shows: "y" }],
    unknowns: [],
    ...over,
  };
}

const withPath = (s: Submission, p: string) => ({ submission: s, sourcePath: p });

describe("computeQuorum", () => {
  it("is insufficient with 0 or 1 submissions", () => {
    expect(computeQuorum([], ctx).kind).toBe("insufficient");
    expect(computeQuorum([withPath(mkSub(), "a.json")], ctx).kind).toBe("insufficient");
  });

  it("2/2 agreement is weak consensus", () => {
    const r = computeQuorum(
      [
        withPath(mkSub({ model: "a" }), "a.json"),
        withPath(mkSub({ model: "b" }), "b.json"),
      ],
      ctx,
    );
    expect(r.kind).toBe("assessment");
    if (r.kind === "assessment") {
      expect(r.assessment.consensus_strength).toBe("weak");
      expect(r.assessment.consensus_grade).toBe("orange");
    }
  });

  it("3/3 agreement is strong consensus", () => {
    const r = computeQuorum(
      [
        withPath(mkSub({ model: "a" }), "a.json"),
        withPath(mkSub({ model: "b" }), "b.json"),
        withPath(mkSub({ model: "c" }), "c.json"),
      ],
      ctx,
    );
    expect(r.kind).toBe("assessment");
    if (r.kind === "assessment") {
      expect(r.assessment.consensus_strength).toBe("strong");
      expect(r.assessment.merged_from).toHaveLength(3);
    }
  });

  it("2/3 disagreement with one dissenter yields weak consensus for the majority", () => {
    const r = computeQuorum(
      [
        withPath(mkSub({ model: "a", grade: "orange" }), "a.json"),
        withPath(mkSub({ model: "b", grade: "orange" }), "b.json"),
        withPath(mkSub({ model: "c", grade: "red" }), "c.json"),
      ],
      ctx,
    );
    expect(r.kind).toBe("assessment");
    if (r.kind === "assessment") {
      expect(r.assessment.consensus_grade).toBe("orange");
      expect(r.assessment.consensus_strength).toBe("weak");
    }
  });

  it("1/1/1 three-way split is a disagreement", () => {
    const r = computeQuorum(
      [
        withPath(mkSub({ model: "a", grade: "orange" }), "a.json"),
        withPath(mkSub({ model: "b", grade: "red" }), "b.json"),
        withPath(mkSub({ model: "c", grade: "green", evidence: [{ url: "https://etherscan.io/x", shows: "y" }] }), "c.json"),
      ],
      ctx,
    );
    expect(r.kind).toBe("disagreement");
  });

  it("gives a weight bonus for public chat_url on a claude.ai share link", () => {
    const r = computeQuorum(
      [
        withPath(mkSub({ model: "with-share", chat_url: "https://claude.ai/share/abc" }), "a.json"),
        withPath(mkSub({ model: "without-share" }), "b.json"),
      ],
      ctx,
    );
    expect(r.kind).toBe("assessment");
    if (r.kind === "assessment") {
      const withShare = r.assessment.merged_from.find((m) => m.model === "with-share")!;
      const without = r.assessment.merged_from.find((m) => m.model === "without-share")!;
      expect(withShare.weight).toBeGreaterThan(without.weight);
      expect(r.assessment.primary_submission_path).toBe("a.json");
    }
  });

  it("penalizes older prompt_version", () => {
    const r = computeQuorum(
      [
        withPath(mkSub({ model: "old", prompt_version: 1 }), "a.json"),
        withPath(mkSub({ model: "new", prompt_version: 4 }), "b.json"),
      ],
      ctx,
    );
    if (r.kind === "assessment") {
      const old = r.assessment.merged_from.find((m) => m.model === "old")!;
      const nw = r.assessment.merged_from.find((m) => m.model === "new")!;
      expect(old.weight).toBeLessThan(nw.weight);
    }
  });

  it("tiebreaks primary submission by highest individual weight", () => {
    const r = computeQuorum(
      [
        withPath(mkSub({ model: "a", evidence: [{ url: "https://docs.example/", shows: "y" }] }), "a.json"),
        withPath(
          mkSub({
            model: "b",
            evidence: [
              { url: "https://etherscan.io/x", shows: "y" },
              { url: "https://basescan.org/x", shows: "y" },
              { url: "https://arbiscan.io/x", shows: "y" },
            ],
          }),
          "b.json",
        ),
      ],
      ctx,
    );
    if (r.kind === "assessment") {
      expect(r.assessment.primary_submission_path).toBe("b.json");
    }
  });
});
