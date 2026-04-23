import { describe, it, expect } from "vitest";
import { cleanupSubmission } from "./cleanup";

const base = () => ({
  schema_version: 2,
  slug: "lido",
  slice: "ability-to-exit",
  snapshot_generated_at: "2026-04-22T22:09:47.359Z",
  prompt_version: 5,
  analysis_date: "2026-04-23",
  model: "gemini-3.1-pro",
  chat_url: null,
  grade: "orange",
  headline: "x",
  rationale: { findings: [], steelman: { red: "a", orange: "b", green: "c" }, verdict: "x" },
  evidence: [] as Array<{ url: string; shows: string }>,
  unknowns: [],
});

describe("cleanupSubmission", () => {
  it("auto-strips [X](X) when inner equals outer", () => {
    const input = base();
    input.evidence = [
      {
        url: "[https://etherscan.io/address/0xABC](https://etherscan.io/address/0xABC)",
        shows: "y",
      },
    ];
    const { cleaned, changes, errors } = cleanupSubmission(input);
    expect(errors).toEqual([]);
    expect(changes).toContain("stripped markdown wrapper from evidence[0].url");
    expect((cleaned as typeof input).evidence[0]!.url).toBe(
      "https://etherscan.io/address/0xABC",
    );
  });

  it("rejects [label](url) where inner differs — reports error, leaves value", () => {
    const input = base();
    input.evidence = [
      {
        url: "[Etherscan: 0xABC](https://etherscan.io/address/0xABC)",
        shows: "y",
      },
    ];
    const { cleaned, errors } = cleanupSubmission(input);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/labeled markdown link/);
    expect((cleaned as typeof input).evidence[0]!.url).toContain("[Etherscan");
  });

  it("leaves bare URLs untouched", () => {
    const input = base();
    input.evidence = [{ url: "https://etherscan.io/address/0xABC", shows: "y" }];
    const { cleaned, changes, errors } = cleanupSubmission(input);
    expect(errors).toEqual([]);
    expect(changes).toEqual([]);
    expect((cleaned as typeof input).evidence[0]!.url).toBe(
      "https://etherscan.io/address/0xABC",
    );
  });

  it("normalizes CRLF to LF and strips trailing whitespace", () => {
    const input = base();
    input.rationale.verdict = "line one  \r\nline two\t\r\n";
    const { cleaned, changes } = cleanupSubmission(input);
    expect((cleaned as typeof input).rationale.verdict).toBe("line one\nline two");
    expect(changes.some((c) => c.includes("whitespace"))).toBe(true);
  });
});
