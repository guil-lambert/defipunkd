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
    expect(PROMPT_VERSION).toBe(27);
  });

  it("includes the format-rules block that forbids markdown URLs and branch refs in commits", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("NEVER markdown link syntax");
    expect(p).toContain("NEVER branch names");
    expect(p).toContain("^[0-9a-f]{7,40}$");
  });

  it("shows a concrete WRONG/RIGHT counterexample for the markdown-URL anti-pattern", () => {
    const p = buildPrompt("control", INPUTS);
    // The condensed format rules show one inline counterexample using
    // WRONG: ... / RIGHT: ... — both labels must be present.
    expect(p).toContain("WRONG:");
    expect(p).toContain("RIGHT:");
    expect(p).toContain("[Etherscan]");
  });

  it("requires a checklist-code prefix on unknowns[] entries", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("prefixed with the relevant code");
    expect(p).toContain("E3:");
  });

  it("requires at least one on-chain evidence URL for on-chain slices", () => {
    const p = buildPrompt("control", INPUTS);
    // Either "AT LEAST ONE" or "≥1" satisfies the rule; the condensed prompt uses ≥1.
    expect(p).toContain("≥1 on-chain URL");
    expect(p).toContain("control, ability-to-exit, autonomy, verifiability");
    expect(p).toContain("block-explorer URL");
    expect(p).toContain("DeFiPunkd /api/{contract/read,safe/owners}");
  });

  it("instructs the LLM to leave chat_url null and explains why", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("chat_url");
    expect(p).toContain("ALWAYS null");
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

  it("control grades on the uncontested-fast-path delay", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("uncontested-fast-path delay");
    expect(p).toContain("SUM OF DELAYS ON THE UNCONTESTED FAST PATH");
    expect(p).toContain("Dynamic / contested extensions");
  });

  it("control walks the full execution path, not just the first timelock", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("EXECUTION PATH (enumerate every stage");
    expect(p).toContain("Do NOT stop at the first timelock-shaped contract");
  });

  it("control requires Read Contract discipline for numeric constants", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("Read Contract discipline");
    expect(p).toContain("Every numeric constant cited");
    // "Empty unknowns[] is a red flag" lives in the preamble's anti-fab section.
    expect(p).toContain("Empty unknowns[] on a non-trivial protocol is a red flag");
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
      expect(p).toContain('"schema_version": 4');
      expect(p).toContain('"protocol_metadata"');
    }
  });

  it("pins the inputs into the preamble so re-runs are reproducible", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("protocol.slug:              lido");
    expect(p).toContain("snapshot.generated_at:      2026-04-01T00:00:00Z");
    expect(p).toContain("prompt_version:             27");
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

  it("teaches the LLM about the DeFiPunkd machine-readable read API", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("On-chain reading via the DeFiPunkd API");
    expect(p).toContain("https://defipunkd.com/api/contract/abi");
    expect(p).toContain("https://defipunkd.com/api/contract/read");
    expect(p).toContain("https://defipunkd.com/api/safe/owners");
    expect(p).toContain("blockNumber");
    expect(p).toContain("rawReturnData");
    // Source class (e) is the DeFiPunkd read API.
    expect(p).toContain("e) DeFiPunkd's read API");
  });

  it("slice bodies wire concrete API methods into their checklists (bare method names)", () => {
    // Bare method names (no parens) — chat browser tools normalize "(" to "%28"
    // and reject the URL as not matching the user-provided one.
    const control = buildPrompt("control", INPUTS);
    expect(control).toContain("&method=owner");
    expect(control).not.toContain("&method=owner()");
    expect(control).toContain("/api/safe/owners?chainId=<id>&address=0x...");
    expect(control).toContain("MIN_DELAY");
    // ability-to-exit: pause-state checks
    const exit = buildPrompt("ability-to-exit", INPUTS);
    expect(exit).toContain("&method=paused");
    expect(exit).not.toContain("&method=paused()");
    expect(exit).toContain("&method=hasRole");
    // verifiability: V1 (verified flag) + V6 (proxy.implementation) covered by /api/contract/abi
    const ver = buildPrompt("verifiability", INPUTS);
    expect(ver).toContain("/api/contract/abi");
    expect(ver).toContain("proxy.implementation");
    // autonomy: oracle live-read
    const auto = buildPrompt("autonomy", INPUTS);
    expect(auto).toContain("&method=latestAnswer");
    expect(auto).not.toContain("&method=latestAnswer()");
    expect(auto).toContain("/api/contract/read?chainId=<id>&address=<oracle>");
  });

  it("preamble explicitly tells the LLM to use bare method names", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("BARE method name");
    expect(p).toContain("&method=totalSupply");
    expect(p).toContain("Browser tools normalize");
  });

  it("preamble references the /address/<chainId>/<addr> surfacer", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("Pre-built read-API surfacer URLs");
    expect(p).toContain("appear verbatim in the per-protocol context");
  });

  it("preamble tells the model embedded surfacer links are fetchable in-run", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("renders any address-typed return values");
    expect(p).toContain("rendered links are also fetchable post-fetch");
  });

  it("preamble advertises crawl.surfacers in API responses", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("crawl.surfacers");
    expect(p).toContain("crawl directly from API responses");
    // Residual case: addresses from non-defipunkd sources still hit the allowlist.
    expect(p).toContain("non-defipunkd sources");
  });

  it("emits concrete pre-built surfacer URLs per address_book entry", () => {
    const p = buildPrompt("control", {
      ...INPUTS,
      addressBook: [
        { chain: "Ethereum", address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", role: "stETH" },
        { chain: "ethereum", address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", role: "duplicate-dropped" },
        { chain: "Base", address: "0x4200000000000000000000000000000000000006" },
      ],
    });
    // Concrete URLs verbatim — required for ChatGPT/Claude.ai allowlist match.
    expect(p).toContain("https://defipunkd.com/address/1/0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84");
    expect(p).toContain("https://defipunkd.com/address/8453/0x4200000000000000000000000000000000000006");
    expect(p).toContain("Pre-built read-API surfacer URLs");
    // Roles attached so the LLM knows which surfacer is which.
    expect(p).toContain("(stETH)");
  });

  it("when address_book is null, emits a fallback note about discovering from fetched sources", () => {
    const p = buildPrompt("control", { ...INPUTS, addressBook: null });
    expect(p).toContain("no addresses pinned in this run");
    expect(p).toContain("discover candidates from fetched website / GitHub / audit / explorer pages");
    expect(p).toContain("The next assessment will inherit your discoveries");
  });

  it("preamble has NO URL-relay / paste-back flow (JSON-only is binding)", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).not.toContain("URL FETCH REQUEST");
    expect(p).not.toContain("Please paste these URLs back");
    expect(p).not.toContain("EXCEPTION TO JSON-ONLY");
    expect(p).not.toContain("Do NOT emit the JSON output yet");
    expect(p).not.toContain("paste them back");
    expect(p).not.toContain("paste-back");
  });

  it("preamble carries the ratchet rule for non-pinned addresses", () => {
    const p = buildPrompt("control", INPUTS);
    // Discovered-but-unread addresses go to admin_addresses + checklist-coded unknowns[];
    // the next run inherits them as fetchable surfacers.
    expect(p).toContain("protocol_metadata.admin_addresses");
    expect(p).toContain("the next run will inherit it as a fetchable surfacer");
    // Empty unknowns[] on a non-trivial protocol is a red flag, not a quality signal.
    expect(p).toContain("Empty unknowns[] on a non-trivial protocol is a red flag");
  });

  it("preamble retains the address_book hint about noise", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("Note on noisy address_book");
    expect(p).toContain("role hints");
  });

  it("preamble carries the consolidated anti-fabrication invariants", () => {
    const p = buildPrompt("control", INPUTS);
    // Single consolidated anti-fab section (collapsed from v20–v27 patches).
    expect(p).toContain("Anti-fabrication");
    expect(p).toContain("Memory is not evidence");
    expect(p).toContain("fetched in this run");
    // The 5-item evidence ledger.
    expect(p).toContain("evidence ledger check");
    // fetched_at: omit rather than invent.
    expect(p).toContain("never invent one");
    // Plausibility is a failure mode — collapsed phrasing.
    expect(p).toContain("plausible-sounding answer");
    expect(p).toContain("WORSE than grade=\"unknown\"");
    expect(p).toContain("Optimize for reproducibility");
    // Initial-address-discovery: famous tokens are not exempt.
    expect(p).toContain("even for famous tokens");
    // Demote-on-failure path.
    expect(p).toContain("demote dependent claims to unknowns[]");
  });

  it("preamble authorizes search-grounding tools and distinguishes snippets from grounded bodies", () => {
    const p = buildPrompt("control", INPUTS);
    // Step 0 — capability probe lives in preamble.
    expect(p).toContain("Step 0 — Capability probe");
    expect(p).toContain("Search-grounding tools ARE valid fetch paths");
    // Snippet-vs-grounded-body distinction.
    expect(p).toContain("grounded response with the underlying page body");
    expect(p).toContain("bare 1–3-line preview snippet");
    // DO-NOT-STOP fallback to broad search when direct fetch fails.
    expect(p).toContain("DO NOT STOP");
    expect(p).toContain('grading_basis: "off-chain-only"');
  });

  it("asks the LLM to refresh protocol_metadata as a side-effect", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("Protocol metadata refresh");
    expect(p).toContain("bug_bounty_url");
    expect(p).toContain("security_contact");
    expect(p).toContain("governance_forum");
    expect(p).toContain("voting_token");
    expect(p).toContain("admin_addresses");
    expect(p).toContain("upgradeability");
    expect(p).toContain("deployed_contracts_doc");
  });

  it("returns distinct bodies per slice", () => {
    const bodies = SLICE_IDS.map((s) => buildPrompt(s, INPUTS));
    const uniq = new Set(bodies);
    expect(uniq.size).toBe(SLICE_IDS.length);
  });
});
