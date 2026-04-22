import { describe, expect, it } from "vitest";
import { mergeProtocol, type MergeWarning } from "./merge";
import type { ProtocolSnapshot } from "./types";

const base: ProtocolSnapshot = {
  slug: "acme",
  name: "Acme",
  category: "Lending",
  chains: ["Ethereum"],
  tvl: 100,
  tvl_by_chain: { Ethereum: 100 },
  website: "https://acme.xyz",
  twitter: null,
  github: null,
  audit_count: 0,
  audit_links: [],
  hallmarks: [],
  parent_slug: null,
  forked_from: null,
  logo: null,
  is_dead: false,
  is_parent: false,
  first_seen_at: "2026-01-01T00:00:00.000Z",
  last_seen_at: "2026-04-22T00:00:00.000Z",
  delisted_at: null,
};

describe("mergeProtocol three-state semantics", () => {
  it("absent key defers to snapshot (provenance: defillama)", () => {
    const warnings: MergeWarning[] = [];
    const out = mergeProtocol(base, {}, warnings);
    expect(out.website).toBe("https://acme.xyz");
    expect(out._provenance.website).toBe("defillama");
    expect(warnings).toEqual([]);
  });

  it("explicit null overrides snapshot with null (provenance: curated)", () => {
    const warnings: MergeWarning[] = [];
    const out = mergeProtocol(base, { website: null }, warnings);
    expect(out.website).toBeNull();
    expect(out._provenance.website).toBe("curated");
  });

  it("value override wins over snapshot (provenance: curated)", () => {
    const warnings: MergeWarning[] = [];
    const out = mergeProtocol(base, { website: "https://override.example" }, warnings);
    expect(out.website).toBe("https://override.example");
    expect(out._provenance.website).toBe("curated");
  });

  it("identity-with-snapshot overlay still renders [curated] but warns", () => {
    const warnings: MergeWarning[] = [];
    const out = mergeProtocol(base, { website: "https://acme.xyz" }, warnings);
    expect(out._provenance.website).toBe("curated");
    expect(warnings).toContainEqual({ kind: "identity_overlay", slug: "acme", field: "website" });
  });

  it("no overlay → all fields come from defillama", () => {
    const warnings: MergeWarning[] = [];
    const out = mergeProtocol(base, undefined, warnings);
    expect(out._provenance.name).toBe("defillama");
    expect(out._provenance.website).toBe("defillama");
  });
});
