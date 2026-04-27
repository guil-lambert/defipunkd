import { describe, it, expect } from "vitest";
import { deriveTier, maxTier, type TierInput } from "./tier";

const models = (n: number) => Array.from({ length: n }, (_, i) => `m${i}`);

describe("deriveTier", () => {
  it("returns 'none' with no data", () => {
    expect(deriveTier(undefined)).toBe("none");
    expect(deriveTier({})).toBe("none");
  });

  it("returns 'bronze' with quorum on one slice", () => {
    const input: TierInput = { control: { models: models(3) } };
    expect(deriveTier(input)).toBe("bronze");
  });

  it("returns 'wood' when a slice has submissions but no quorum", () => {
    const input: TierInput = { control: { models: models(2) } };
    expect(deriveTier(input)).toBe("wood");
  });

  it("returns 'wood' from raw submissionCount even without merged models", () => {
    const input: TierInput = { control: { submissionCount: 1 } };
    expect(deriveTier(input)).toBe("wood");
  });

  it("returns 'silver' when all 5 slices have quorum", () => {
    const input: TierInput = {
      control: { models: models(3) },
      "ability-to-exit": { models: models(3) },
      autonomy: { models: models(3) },
      "open-access": { models: models(3) },
      verifiability: { models: models(3) },
    };
    expect(deriveTier(input)).toBe("silver");
  });

  it("returns 'gold' on any human signoff", () => {
    const input: TierInput = {
      control: { models: models(3), human_signoff: { signed_at: "2026-01-01T00:00:00Z" } },
    };
    expect(deriveTier(input)).toBe("gold");
  });
});

describe("maxTier", () => {
  it("picks the highest tier", () => {
    expect(maxTier(["none", "bronze", "silver"])).toBe("silver");
    expect(maxTier(["bronze", "gold", "silver"])).toBe("gold");
    expect(maxTier([])).toBe("none");
  });
});

