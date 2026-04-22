import type { ProtocolSnapshot } from "@defibeat/registry";
import type { LlamaProtocol } from "./types";

export function isDead(entry: LlamaProtocol): boolean {
  if (entry.deadUrl) return true;
  if (entry.deadFrom !== null && entry.deadFrom !== undefined && entry.deadFrom !== "") return true;
  const category = (entry.category ?? "").toLowerCase();
  if (category.includes("dead") || category.includes("inactive")) return true;
  return false;
}

export function parseAuditCount(raw: LlamaProtocol["audits"]): number {
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function resolveParentSlug(
  entry: LlamaProtocol,
  knownSlugs: Set<string>,
): string | null {
  const raw = entry.parentProtocol;
  if (!raw) return null;
  return knownSlugs.has(raw) ? raw : null;
}

export function normalizeProtocol(
  entry: LlamaProtocol,
  generatedAt: string,
  knownSlugs: Set<string>,
): ProtocolSnapshot {
  const tvlByChain: Record<string, number> = {};
  if (entry.chainTvls) {
    for (const [chain, value] of Object.entries(entry.chainTvls)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        tvlByChain[chain] = value;
      }
    }
  }
  return {
    slug: entry.slug,
    name: entry.name,
    category: entry.category ?? "",
    chains: entry.chains ?? [],
    tvl: typeof entry.tvl === "number" ? entry.tvl : null,
    tvl_by_chain: tvlByChain,
    website: entry.url ?? null,
    twitter: entry.twitter ?? null,
    github: entry.github ?? null,
    audit_count: parseAuditCount(entry.audits),
    audit_links: entry.audit_links ?? [],
    hallmarks: entry.hallmarks ?? [],
    parent_slug: resolveParentSlug(entry, knownSlugs),
    is_dead: isDead(entry),
    first_seen_at: generatedAt,
    last_seen_at: generatedAt,
    delisted_at: null,
  };
}
