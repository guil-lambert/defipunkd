import { describe, expect, it } from "vitest";
import { rankMatch, type Searchable } from "./search";

const items: Searchable[] = [
  { slug: "uniswap-v3", name: "Uniswap V3", category: "Dexes" },
  { slug: "sushiswap", name: "SushiSwap", category: "Dexes" },
  { slug: "aave-v3", name: "Aave V3", category: "Lending" },
  { slug: "panswap", name: "Panswap", category: "Dexes" },
];

describe("rankMatch", () => {
  it("prefix match ranks above mid-string match", () => {
    const out = rankMatch(items, "pan");
    expect(out[0]?.slug).toBe("panswap");
  });

  it("case-insensitive", () => {
    expect(rankMatch(items, "UNISWAP").map((x) => x.slug)).toContain("uniswap-v3");
    expect(rankMatch(items, "UNISWAP")[0]?.slug).toBe("uniswap-v3");
  });

  it("empty query returns input unchanged", () => {
    expect(rankMatch(items, "")).toEqual(items);
    expect(rankMatch(items, "   ")).toEqual(items);
  });

  it("filters out non-matches", () => {
    expect(rankMatch(items, "zzz-no-match")).toEqual([]);
  });

  it("category is a matchable field", () => {
    const out = rankMatch(items, "Lending");
    expect(out.map((x) => x.slug)).toContain("aave-v3");
  });

  it("name match outranks slug match on the same query when both are prefix", () => {
    const pool: Searchable[] = [
      { slug: "test-foo", name: "Other", category: "" },
      { slug: "other", name: "Test Foo", category: "" },
    ];
    const out = rankMatch(pool, "test");
    expect(out[0]?.slug).toBe("other");
  });
});
