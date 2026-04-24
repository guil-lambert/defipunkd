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
  model: "claude-sonnet-4-6",
  chat_url: null,
  grade: "orange",
  headline: "x",
  rationale: { findings: [], steelman: { red: "a", orange: "b", green: "c" }, verdict: "x" },
  evidence: [{ url: "https://etherscan.io/address/0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1", shows: "y" }],
  unknowns: [],
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
