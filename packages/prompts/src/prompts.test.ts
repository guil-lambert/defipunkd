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
    expect(PROMPT_VERSION).toBe(5);
  });

  it("includes the format-rules block that forbids markdown URLs and branch refs in commits", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("NEVER wrap it in markdown link syntax");
    expect(p).toContain('NEVER use branch names ("main", "master"');
    expect(p).toContain("^[0-9a-f]{7,40}$");
  });

  it("shows concrete CORRECT/WRONG examples for the markdown-URL anti-pattern", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("CORRECT:");
    expect(p).toContain("WRONG:");
    expect(p).toContain("[https://etherscan.io");
  });

  it("requires a checklist-code prefix on unknowns[] entries", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("prefixed with the relevant checklist item code");
    expect(p).toContain('"E3:"');
  });

  it("requires at least one block-explorer URL for on-chain slices", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("AT LEAST ONE block-explorer URL");
    expect(p).toContain("control, ability-to-exit, dependencies, verifiability");
  });

  it("instructs the LLM to leave chat_url null and explains why", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("chat_url");
    expect(p).toContain("ALWAYS set this field to null");
    expect(p).toContain('"chat_url": null');
    expect(p).toContain("Share publicly");
  });

  it("includes the steel-man-before-grading rule", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("rationale.steelman");
    expect(p).toContain('"red":');
    expect(p).toContain('"orange":');
    expect(p).toContain('"green":');
  });

  it("each slice carries a mandatory inspection checklist", () => {
    for (const slice of SLICE_IDS) {
      const p = buildPrompt(slice, INPUTS);
      expect(p).toContain("MANDATORY INSPECTION CHECKLIST");
    }
  });

  it("ability-to-exit calls out the emergency-vs-governance pause distinction", () => {
    const p = buildPrompt("ability-to-exit", INPUTS);
    expect(p).toContain("EMERGENCY vs GOVERNANCE");
    expect(p).toContain("PAUSE_INFINITELY");
  });

  it("emits a prompt for every slice", () => {
    for (const slice of SLICE_IDS) {
      const p = buildPrompt(slice, INPUTS);
      expect(p).toContain(`slice: ${slice}`.toUpperCase().replace(/^SLICE:/, "Slice:"));
      expect(p).toContain(INPUTS.slug);
      expect(p).toContain(INPUTS.snapshotGeneratedAt);
      expect(p).toContain(INPUTS.analysisDate);
      expect(p).toContain('"schema_version": 2');
    }
  });

  it("pins the inputs into the preamble so re-runs are reproducible", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("protocol.slug:              lido");
    expect(p).toContain("snapshot.generated_at:      2026-04-01T00:00:00Z");
    expect(p).toContain("prompt_version:             5");
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
