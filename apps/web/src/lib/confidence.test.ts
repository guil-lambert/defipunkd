import { describe, it, expect } from "vitest";
import { assessConfidence, isHallucinationProneModel, type ConsensusSource } from "./confidence";

const careful: ConsensusSource = { model: "claude-opus-4-7", chat_url: "https://claude.ai/share/x", weight: 1.5 };
const carefulNoUrl: ConsensusSource = { model: "claude-opus-4-7", chat_url: null, weight: 0.075 };
const haiku: ConsensusSource = { model: "claude-haiku-4-5", chat_url: "https://claude.ai/share/y", weight: 0.05 };

describe("isHallucinationProneModel", () => {
  it("matches haiku-4-5, gemini-3-flash-preview, gpt<=5.3", () => {
    expect(isHallucinationProneModel("claude-haiku-4-5")).toBe(true);
    expect(isHallucinationProneModel("gemini-3-flash-preview")).toBe(true);
    expect(isHallucinationProneModel("gpt-5.3")).toBe(true);
    expect(isHallucinationProneModel("gpt-5.0")).toBe(true);
  });
  it("does not flag stronger models", () => {
    expect(isHallucinationProneModel("claude-opus-4-7")).toBe(false);
    expect(isHallucinationProneModel("gpt-5.5-thinking")).toBe(false);
    expect(isHallucinationProneModel("gemini-3-pro")).toBe(false);
  });
});

describe("assessConfidence", () => {
  it("flags weak strength", () => {
    const r = assessConfidence([careful, careful, careful], "weak");
    expect(r.tentative).toBe(true);
    expect(r.reasons[0]).toMatch(/weak consensus/);
  });

  it("flags low URL coverage (<50% by submission count)", () => {
    const r = assessConfidence([careful, carefulNoUrl, carefulNoUrl], "strong");
    expect(r.tentative).toBe(true);
    expect(r.reasons.some((x) => /1\/3 sources/.test(x))).toBe(true);
  });

  it("flags hallucination-heavy weight share", () => {
    const r = assessConfidence(
      [
        { model: "claude-haiku-4-5", chat_url: "https://x", weight: 1.0 },
        { model: "gemini-3-flash-preview", chat_url: "https://y", weight: 1.0 },
        { model: "claude-opus-4-7", chat_url: "https://z", weight: 0.5 },
      ],
      "strong",
    );
    expect(r.tentative).toBe(true);
    expect(r.reasons.some((x) => /hallucination-prone/.test(x))).toBe(true);
  });

  it("flags low total weight", () => {
    const r = assessConfidence([carefulNoUrl, carefulNoUrl, carefulNoUrl], "strong");
    expect(r.tentative).toBe(true);
    expect(r.reasons.some((x) => /confidence floor/.test(x))).toBe(true);
  });

  it("does not flag a healthy strong consensus", () => {
    const r = assessConfidence([careful, careful, careful], "strong");
    expect(r.tentative).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it("handles empty/undefined sources gracefully", () => {
    expect(assessConfidence(undefined, "strong").tentative).toBe(false);
    expect(assessConfidence([], "strong").tentative).toBe(false);
    expect(assessConfidence([], "weak").tentative).toBe(true);
  });
});
