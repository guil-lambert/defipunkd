import { bucketCategory, isCexCategory, type Tab } from "./category-map";
import { rankMatch } from "./search";

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
  const counts = new Map<string, number>();
  for (const c of children) {
    const k = c.category || "";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = "";
  let bestCount = -1;
  for (const [k, n] of counts) {
    if (n > bestCount) {
      best = k;
      bestCount = n;
    }
  }
  return best;
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

export type FilterOptions = {
  tab: Tab;
  query: string;
  showInactive: boolean;
};

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
    return bucketCategory(n.category) === opts.tab;
  });
  return [...visible].sort(tvlSortDesc);
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
