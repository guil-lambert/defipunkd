import { describe, it, expect } from "vitest";
import { computeQuorum, type QuorumContext } from "./quorum";
import type { Submission } from "./schema";

const ctx: QuorumContext = {
  currentPromptVersion: 5,
  currentSnapshotGeneratedAt: "2026-04-22T22:09:47.359Z",
  now: "2026-04-23T12:00:00Z",
};

function mkSub(over: Partial<Submission> = {}): Submission {
  return {
    schema_version: 2,
    slug: "lido",
    slice: "ability-to-exit",
    snapshot_generated_at: "2026-04-22T22:09:47.359Z",
    prompt_version: 5,
    analysis_date: "2026-04-23",
    model: "claude-sonnet-4-6",
    chat_url: "https://claude.ai/share/test",
    grade: "orange",
    headline: "x",
    rationale: { findings: [], steelman: { red: "a", orange: "b", green: "c" }, verdict: "x" },
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

  it("penalizes missing chat_url by 95%: submission with share link outweighs one without", () => {
    const r = computeQuorum(
      [
        withPath(mkSub({ model: "with-share", chat_url: "https://claude.ai/share/abc" }), "a.json"),
        withPath(mkSub({ model: "without-share", chat_url: null }), "b.json"),
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

  it("rewards evidence entries with fetched_at timestamps (signals actual browsing)", () => {
    const r = computeQuorum(
      [
        withPath(
          mkSub({
            model: "fetched",
            evidence: [
              { url: "https://etherscan.io/address/0x1", shows: "y", fetched_at: "2026-04-23T10:00:00Z" },
              { url: "https://etherscan.io/address/0x2", shows: "y", fetched_at: "2026-04-23T10:01:00Z" },
              { url: "https://etherscan.io/address/0x3", shows: "y", fetched_at: "2026-04-23T10:02:00Z" },
            ],
          }),
          "a.json",
        ),
        withPath(
          mkSub({
            model: "no-fetch",
            evidence: [
              { url: "https://etherscan.io/address/0x1", shows: "y" },
              { url: "https://etherscan.io/address/0x2", shows: "y" },
              { url: "https://etherscan.io/address/0x3", shows: "y" },
            ],
          }),
          "b.json",
        ),
      ],
      ctx,
    );
    if (r.kind === "assessment") {
      const fetched = r.assessment.merged_from.find((m) => m.model === "fetched")!;
      const noFetch = r.assessment.merged_from.find((m) => m.model === "no-fetch")!;
      expect(fetched.weight).toBeGreaterThan(noFetch.weight);
    }
  });

  it("rewards non-empty unknowns[] as a self-awareness signal (when grade is not 'unknown')", () => {
    const r = computeQuorum(
      [
        withPath(mkSub({ model: "with-unknowns", unknowns: ["C3: did not read minDelay on-chain"] }), "a.json"),
        withPath(mkSub({ model: "claims-omniscient", unknowns: [] }), "b.json"),
      ],
      ctx,
    );
    if (r.kind === "assessment") {
      const selfAware = r.assessment.merged_from.find((m) => m.model === "with-unknowns")!;
      const silent = r.assessment.merged_from.find((m) => m.model === "claims-omniscient")!;
      expect(selfAware.weight).toBeGreaterThan(silent.weight);
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

  it("merges protocol_metadata across submissions (union arrays, consensus scalars)", () => {
    const r = computeQuorum(
      [
        withPath(
          mkSub({
            model: "a",
            protocol_metadata: {
              github: ["https://github.com/org/a"],
              docs_url: "https://docs.a",
              upgradeability: "upgradeable",
              admin_addresses: [{ chain: "Ethereum", address: "0x1111111111111111111111111111111111111111", role: "owner", actor_class: "multisig" }],
              audits: [{ firm: "ToB", url: "https://tob.example/r.pdf" }],
            },
          }),
          "a.json",
        ),
        withPath(
          mkSub({
            model: "b",
            protocol_metadata: {
              github: ["https://github.com/org/a", "https://github.com/org/b"],
              docs_url: "https://docs.a",
              upgradeability: "upgradeable",
            },
          }),
          "b.json",
        ),
        withPath(
          mkSub({
            model: "c",
            protocol_metadata: {
              bug_bounty_url: "https://immunefi.com/bounty/x",
              upgradeability: "mixed",
            },
          }),
          "c.json",
        ),
      ],
      ctx,
    );
    expect(r.kind).toBe("assessment");
    if (r.kind === "assessment") {
      const md = r.assessment.protocol_metadata!;
      expect(md.github).toEqual(expect.arrayContaining(["https://github.com/org/a", "https://github.com/org/b"]));
      expect(md.github).toHaveLength(2);
      expect(md.docs_url).toBe("https://docs.a");
      // 2/3 say upgradeable, 1/3 says mixed → majority wins
      expect(md.upgradeability).toBe("upgradeable");
      expect(md.bug_bounty_url).toBe("https://immunefi.com/bounty/x");
      expect(md.admin_addresses).toHaveLength(1);
      expect(md.audits).toHaveLength(1);
      expect(r.assessment.schema_version).toBe(3);
    }
  });

  it("omits protocol_metadata when no submissions provide it", () => {
    const r = computeQuorum(
      [withPath(mkSub({ model: "a" }), "a.json"), withPath(mkSub({ model: "b" }), "b.json")],
      ctx,
    );
    if (r.kind === "assessment") {
      expect(r.assessment.protocol_metadata).toBeUndefined();
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
