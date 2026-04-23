import { bucketCategory, CHAIN_TABS, isCexCategory, isChainTab, type Tab } from "./category-map";
import { rankMatch } from "./search";
import { dominantChildGrade, type GradeColor } from "./verifiability";
export type { GradeColor } from "./verifiability";

export type LandingRow = {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  primary_chain: string | null;
  tvl: number | null;
  is_dead: boolean;
  is_parent: boolean;
  parent_slug: string | null;
  delisted_at: string | null;
  logo: string | null;
  verifiability_grade: GradeColor;
  dependencies_grade: GradeColor;
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
        dependencies_grade: dominantChildGrade(kids, (k) => k.dependencies_grade),
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
  tab: Tab;
  query: string;
  showInactive: boolean;
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
  const query = opts.query.trim();
  if (query) {
    const pool: LandingNode[] = [];
    for (const n of nodes) {
      if (!includeInBrowse(n, opts)) continue;
      const parentMatches = rankMatch([n], query).length > 0;
      if (parentMatches) {
        pool.push(n);
        continue;
      }
      if (n.children && n.children.length > 0) {
        for (const c of n.children) {
          if (!includeInBrowse(c, opts)) continue;
          if (rankMatch([c], query).length > 0) pool.push(c);
        }
      }
    }
    return rankMatch(pool, query);
  }

  const visible = nodes.filter((n) => {
    if (!includeInBrowse(n, opts)) return false;
    if (opts.tab === "All") return true;
    if (opts.tab === "DeFi") return !isCexCategory(n.category);
    if (isChainTab(opts.tab)) return n.chains.includes(opts.tab);
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
    for (const chain of CHAIN_TABS) {
      if (n.chains.includes(chain)) counts[chain] = (counts[chain] ?? 0) + 1;
    }
  }
  return counts as Record<Tab, number>;
}
