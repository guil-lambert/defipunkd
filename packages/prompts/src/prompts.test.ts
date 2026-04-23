import { describe, it, expect } from "vitest";
import { buildPrompt, SLICE_IDS, PROMPT_VERSION, type PromptInputs } from "./index";

const INPUTS: PromptInputs = {
  slug: "lido",
  name: "Lido",
  chains: ["Ethereum"],
  category: "Liquid Staking",
  website: "https://lido.fi",
  github: ["https://github.com/lidofinance/lido-dao"],
  auditLinks: ["https://github.com/lidofinance/audits"],
  snapshotGeneratedAt: "2026-04-01T00:00:00Z",
  analysisDate: "2026-04-23",
  addressBook: null,
};

describe("buildPrompt", () => {
  it("is exported at a stable version", () => {
    expect(PROMPT_VERSION).toBe(1);
  });

  it("emits a prompt for every slice", () => {
    for (const slice of SLICE_IDS) {
      const p = buildPrompt(slice, INPUTS);
      expect(p).toContain(`slice: ${slice}`.toUpperCase().replace(/^SLICE:/, "Slice:"));
      expect(p).toContain(INPUTS.slug);
      expect(p).toContain(INPUTS.snapshotGeneratedAt);
      expect(p).toContain(INPUTS.analysisDate);
      expect(p).toContain('"schema_version": 1');
    }
  });

  it("pins the inputs into the preamble so re-runs are reproducible", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("protocol.slug:              lido");
    expect(p).toContain("snapshot.generated_at:      2026-04-01T00:00:00Z");
    expect(p).toContain("prompt_version:             1");
    expect(p).not.toContain("{{"); // no unfilled placeholders
  });

  it("shows address_book: null when no addresses are known", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("address_book:               null");
  });

  it("serializes an address_book when provided", () => {
    const p = buildPrompt("control", {
      ...INPUTS,
      addressBook: [{ chain: "Ethereum", address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", role: "stETH" }],
    });
    expect(p).toContain("0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84");
    expect(p).toContain('"role": "stETH"');
  });

  it("returns distinct bodies per slice", () => {
    const bodies = SLICE_IDS.map((s) => buildPrompt(s, INPUTS));
    const uniq = new Set(bodies);
    expect(uniq.size).toBe(SLICE_IDS.length);
  });
});
