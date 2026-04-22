import { describe, expect, it } from "vitest";
import { dominantChildGrade, verifiabilityGrade, worstGrade } from "./verifiability";

describe("verifiabilityGrade", () => {
  it("green when github AND at least one audit", () => {
    expect(verifiabilityGrade(true, 1)).toBe("green");
    expect(verifiabilityGrade(true, 5)).toBe("green");
  });
  it("orange when github XOR audit", () => {
    expect(verifiabilityGrade(true, 0)).toBe("orange");
    expect(verifiabilityGrade(false, 1)).toBe("orange");
  });
  it("red when neither", () => {
    expect(verifiabilityGrade(false, 0)).toBe("red");
  });
});

describe("worstGrade", () => {
  it("picks the most-severe grade", () => {
    expect(worstGrade(["green", "orange", "red"])).toBe("red");
    expect(worstGrade(["green", "orange"])).toBe("orange");
    expect(worstGrade(["green", "green"])).toBe("green");
  });
  it("empty / all-gray → gray", () => {
    expect(worstGrade([])).toBe("gray");
    expect(worstGrade(["gray", "gray"])).toBe("gray");
  });
});

describe("dominantChildGrade", () => {
  it("returns the grade of the highest-TVL child", () => {
    const kids = [
      { slug: "v1", tvl: 100, verifiability_grade: "red" as const },
      { slug: "v3", tvl: 1000, verifiability_grade: "green" as const },
      { slug: "v4", tvl: 50, verifiability_grade: "orange" as const },
    ];
    expect(dominantChildGrade(kids)).toBe("green");
  });

  it("Aave-style scenario: one outlier orange child does not drag down the family", () => {
    const kids = [
      { slug: "v3", tvl: 15_300_000_000, verifiability_grade: "green" as const },
      { slug: "aptos", tvl: 9_700_000, verifiability_grade: "orange" as const },
      { slug: "v2", tvl: 136_000_000, verifiability_grade: "green" as const },
    ];
    expect(dominantChildGrade(kids)).toBe("green");
  });

  it("null-TVL children are considered lowest; ties break alphabetically", () => {
    const kids = [
      { slug: "a", tvl: null, verifiability_grade: "green" as const },
      { slug: "b", tvl: 100, verifiability_grade: "orange" as const },
    ];
    expect(dominantChildGrade(kids)).toBe("orange");
  });
});
