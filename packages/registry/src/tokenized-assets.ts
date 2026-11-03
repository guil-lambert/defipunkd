import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

export const TOKENIZED_STONKS_URL = "https://tokenizedstonks.io";
// Explicit product mappings: never infer an issuer from a protocol's name or category.
export const TOKENIZED_ISSUERS: Record<string, readonly string[]> = {
  "ondo-global-markets": ["ondo-global-markets"],
  xstocks: ["backed-assets-je"],
  dinari: ["dinari"],
  robinhood: ["rheu", "rhj"],
};
const text = z.string().min(1);
const count = z.number().int().nonnegative();
const timestamp = z.string().datetime({ offset: true });
const entity = z.object({ id: text, name: text });
const asset = entity.extend({ symbol: text, asset_type: text });
const issuer = entity.extend({
  as_of: timestamp,
  asset_count: count.nullable(),
  representation_count: count.nullable(),
  networks: z.array(entity),
  examples: z.array(asset).max(5),
});
export const TokenizedAssetsSchema = z.object({
  schema_version: z.literal(1),
  slug: text,
  fetched_at: timestamp,
  issuers: z.array(issuer).min(1),
});
export type TokenizedAssets = z.infer<typeof TokenizedAssetsSchema>;

const analyticsSchema = z.object({
  dataset_mode: z.literal("live"),
  scope: z.object({ kind: z.literal("issuer"), id: text }),
  as_of: timestamp,
  overview: z.object({ asset_count: count.nullable(), representation_count: count.nullable(), network_count: count }),
  registry: z.object({
    issuers: z.array(entity.extend({ network_ids: z.array(text) })),
    networks: z.array(entity),
  }),
  rankings: z.object({ assets: z.array(asset) }),
});

/** Keep catalog summaries only; discard prices, liquidity and partner observations. */
export function normalizeTokenizedIssuer(raw: unknown, issuerId: string): TokenizedAssets["issuers"][number] {
  const data = analyticsSchema.parse(raw);
  if (data.scope.id !== issuerId) throw new Error(`Wrong issuer scope: ${data.scope.id}`);
  const source = data.registry.issuers.find((i) => i.id === issuerId);
  if (!source) throw new Error(`Missing issuer ${issuerId}`);
  const ids = [...new Set(source.network_ids)];
  if (ids.length !== data.overview.network_count) throw new Error(`Incomplete network coverage for ${issuerId}`);
  const networks = ids.map((id) => {
    const network = data.registry.networks.find((n) => n.id === id);
    if (!network) throw new Error(`Unknown network ${id}`);
    return network;
  }).sort((a, b) => a.name.localeCompare(b.name));
  if (data.overview.asset_count === 0 && data.rankings.assets.length > 0) throw new Error("Inconsistent empty catalog");
  if (data.overview.asset_count !== null && data.rankings.assets.length > data.overview.asset_count) throw new Error("Asset samples exceed catalog count");
  if (new Set(data.rankings.assets.map((a) => a.id)).size !== data.rankings.assets.length) throw new Error("Duplicate asset samples");
  return {
    id: source.id, name: source.name, as_of: data.as_of,
    asset_count: data.overview.asset_count,
    representation_count: data.overview.representation_count,
    networks,
    examples: data.rankings.assets.slice(0, 5),
  };
}

/** Read the bundled snapshot. No upstream requests during page rendering. */
export function getTokenizedAssets(slug: string): TokenizedAssets | null {
  const expected = TOKENIZED_ISSUERS[slug];
  if (!expected) return null;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    try {
      const parsed = TokenizedAssetsSchema.safeParse(JSON.parse(readFileSync(join(dir, "data", "enrichment", slug, "tokenized-assets.json"), "utf8")));
      if (!parsed.success || parsed.data.slug !== slug) return null;
      const actual = parsed.data.issuers.map((s) => s.id);
      if (actual.length !== expected.length || expected.some((id) => !actual.includes(id))) return null;
      return parsed.data;
    } catch { /* Find repo root; a missing cache leaves the section hidden. */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function tokenizedIssuerUrl(id: string): string {
  return `${TOKENIZED_STONKS_URL}/#/issuers/${encodeURIComponent(id)}`;
}
export function tokenizedAssetUrl(id: string): string {
  return `${TOKENIZED_STONKS_URL}/#/asset/${encodeURIComponent(id)}`;
}
