import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

const text = z.string().min(1);
const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const https = z.string().url().refine((s) => s.startsWith("https://"));
export const CatalogAssetSchema = z.object({ id, symbol: text, name: text, kind: text });
export const AssetComparisonSchema = z.object({
  asset_id: id,
  as_of: z.string().datetime({ offset: true }),
  representations: z.array(z.object({
    issuer: text, symbol: text, network: text, contract: text.nullable(),
    explorer_url: https.nullable(), form: text,
  })).min(1),
});
export const AssetCatalogSchema = z.object({
  schema_version: z.literal(1),
  fetched_at: z.string().datetime({ offset: true }),
  assets: z.array(CatalogAssetSchema).min(1),
  comparisons: z.array(AssetComparisonSchema).min(1),
}).superRefine((data, ctx) => {
  const ids = new Set(data.assets.map((a) => a.id));
  if (ids.size !== data.assets.length || new Set(data.comparisons.map((c) => c.asset_id)).size !== data.comparisons.length || data.comparisons.some((c) => !ids.has(c.asset_id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate or unlisted asset" });
  }
});
export type AssetCatalog = z.infer<typeof AssetCatalogSchema>;
export type AssetComparison = z.infer<typeof AssetComparisonSchema>;
// Explicit labels from the crawlable catalog, scoped to this stock/ETF product.
// Robinhood entities stay separate; their shared protocol context is not a token grade.
export const ASSET_ISSUER_PROTOCOLS: Readonly<Record<string, string>> = {
  Ondo: "ondo-global-markets", xStocks: "xstocks", Dinari: "dinari",
  Robinhood: "robinhood", "Robinhood · EU": "robinhood",
};
export const COMPARISON_ASSET_IDS = ["aapl-us0378331005-xnas"] as const;
export const assetSourceUrl = (id: string) => `https://tokenizedstonks.io/assets/${encodeURIComponent(id)}`;
export function getAssetCatalog(): AssetCatalog | null {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    try {
      return AssetCatalogSchema.parse(JSON.parse(readFileSync(join(dir, "data/enrichment/asset-catalog.json"), "utf8")));
    } catch { /* Missing or invalid snapshots must not produce fabricated coverage. */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
