import { describe, expect, it, vi } from "vitest";
import { bucketCategory } from "./category-map";

describe("bucketCategory seed mappings", () => {
  const cases: Array<[string, string]> = [
    ["Lending", "Lending"],
    ["Liquid Lending", "Lending"],
    ["CDP", "CDP"],
    ["Dexes", "DEX"],
    ["DEX Aggregator", "DEX"],
    ["Yield", "Yield"],
    ["Yield Aggregator", "Yield"],
    ["Derivatives", "Derivatives"],
    ["Options", "Derivatives"],
    ["Perps", "Derivatives"],
    ["Cross Chain", "Bridges"],
    ["Bridge", "Bridges"],
    ["Liquid Staking", "Liquid Staking"],
    ["Liquid Restaking", "Liquid Staking"],
    ["RWA", "RWA"],
    ["RWA Lending", "RWA"],
  ];
  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => {
      expect(bucketCategory(input)).toBe(expected);
    });
  }
});

describe("bucketCategory fallback", () => {
  it("null → Others, no warn", () => {
    const onUnmapped = vi.fn();
    expect(bucketCategory(null, onUnmapped)).toBe("Others");
    expect(onUnmapped).not.toHaveBeenCalled();
  });
  it("empty string → Others, no warn", () => {
    const onUnmapped = vi.fn();
    expect(bucketCategory("", onUnmapped)).toBe("Others");
    expect(onUnmapped).not.toHaveBeenCalled();
  });
  it("whitespace-only → Others, no warn", () => {
    const onUnmapped = vi.fn();
    expect(bucketCategory("   ", onUnmapped)).toBe("Others");
    expect(onUnmapped).not.toHaveBeenCalled();
  });
  it("unknown category → Others, warns", () => {
    const onUnmapped = vi.fn();
    expect(bucketCategory("Quantum Frobnicator", onUnmapped)).toBe("Others");
    expect(onUnmapped).toHaveBeenCalledWith("Quantum Frobnicator");
  });
  it("case-insensitive match", () => {
    expect(bucketCategory("LENDING")).toBe("Lending");
    expect(bucketCategory("dexes")).toBe("DEX");
  });
});
