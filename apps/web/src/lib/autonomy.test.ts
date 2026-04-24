import { describe, expect, it } from "vitest";
import { categoryIsLowAutonomy, autonomyGrade } from "./autonomy";

describe("categoryIsLowAutonomy", () => {
  const redCats = [
    "RWA Lending",
    "Liquid Staking",
    "Bridge",
    "Canonical Bridge",
    "Cross Chain Bridge",
    "Bridge Aggregator",
  ];
  for (const c of redCats) {
    it(`${c} is low-autonomy`, () => expect(categoryIsLowAutonomy(c)).toBe(true));
  }
  for (const c of ["Lending", "Dexs", "Yield", "RWA", "CEX", null, ""]) {
    it(`${c ?? "(null)"} is not flagged`, () => expect(categoryIsLowAutonomy(c)).toBe(false));
  }
  it("is case-insensitive and trims whitespace", () => {
    expect(categoryIsLowAutonomy("liquid staking")).toBe(true);
    expect(categoryIsLowAutonomy("  BRIDGE  ")).toBe(true);
  });
});

describe("autonomyGrade", () => {
  it("low-autonomy category → red (trumps forkedFrom)", () => {
    expect(autonomyGrade("Liquid Staking", [123])).toBe("red");
    expect(autonomyGrade("Bridge", null)).toBe("red");
    expect(autonomyGrade("Cross Chain Bridge", null)).toBe("red");
  });
  it("forkedFrom present → orange when category is not low-autonomy", () => {
    expect(autonomyGrade("Dexs", [2197])).toBe("orange");
  });
  it("neither signal → gray", () => {
    expect(autonomyGrade("Lending", null)).toBe("gray");
    expect(autonomyGrade(null, null)).toBe("gray");
    expect(autonomyGrade("Dexs", [])).toBe("gray");
  });
});
