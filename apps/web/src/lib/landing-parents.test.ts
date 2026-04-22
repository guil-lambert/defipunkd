import { describe, expect, it } from "vitest";
import { filterAndSort, tabCounts, type LandingRow } from "./landing";

function row(overrides: Partial<LandingRow>): LandingRow {
  return {
    slug: "x",
    name: "X",
    category: "Lending",
    chains: ["Ethereum"],
    primary_chain: "Ethereum",
    tvl: 100,
    is_dead: false,
    is_parent: false,
    parent_slug: null,
    delisted_at: null,
    ...overrides,
  };
}

describe("landing excludes parent protocols", () => {
  const rows: LandingRow[] = [
    row({ slug: "child-a", tvl: 100 }),
    row({ slug: "parent-a", tvl: null, is_parent: true, category: "" }),
    row({ slug: "child-b", tvl: 50 }),
  ];

  it("parents are hidden from the default list", () => {
    const out = filterAndSort(rows, { tab: "All", query: "", showInactive: false });
    expect(out.map((r) => r.slug)).toEqual(["child-a", "child-b"]);
  });

  it("parents are hidden even with show-inactive on", () => {
    const out = filterAndSort(rows, { tab: "All", query: "", showInactive: true });
    expect(out.map((r) => r.slug)).not.toContain("parent-a");
  });

  it("parents are excluded from tab counts", () => {
    const counts = tabCounts(rows);
    expect(counts.All).toBe(2);
    expect(counts.Others ?? 0).toBe(0);
  });
});
