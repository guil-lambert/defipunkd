import { describe, expect, it } from "vitest";
import { categoryIsHighDependency, dependenciesGrade } from "./dependencies";

describe("categoryIsHighDependency", () => {
  const redCats = [
    "RWA Lending",
    "Liquid Staking",
    "Bridge",
    "Canonical Bridge",
    "Cross Chain Bridge",
    "Bridge Aggregator",
  ];
  for (const c of redCats) {
    it(`${c} is high-dependency`, () => expect(categoryIsHighDependency(c)).toBe(true));
  }
  for (const c of ["Lending", "Dexs", "Yield", "RWA", "CEX", null, ""]) {
    it(`${c ?? "(null)"} is not flagged`, () => expect(categoryIsHighDependency(c)).toBe(false));
  }
  it("is case-insensitive and trims whitespace", () => {
    expect(categoryIsHighDependency("liquid staking")).toBe(true);
    expect(categoryIsHighDependency("  BRIDGE  ")).toBe(true);
  });
});

describe("dependenciesGrade", () => {
  it("high-dependency category → red (trumps forkedFrom)", () => {
    expect(dependenciesGrade("Liquid Staking", [123])).toBe("red");
    expect(dependenciesGrade("Bridge", null)).toBe("red");
    expect(dependenciesGrade("Cross Chain Bridge", null)).toBe("red");
  });
  it("forkedFrom present → orange when category is not high-dep", () => {
    expect(dependenciesGrade("Dexs", [2197])).toBe("orange");
  });
  it("neither signal → gray", () => {
    expect(dependenciesGrade("Lending", null)).toBe("gray");
    expect(dependenciesGrade(null, null)).toBe("gray");
    expect(dependenciesGrade("Dexs", [])).toBe("gray");
  });
});
