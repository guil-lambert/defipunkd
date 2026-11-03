import { describe, expect, it } from "vitest";
import { normalizeTokenizedIssuer, TokenizedAssetsSchema, getTokenizedAssets, TOKENIZED_ISSUERS, tokenizedIssuerUrl, tokenizedAssetUrl } from "./tokenized-assets";

const fixture = () => ({
  dataset_mode: "live", scope: { kind: "issuer", id: "issuer-a" }, as_of: "2026-11-03T12:00:00Z",
  overview: { asset_count: 12, representation_count: 20, network_count: 1 },
  registry: {
    issuers: [{ id: "issuer-a", name: "Issuer A", network_ids: ["ethereum"] }, { id: "issuer-b", name: "Issuer B", network_ids: ["solana"] }],
    networks: [{ id: "ethereum", name: "Ethereum" }, { id: "solana", name: "Solana" }],
  },
  rankings: { assets: Array.from({ length: 8 }, (_, i) => ({ id: `asset-${i}`, name: `Asset ${i}`, symbol: `A${i}`, asset_type: "stock", price_usd: 100, networks: ["ethereum", "solana"] })) },
});

describe("Tokenized Stonks catalog adapter", () => {
  it("uses issuer-scoped networks and saves at most five examples without market data", () => {
    const parsed = normalizeTokenizedIssuer(fixture(), "issuer-a");
    expect(parsed.networks).toEqual([{ id: "ethereum", name: "Ethereum" }]);
    expect(parsed.examples).toHaveLength(5);
    expect(parsed.examples[0]).not.toHaveProperty("price_usd");
    expect(parsed.examples[0]).not.toHaveProperty("networks");
    expect(parsed.asset_count).toBe(12);
  });
  it("preserves missing counts and distinguishes them from zero", () => {
    const raw = fixture();
    const parsed = normalizeTokenizedIssuer({ ...raw, overview: { ...raw.overview, asset_count: null, representation_count: null } }, "issuer-a");
    expect(parsed.asset_count).toBeNull();
    expect(parsed.representation_count).toBeNull();
    expect(normalizeTokenizedIssuer({ ...raw, overview: { asset_count: 0, representation_count: 0, network_count: 1 }, rankings: { assets: [] } }, "issuer-a").asset_count).toBe(0);
  });
  it("rejects demo data, wrong scope, schema drift and incomplete network lists", () => {
    expect(() => normalizeTokenizedIssuer({ ...fixture(), dataset_mode: "demo" }, "issuer-a")).toThrow();
    expect(() => normalizeTokenizedIssuer(fixture(), "issuer-b")).toThrow("Wrong issuer scope");
    expect(() => normalizeTokenizedIssuer({}, "issuer-a")).toThrow();
    const raw = fixture(); raw.overview.network_count = 2;
    expect(() => normalizeTokenizedIssuer(raw, "issuer-a")).toThrow("Incomplete network coverage");
    raw.overview.network_count = 1; raw.registry.networks = [];
    expect(() => normalizeTokenizedIssuer(raw, "issuer-a")).toThrow("Unknown network");
  });
  it("does not infer mappings for related funds or unrelated protocols", () => {
    expect(getTokenizedAssets("ondo-yield-assets")).toBeNull();
    expect(getTokenizedAssets("aave-v3")).toBeNull();
    expect(getTokenizedAssets("../../etc")).toBeNull();
    expect(TOKENIZED_ISSUERS.robinhood).toEqual(["rheu", "rhj"]);
  });
  it("validates persisted snapshots and safely builds source links", () => {
    const data = { schema_version: 1, slug: "example", fetched_at: "2026-11-03T12:00:00Z", issuers: [normalizeTokenizedIssuer(fixture(), "issuer-a")] };
    expect(TokenizedAssetsSchema.safeParse(data).success).toBe(true);
    expect(TokenizedAssetsSchema.safeParse({ ...data, fetched_at: "invalid" }).success).toBe(false);
    expect(tokenizedIssuerUrl("ondo-global-markets")).toBe("https://tokenizedstonks.io/#/issuers/ondo-global-markets");
    expect(tokenizedAssetUrl("asset/a?b")).toBe("https://tokenizedstonks.io/#/asset/asset%2Fa%3Fb");
  });
});
