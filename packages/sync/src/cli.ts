#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProtocolSnapshot, Snapshot } from "@defibeat/registry";
import type { LlamaProtocol } from "./types";
import { normalizeProtocol } from "./normalize";
import { carryForward } from "./carry-forward";
import { buildSummary, formatSummary } from "./summary";

const CONTACT = "https://github.com/guil-lambert/defibeat";
const LLAMA_URL = "https://api.llama.fi/protocols";

function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

async function fetchLlama(): Promise<LlamaProtocol[]> {
  const res = await fetch(LLAMA_URL, {
    headers: { "User-Agent": `DefiBeat (+${CONTACT})` },
  });
  if (!res.ok) {
    throw new Error(`DeFiLlama ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as LlamaProtocol[];
  if (!Array.isArray(json)) {
    throw new Error("DeFiLlama response was not an array");
  }
  return json;
}

function loadPrevious(snapshotPath: string): Snapshot | null {
  if (!existsSync(snapshotPath)) return null;
  const raw = readFileSync(snapshotPath, "utf8");
  const parsed = JSON.parse(raw) as Snapshot;
  if (!parsed.protocols) return null;
  return parsed;
}

function writeAtomic(path: string, data: string): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

async function main(): Promise<void> {
  const start = Date.now();
  const repoRoot = resolve(process.env.DEFIBEAT_REPO_ROOT ?? findRepoRoot());
  const snapshotPath = join(repoRoot, "data", "defillama-snapshot.json");

  console.error(`[sync] fetching ${LLAMA_URL}`);
  const entries = await fetchLlama();
  console.error(`[sync] received ${entries.length} entries`);

  const generatedAt = new Date().toISOString();
  const knownSlugs = new Set(entries.map((e) => e.slug).filter((s): s is string => !!s));

  const fresh: Record<string, ProtocolSnapshot> = {};
  for (const entry of entries) {
    if (!entry.slug || !entry.name) continue;
    fresh[entry.slug] = normalizeProtocol(entry, generatedAt, knownSlugs);
  }

  const previous = loadPrevious(snapshotPath);
  const protocols = carryForward(fresh, previous, generatedAt);

  const sortedSlugs = Object.keys(protocols).sort();
  const orderedProtocols: Record<string, ProtocolSnapshot> = {};
  for (const slug of sortedSlugs) orderedProtocols[slug] = protocols[slug]!;

  const snapshot: Snapshot = { generated_at: generatedAt, protocols: orderedProtocols };
  writeAtomic(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n");

  const summary = buildSummary(protocols, previous);
  process.stdout.write(formatSummary(summary));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.error(`[sync] wrote ${Object.keys(protocols).length} protocols to ${snapshotPath} in ${elapsed}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
