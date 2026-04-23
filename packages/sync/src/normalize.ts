import type { ProtocolSnapshot } from "@defipunkd/registry";
import type { LlamaParentProtocol, LlamaProtocol } from "./types";
import { parentSlugFromId } from "./types";

export function normalizeForkedFrom(raw: LlamaProtocol["forkedFrom"]): number[] | null {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return null;
  const out: number[] = [];
  for (const v of raw) {
    const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
    if (Number.isFinite(n)) out.push(n);
  }
  return out.length > 0 ? out : null;
}

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
  if (knownSlugs.has(raw)) return raw;
  const stripped = parentSlugFromId(raw);
  if (knownSlugs.has(stripped)) return stripped;
  return null;
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
    forked_from: normalizeForkedFrom(entry.forkedFrom),
    logo: entry.logo ?? null,
    is_dead: isDead(entry),
    is_parent: false,
    first_seen_at: generatedAt,
    last_seen_at: generatedAt,
    delisted_at: null,
  };
}

export function normalizeParent(
  parent: LlamaParentProtocol,
  generatedAt: string,
): ProtocolSnapshot {
  const slug = parentSlugFromId(parent.id);
  return {
    slug,
    name: parent.name,
    category: "",
    chains: parent.chains ?? [],
    tvl: null,
    tvl_by_chain: {},
    website: parent.url ?? null,
    twitter: parent.twitter ?? null,
    github: parent.github ?? null,
    audit_count: 0,
    audit_links: [],
    hallmarks: [],
    parent_slug: null,
    forked_from: null,
    logo: parent.logo ?? null,
    is_dead: false,
    is_parent: true,
    first_seen_at: generatedAt,
    last_seen_at: generatedAt,
    delisted_at: null,
  };
}
