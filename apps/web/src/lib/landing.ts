import { bucketCategory, CHAIN_TABS, isCexCategory, type CategoryTab, type ChainTab, type Tab } from "./category-map";
import { rankMatch } from "./search";
import { dominantChildGrade, type GradeColor } from "./verifiability";
import { maxTier, type Tier } from "./tier";
export type { GradeColor } from "./verifiability";

export type LandingRow = {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  primary_chain: string | null;
  tvl: number | null;
  tvl_by_chain?: Record<string, number>;
  is_dead: boolean;
  is_parent: boolean;
  parent_slug: string | null;
  delisted_at: string | null;
  logo: string | null;
  verifiability_grade: GradeColor;
  autonomy_grade: GradeColor;
  assessment_grades?: Partial<Record<"control" | "ability-to-exit" | "autonomy" | "open-access" | "verifiability", GradeColor>>;
  tier?: Tier;
};

export type LandingNode = LandingRow & { children?: LandingRow[] };

export function sumTvl(children: LandingRow[]): number | null {
  let total = 0;
  let any = false;
  for (const c of children) {
    if (typeof c.tvl === "number") {
      total += c.tvl;
      any = true;
    }
  }
  return any ? total : null;
}

export function dominantCategory(children: LandingRow[]): string {
  let bestCategory = "";
  let bestTvl = -Infinity;
  let bestSlug = "";
  for (const c of children) {
    const tvl = typeof c.tvl === "number" ? c.tvl : -1;
    if (tvl > bestTvl || (tvl === bestTvl && c.slug < bestSlug)) {
      bestTvl = tvl;
      bestSlug = c.slug;
      bestCategory = c.category || "";
    }
  }
  return bestCategory;
}

export function buildNodes(rows: LandingRow[]): LandingNode[] {
  const bySlug = new Map<string, LandingRow>();
  for (const r of rows) bySlug.set(r.slug, r);

  const childrenByParent = new Map<string, LandingRow[]>();
  for (const r of rows) {
    if (r.is_parent) continue;
    if (!r.parent_slug) continue;
    if (!bySlug.has(r.parent_slug)) continue;
    const bucket = childrenByParent.get(r.parent_slug) ?? [];
    bucket.push(r);
    childrenByParent.set(r.parent_slug, bucket);
  }

  const nested = new Set<string>();
  const nodes: LandingNode[] = [];
  for (const r of rows) {
    if (r.is_parent) {
      const kids = childrenByParent.get(r.slug);
      if (!kids || kids.length === 0) continue;
      for (const k of kids) nested.add(k.slug);
      const derivedCategory = r.category || dominantCategory(kids);
      nodes.push({
        ...r,
        category: derivedCategory,
        tvl: sumTvl(kids),
        verifiability_grade: dominantChildGrade(kids, (k) => k.verifiability_grade),
        autonomy_grade: dominantChildGrade(kids, (k) => k.autonomy_grade),
        tier: maxTier([r.tier ?? "none", ...kids.map((k) => k.tier ?? "none")]),
        children: [...kids].sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1)),
      });
    }
  }
  for (const r of rows) {
    if (r.is_parent) continue;
    if (nested.has(r.slug)) continue;
    nodes.push(r);
  }
  return nodes;
}


export function tvlSortDesc(a: LandingRow, b: LandingRow): number {
  if (a.tvl === null && b.tvl === null) return a.slug.localeCompare(b.slug);
  if (a.tvl === null) return 1;
  if (b.tvl === null) return -1;
  return b.tvl - a.tvl;
}

export type SortField = "tvl" | "name" | "chain" | "type";
export type SortDir = "asc" | "desc";

export type FilterOptions = {
  tab: CategoryTab;
  chainTab?: ChainTab | "All";
  query: string;
  showInactive: boolean;
  tiers?: ReadonlySet<Tier>;
  sort?: { field: SortField; dir: SortDir };
};

const STRING_NULL_LAST = (a: string, b: string, dir: SortDir) => {
  const aEmpty = !a;
  const bEmpty = !b;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
};

