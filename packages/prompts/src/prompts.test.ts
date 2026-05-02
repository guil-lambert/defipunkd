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
    expect(PROMPT_VERSION).toBe(22);
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
    expect(p).toContain("prefixed with the relevant checklist code");
    expect(p).toContain("E3:");
  });

  it("requires at least one on-chain evidence URL for on-chain slices (block-explorer or DeFiPunkd API; v14)", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("AT LEAST ONE on-chain evidence URL");
    expect(p).toContain("control, ability-to-exit, autonomy, verifiability");
    // Both evidence shapes are accepted on Rule 16.
    expect(p).toContain("block-explorer URL");
    expect(p).toContain("DeFiPunkd /api/{contract/read,safe/owners}");
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

  it("control grades on the uncontested-fast-path delay (v10)", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("uncontested-fast-path delay");
    expect(p).toContain("SUM OF DELAYS ON THE UNCONTESTED FAST PATH");
    expect(p).toContain("Dynamic / contested extensions");
  });

  it("control walks the full execution path, not just the first timelock (v10)", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("EXECUTION PATH (enumerate every stage");
    expect(p).toContain("Do NOT stop at the first timelock-shaped contract");
  });

  it("control requires Read Contract discipline for numeric constants (v10)", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("Read Contract discipline");
    expect(p).toContain("Every numeric constant you cite");
    expect(p).toContain("Empty unknowns[] on a protocol with more than ~3 admin-class contracts");
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
      expect(p).toContain('"schema_version": 3');
      expect(p).toContain('"protocol_metadata"');
    }
  });

  it("pins the inputs into the preamble so re-runs are reproducible", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("protocol.slug:              lido");
    expect(p).toContain("snapshot.generated_at:      2026-04-01T00:00:00Z");
    expect(p).toContain("prompt_version:             22");
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

  it("teaches the LLM about the DeFiPunkd machine-readable read API (v13+)", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("On-chain reading via the DeFiPunkd API");
    expect(p).toContain("https://defipunkd.com/api/contract/abi");
    expect(p).toContain("https://defipunkd.com/api/contract/read");
    expect(p).toContain("https://defipunkd.com/api/safe/owners");
    expect(p).toContain("blockNumber");
    expect(p).toContain("rawReturnData");
    // Evidence class (e) — distinguished from class (a) (block explorers).
    expect(p).toContain("e) DeFiPunkd's machine-readable read API");
  });

  it("slice bodies wire concrete API methods into their checklists (bare method names, v16+)", () => {
    // Bare method names (no parens) — chat browser tools normalize "(" to
    // "%28" and then reject the URL as not matching the user-provided one.
    // control: C1 (owner reads), C3 (timelock constants), Read Contract discipline
    const control = buildPrompt("control", INPUTS);
    expect(control).toContain("&method=owner");
    expect(control).not.toContain("&method=owner()");
    expect(control).toContain("/api/safe/owners?chainId=<id>&address=0x...");
    expect(control).toContain("MIN_DELAY");
    expect(control).toContain("a-bis"); // the new accepted-source bullet
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

  it("preamble explicitly tells the LLM to use bare method names (v16)", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("BARE method name");
    expect(p).toContain("&method=totalSupply");
    expect(p).toContain("Browser tools normalize");
  });

  it("preamble references the /address/<chainId>/<addr> surfacer (v17, retained in v22)", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("Pre-built read-API surfacer URLs");
    expect(p).toContain("appeared verbatim in conversation context");
  });

  it("emits concrete pre-built surfacer URLs per address_book entry (v18)", () => {
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

  it("when address_book is null, emits a fallback note about discovering from fetched sources (v22)", () => {
    const p = buildPrompt("control", { ...INPUTS, addressBook: null });
    expect(p).toContain("no addresses pinned in this run");
    expect(p).toContain("discover candidates from fetched website / GitHub / audit / explorer pages");
    expect(p).toContain("The next assessment will inherit your discoveries");
  });

  it("preamble has NO URL-relay / paste-back flow (removed in v22 — JSON-only is binding)", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).not.toContain("URL FETCH REQUEST");
    expect(p).not.toContain("Please paste these URLs back");
    expect(p).not.toContain("EXCEPTION TO JSON-ONLY");
    expect(p).not.toContain("Do NOT emit the JSON output yet");
  });

  it("preamble v22 carries the iterative-ratchet rule for non-pinned addresses", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("iterative ratchet");
    expect(p).toContain("inherits a richer address_book");
    // Non-pinned discovery: record under admin_addresses + unknowns[], no relay.
    expect(p).toContain("Populate protocol_metadata.admin_addresses");
    expect(p).toContain("The next assessment");
    // Empty unknowns on a complex protocol is a red flag, not quality.
    expect(p).toContain("Empty unknowns[] on a non-trivial protocol is a red flag");
  });

  it("preamble v22 retains the address_book hint about noise", () => {
    const p = buildPrompt("control", INPUTS);
    expect(p).toContain("Note on noisy address_book");
    expect(p).toContain("role hints (parenthesized labels)");
  });

  it("preamble carries the v20 anti-fabrication / receipt-trail rules", () => {
    const p = buildPrompt("control", INPUTS);
    // Memory firewall — explicit list of claim types that need fetched evidence.
    expect(p).toContain("MEMORY FIREWALL");
    expect(p).toContain("multisig threshold and signer set");
    expect(p).toContain("audit firm names");
    // Anti-fabrication gate — receipt ledger.
    expect(p).toContain("Anti-fabrication gate");
    expect(p).toContain("PERSONALLY FETCHED");
    expect(p).toContain("internal evidence ledger");
    expect(p).toContain("Inventing a fetched_at is fabrication");
    // Plausibility-as-failure-mode rule.
    expect(p).toContain("Plausibility is a failure mode");
    expect(p).toContain("Optimize for reproducibility");
    // Final verification check before emitting JSON.
    expect(p).toContain("FINAL VERIFICATION CHECK");
    expect(p).toContain("demote the unsupported claims to unknowns[]");
    // v22: even when verification fails, the answer is still JSON (with grade=unknown).
    expect(p).toContain("the only valid response is");
  });

  it("preamble v21+ tightens against ChatGPT-flagged loopholes (v22 retains all anti-fab rules)", () => {
    const p = buildPrompt("control", INPUTS);
    // "Constructed from memory" reframed: every variable part must be sourced.
    expect(p).toContain("every variable part of the constructed URL");
    expect(p).toContain("guessed API methods is fabrication");
    // Search snippets are discovery only.
    expect(p).toContain("Search-result snippets are discovery only");
    // Status fallback for browser tools that don't expose HTTP status.
    expect(p).toContain("if the tool does not expose status");
    // fetched_at: omit rather than invent.
    expect(p).toContain("omit the field entirely rather than inventing");
    // Initial-address-discovery rule for null address_book.
    expect(p).toContain("Initial address discovery");
    expect(p).toContain("even for famous tokens like USDC, WBTC, stETH, UNI");
    // Evidence receipt invariant — explicit four-question check.
    expect(p).toContain("Evidence receipt invariant");
    expect(p).toContain("Did this exact URL appear in the model's actual fetch transcript");
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
