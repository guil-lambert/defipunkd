import { describe, expect, it } from "vitest";
import { verifiabilityGrade, worstGrade } from "./verifiability";

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
