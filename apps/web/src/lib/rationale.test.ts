import { describe, expect, it } from "vitest";
import { isUncertain } from "./rationale";

describe("isUncertain", () => {
  it("returns false when neither partial nor tentative is set", () => {
    expect(isUncertain({})).toBe(false);
    expect(isUncertain({ partial: false, tentative: false })).toBe(false);
  });

  it("returns true when partial is set (pre-quorum submissions)", () => {
    expect(isUncertain({ partial: true })).toBe(true);
  });

  it("returns true when tentative is set (low-confidence consensus)", () => {
    expect(isUncertain({ tentative: true })).toBe(true);
  });

  it("returns true when both flags are set", () => {
    expect(isUncertain({ partial: true, tentative: true })).toBe(true);
  });
});
