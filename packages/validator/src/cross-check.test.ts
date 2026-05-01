import { describe, it, expect } from "vitest";
import { crossCheck, isExplorerUrl, type CrossCheckContext } from "./cross-check";
import type { Submission } from "./schema";

const sub = (over: Partial<Submission> = {}): Submission => ({
  schema_version: 2,
  slug: "lido",
  slice: "ability-to-exit",
  snapshot_generated_at: "2026-04-22T22:09:47.359Z",
  prompt_version: 5,
  analysis_date: "2026-04-23",
  model: "claude-opus-4-7",
  chat_url: "https://claude.ai/share/test",
  grade: "orange",
  headline: "x",
  rationale: { findings: [], steelman: { red: "a", orange: "b", green: "c" }, verdict: "x" },
  evidence: [{ url: "https://etherscan.io/address/0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1", shows: "y", fetched_at: "2026-04-23T00:00:00Z" }],
  unknowns: ["U1: residual"],
  ...over,
});

const ctx = (over: Partial<CrossCheckContext> = {}): CrossCheckContext => ({
  currentPromptVersion: 5,
  currentSnapshotGeneratedAt: "2026-04-22T22:09:47.359Z",
  knownSlugs: new Set(["lido", "aave", "uniswap"]),
  filePath: "data/submissions/lido/ability-to-exit/claude-sonnet-4-6-2026-04-23-a9b2.json",
  ...over,
});