function compareNodes(a: LandingNode, b: LandingNode, field: SortField, dir: SortDir): number {
  switch (field) {
    case "name":
      return STRING_NULL_LAST(a.name || "", b.name || "", dir) || a.slug.localeCompare(b.slug);
    case "chain":
      return (
        STRING_NULL_LAST(a.primary_chain ?? "", b.primary_chain ?? "", dir) ||
        a.slug.localeCompare(b.slug)
      );
    case "type":
      return STRING_NULL_LAST(a.category || "", b.category || "", dir) || a.slug.localeCompare(b.slug);
    case "tvl": {
      if (a.tvl === null && b.tvl === null) return a.slug.localeCompare(b.slug);
      if (a.tvl === null) return 1;
      if (b.tvl === null) return -1;
      return dir === "asc" ? a.tvl - b.tvl : b.tvl - a.tvl;
    }
  }
}

function includeInBrowse(r: LandingRow, opts: FilterOptions): boolean {
  if (r.delisted_at) return false;
  if (r.is_dead && !opts.showInactive) return false;
  return true;
}

export function filterAndSortNodes(nodes: LandingNode[], opts: FilterOptions): LandingNode[] {
  const tiers = opts.tiers && opts.tiers.size > 0 ? opts.tiers : null;
  const matchesTier = (n: LandingNode | LandingRow): boolean =>
    !tiers || tiers.has((n.tier ?? "none") as Tier);
  const query = opts.query.trim();
  if (query) {
    const pool: LandingNode[] = [];
    for (const n of nodes) {
      if (!includeInBrowse(n, opts)) continue;
      if (!matchesTier(n)) continue;
      const parentMatches = rankMatch([n], query).length > 0;
      if (parentMatches) {
        pool.push(n);
        continue;
      }
      if (n.children && n.children.length > 0) {
        for (const c of n.children) {
          if (!includeInBrowse(c, opts)) continue;
          if (!matchesTier(c)) continue;
          if (rankMatch([c], query).length > 0) pool.push(c);
        }
      }
    }
    return rankMatch(pool, query);
  }

  const visible = nodes.filter((n) => {
    if (!includeInBrowse(n, opts)) return false;
    if (!matchesTier(n)) return false;
    if (opts.chainTab && opts.chainTab !== "All" && !n.chains.includes(opts.chainTab)) return false;
    if (opts.tab === "All") return true;
    if (opts.tab === "DeFi") return !isCexCategory(n.category);
    return bucketCategory(n.category) === opts.tab;
  });
  const sort = opts.sort ?? { field: "tvl" as const, dir: "desc" as const };
  return [...visible].sort((a, b) => compareNodes(a, b, sort.field, sort.dir));
}

export function filterAndSort(rows: LandingRow[], opts: FilterOptions): LandingNode[] {
  const visible = rows.filter((r) => !r.is_parent);
  return filterAndSortNodes(visible, opts);
}

export function tabCounts(rows: LandingRow[]): Record<Tab, number> {
  return tabCountsFromNodes(rows.filter((r) => !r.is_parent));
}

export function tabCountsFromNodes(nodes: LandingNode[]): Record<Tab, number> {
  const counts: Record<string, number> = { All: 0, DeFi: 0 };
  for (const n of nodes) {
    if (n.delisted_at) continue;
    if (n.is_dead) continue;
    counts.All = (counts.All ?? 0) + 1;
    if (!isCexCategory(n.category)) counts.DeFi = (counts.DeFi ?? 0) + 1;
    const bucket = bucketCategory(n.category);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts as Record<Tab, number>;
}

export type ChainTabKey = ChainTab | "All";

export function chainTvlFromNodes(nodes: LandingNode[]): Record<ChainTabKey, number> {
  const tvl: Record<string, number> = { All: 0 };
  for (const c of CHAIN_TABS) tvl[c] = 0;
  for (const n of nodes) {
    if (n.delisted_at) continue;
    if (n.is_dead) continue;
    if (typeof n.tvl === "number") tvl.All = (tvl.All ?? 0) + n.tvl;
    for (const c of CHAIN_TABS) {
      const v = n.tvl_by_chain?.[c];
      if (typeof v === "number") tvl[c] = (tvl[c] ?? 0) + v;
    }
  }
  return tvl as Record<ChainTabKey, number>;
}
