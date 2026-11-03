#!/usr/bin/env node
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TOKENIZED_ISSUERS, TOKENIZED_STONKS_URL, TokenizedAssetsSchema, normalizeTokenizedIssuer } from "@defipunkd/registry";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const snapshot = JSON.parse(readFileSync(join(root, "data/defillama-snapshot.json"), "utf8"));
const updates: Array<{ path: string; content: string }> = [];
// Sequential, bounded requests: five issuer views per weekly refresh.
// Validate every response before replacing any last-known-good snapshot.
for (const [slug, issuerIds] of Object.entries(TOKENIZED_ISSUERS)) {
  if (!snapshot.protocols[slug]) throw new Error(`Unknown protocol mapping: ${slug}`);
  const issuers = [];
  for (const id of issuerIds) {
    const params = new URLSearchParams({ kind: "issuer", scope_id: id, view: "screen" });
    const response = await fetch(`${TOKENIZED_STONKS_URL}/api/analytics?${params}`, {
      headers: { "User-Agent": "DeFiPunkd/1.0 (+https://defipunkd.com)", Accept: "application/json" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Tokenized Stonks ${id}: HTTP ${response.status}; retaining saved data`);
    issuers.push(normalizeTokenizedIssuer(await response.json(), id));
    console.log(`${slug}: ${id}, ${issuers.at(-1)!.asset_count ?? "unknown"} covered assets`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  const data = TokenizedAssetsSchema.parse({ schema_version: 1, slug, fetched_at: new Date().toISOString(), issuers });
  updates.push({ path: join(root, "data/enrichment", slug, "tokenized-assets.json"), content: JSON.stringify(data, null, 2) + "\n" });
}
for (const { path, content } of updates) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, content);
  renameSync(`${path}.tmp`, path);
}
console.log(`Saved ${updates.length} protocol snapshots`);
