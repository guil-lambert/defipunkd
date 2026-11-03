#!/usr/bin/env node
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AssetCatalogSchema, COMPARISON_ASSET_IDS, assetSourceUrl } from "@defipunkd/registry";
import { parseAssetComparison, parseAssetDirectory } from "../asset-catalog";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
async function fetchPage(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "DeFiPunkd/1.0 (+https://defipunkd.com)", Accept: "text/html" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Asset catalog HTTP ${response.status}: ${url}; retaining saved data`);
  return response.text();
}
const assets = parseAssetDirectory(await fetchPage("https://tokenizedstonks.io/assets"));
const comparisons = [];
for (const id of COMPARISON_ASSET_IDS) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  comparisons.push(parseAssetComparison(await fetchPage(assetSourceUrl(id)), id));
}
const data = AssetCatalogSchema.parse({ schema_version: 1, fetched_at: new Date().toISOString(), assets, comparisons });
const path = join(root, "data/enrichment/asset-catalog.json");
mkdirSync(dirname(path), { recursive: true });
writeFileSync(`${path}.tmp`, JSON.stringify(data, null, 2) + "\n");
renameSync(`${path}.tmp`, path);
console.log(`Saved ${assets.length} directory assets and ${comparisons.length} comparisons`);
