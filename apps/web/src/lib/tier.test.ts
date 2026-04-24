import { describe, it, expect } from "vitest";
import { deriveTier, maxTier, ringStroke, ringStrokeWidth, type TierInput } from "./tier";

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

  it("ignores slices below quorum", () => {
    const input: TierInput = { control: { models: models(2) } };
    expect(deriveTier(input)).toBe("none");
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

describe("ring helpers", () => {
  it("uses gradient above threshold, solid below", () => {
    expect(ringStroke("silver", 24)).toBe("url(#tier-silver)");
    expect(ringStroke("silver", 16)).toBe("#A8A8B0");
  });

  it("scales stroke width at 32px+", () => {
    expect(ringStrokeWidth(36)).toBe(2.5);
    expect(ringStrokeWidth(24)).toBe(2);
  });
});
