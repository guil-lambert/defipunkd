import { bucketCategory, type Tab } from "./category-map";
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
  delisted_at: string | null;
};

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

export function filterAndSort(rows: LandingRow[], opts: FilterOptions): LandingRow[] {
  const visible = rows.filter((r) => {
    if (r.delisted_at) return false;
    if (r.is_parent) return false;
    if (r.is_dead && !opts.showInactive) return false;
    if (opts.tab === "All") return true;
    return bucketCategory(r.category) === opts.tab;
  });
  const searched = rankMatch(visible, opts.query);
  if (opts.query.trim()) return searched;
  return [...searched].sort(tvlSortDesc);
}

export function tabCounts(rows: LandingRow[]): Record<Tab, number> {
  const counts: Record<string, number> = { All: 0 };
  for (const r of rows) {
    if (r.delisted_at) continue;
    if (r.is_parent) continue;
    if (r.is_dead) continue;
    counts.All = (counts.All ?? 0) + 1;
    const bucket = bucketCategory(r.category);
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts as Record<Tab, number>;
}
