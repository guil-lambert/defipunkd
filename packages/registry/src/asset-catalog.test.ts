import { expect, it } from "vitest";
import { AssetCatalogSchema, ASSET_ISSUER_PROTOCOLS } from "./asset-catalog";
const asset = { id: "apple", symbol: "AAPL", name: "Apple", kind: "stock" };
const comparison = { asset_id: "apple", as_of: "2026-11-03T00:00:00Z", representations: [{ issuer: "Example", symbol: "AAPLx", network: "Ethereum", contract: null, explorer_url: null, form: "issuer token" }] };
const catalog = { schema_version: 1, fetched_at: "2026-11-03T00:00:00Z", assets: [asset], comparisons: [comparison] };
it("rejects duplicate assets and comparisons outside the directory", () => {
  expect(AssetCatalogSchema.safeParse(catalog).success).toBe(true);
  expect(AssetCatalogSchema.safeParse({ ...catalog, assets: [asset, asset] }).success).toBe(false);
  expect(AssetCatalogSchema.safeParse({ ...catalog, comparisons: [{ ...comparison, asset_id: "other" }] }).success).toBe(false);
});
it("maps only explicit product labels, never fuzzy issuer names", () => {
  expect(ASSET_ISSUER_PROTOCOLS.Ondo).toBe("ondo-global-markets");
  expect(ASSET_ISSUER_PROTOCOLS["Ondo Treasury"]).toBeUndefined();
});