describe("crossCheck", () => {
  it("accepts a fully-pinned submission", () => {
    expect(crossCheck(sub(), ctx())).toEqual([]);
  });

  it("errors on unknown slug", () => {
    const issues = crossCheck(sub({ slug: "does-not-exist" }), ctx({ filePath: null }));
    expect(issues.some((i) => i.severity === "error" && i.field === "slug")).toBe(true);
  });

  it("errors when slug field doesn't match directory", () => {
    const issues = crossCheck(sub({ slug: "lido" }), ctx({ filePath: "data/submissions/aave/ability-to-exit/x.json", knownSlugs: new Set(["lido", "aave"]) }));
    expect(issues.some((i) => i.field === "slug" && /does not match parent directory/.test(i.message))).toBe(true);
  });

  it("errors when prompt_version is from the future", () => {
    const issues = crossCheck(sub({ prompt_version: 99 }), ctx());
    expect(issues.some((i) => i.severity === "error" && i.field === "prompt_version")).toBe(true);
  });

  it("warns when prompt_version is older", () => {
    const issues = crossCheck(sub({ prompt_version: 1 }), ctx());
    expect(issues.some((i) => i.severity === "warning" && i.field === "prompt_version")).toBe(true);
  });

  it("warns when snapshot pin does not match current", () => {
    const issues = crossCheck(sub(), ctx({ currentSnapshotGeneratedAt: "2026-05-01T00:00:00.000Z" }));
    expect(issues.some((i) => i.field === "snapshot_generated_at")).toBe(true);
  });

  it("warns on on-chain slice with no explorer URL", () => {
    const issues = crossCheck(
      sub({ evidence: [{ url: "https://github.com/lidofinance/core", shows: "y" }] }),
      ctx(),
    );
    expect(issues.some((i) => i.field === "evidence" && /block-explorer/.test(i.message))).toBe(true);
  });

  it("does not require explorer URL on the open access slice", () => {
    const issues = crossCheck(
      sub({ slice: "open-access", evidence: [{ url: "https://lido.fi/terms", shows: "y" }], grade: "green", headline: "permissionless", rationale: { findings: [], steelman: { red: "a", orange: "b", green: "c" }, verdict: "y" } }),
      ctx({ filePath: "data/submissions/lido/open-access/x.json" }),
    );
    expect(issues.some((i) => i.field === "evidence" && /block-explorer/.test(i.message))).toBe(false);
  });

  it("does not require explorer URL when grade is unknown", () => {
    const issues = crossCheck(
      sub({ grade: "unknown", evidence: [], unknowns: ["E1: can't determine"] }),
      ctx(),
    );
    expect(issues.some((i) => i.field === "evidence" && /block-explorer/.test(i.message))).toBe(false);
  });

  it("warns when chat_url is null", () => {
    const issues = crossCheck(sub({ chat_url: null }), ctx());
    expect(issues.some((i) => i.severity === "warning" && i.field === "chat_url")).toBe(true);
  });

  it("warns when chat_url is not a public share URL", () => {
    const issues = crossCheck(sub({ chat_url: "https://example.com/transcript" }), ctx());
    expect(issues.some((i) => i.severity === "warning" && i.field === "chat_url")).toBe(true);
  });

  it("warns when model is hallucination-prone (gemini-3-flash-preview)", () => {
    const issues = crossCheck(sub({ model: "gemini-3-flash-preview" }), ctx());
    expect(issues.some((i) => i.severity === "warning" && i.field === "model" && /hallucination-prone/.test(i.message))).toBe(true);
  });

  it("warns when model is hallucination-prone (claude-haiku-4-5)", () => {
    const issues = crossCheck(sub({ model: "claude-haiku-4-5-20251001" }), ctx());
    expect(issues.some((i) => i.severity === "warning" && i.field === "model" && /hallucination-prone/.test(i.message))).toBe(true);
  });

  it("warns when model is hallucination-prone (gpt-5.3)", () => {
    const issues = crossCheck(sub({ model: "gpt-5.3" }), ctx());
    expect(issues.some((i) => i.severity === "warning" && i.field === "model" && /hallucination-prone/.test(i.message))).toBe(true);
  });

  it("does not warn for thinking-capable models", () => {
    for (const model of ["claude-opus-4-7", "gpt-5.5-thinking", "gemini-3-pro", "o3-mini"]) {
      const issues = crossCheck(sub({ model }), ctx());
      expect(issues.some((i) => i.field === "model")).toBe(false);
    }
  });

  it("warns when model does not run with extended thinking", () => {
    for (const model of ["claude-sonnet-4-6", "gpt-5.5", "gemini-3-flash", "grok-4"]) {
      const issues = crossCheck(sub({ model }), ctx());
      expect(
        issues.some(
          (i) => i.severity === "warning" && i.field === "model" && /extended thinking/.test(i.message),
        ),
      ).toBe(true);
    }
  });

  it("warns when graded evidence lacks fetched_at timestamps", () => {
    const issues = crossCheck(
      sub({
        evidence: [{ url: "https://etherscan.io/address/0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1", shows: "y" }],
      }),
      ctx(),
    );
    expect(issues.some((i) => i.severity === "warning" && i.field === "evidence" && /fetched_at/.test(i.message))).toBe(true);
  });

  it("does not warn about fetched_at when grade is unknown", () => {
    const issues = crossCheck(
      sub({
        grade: "unknown",
        evidence: [],
        unknowns: ["E1: can't determine"],
      }),
      ctx(),
    );
    expect(issues.some((i) => i.field === "evidence" && /fetched_at/.test(i.message))).toBe(false);
  });

  it("warns when graded submission has empty unknowns[]", () => {
    const issues = crossCheck(sub({ unknowns: [] }), ctx());
    expect(issues.some((i) => i.severity === "warning" && i.field === "unknowns" && /residual unknowns/.test(i.message))).toBe(true);
  });

  it("does not warn about empty unknowns when grade is unknown", () => {
    const issues = crossCheck(
      sub({ grade: "unknown", evidence: [], unknowns: ["E1: can't determine"] }),
      ctx(),
    );
    expect(issues.some((i) => i.field === "unknowns")).toBe(false);
  });
});

describe("isExplorerUrl", () => {
  it("matches top explorers", () => {
    expect(isExplorerUrl("https://etherscan.io/address/0x123")).toBe(true);
    expect(isExplorerUrl("https://optimistic.etherscan.io/address/0x123")).toBe(true);
    expect(isExplorerUrl("https://basescan.org/address/0x123")).toBe(true);
    expect(isExplorerUrl("https://arbiscan.io/address/0x123")).toBe(true);
  });

  it("rejects non-explorer URLs", () => {
    expect(isExplorerUrl("https://github.com/x/y")).toBe(false);
    expect(isExplorerUrl("https://docs.lido.fi/")).toBe(false);
    expect(isExplorerUrl("not a url")).toBe(false);
  });
});
