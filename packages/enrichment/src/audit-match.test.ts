import { describe, expect, it } from "vitest";

import { firmFromUrl, isMatch, tokenize } from "./audit-match.js";

describe("tokenize", () => {
  it("splits and lowercases", () => {
    expect(tokenize("Trail-of-Bits Pendle Yield Protocol")).toEqual(["trail", "bits", "pendle"]);
  });
  it("drops short and stop tokens", () => {
    expect(tokenize("Aave V3 Protocol")).toEqual(["aave"]);
  });
  it("returns empty for empty input", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("isMatch", () => {
  it("matches on a strong shared token", () => {
    expect(
      isMatch(
        { slug: "pendle", name: "Pendle Finance" },
        { tokens: ["pendle", "v2", "core"] },
      ),
    ).toBe(true);
  });
  it("rejects when only short tokens overlap", () => {
    expect(
      isMatch(
        { slug: "uni", name: "Uni" },
        { tokens: ["uni", "something"] },
      ),
    ).toBe(false);
  });
  it("rejects when no overlap", () => {
    expect(
      isMatch(
        { slug: "aave", name: "Aave" },
        { tokens: ["compound", "lending"] },
      ),
    ).toBe(false);
  });
  it("matches via display name when slug is opaque", () => {
    expect(
      isMatch(
        { slug: "uniswap-v3", name: "Uniswap" },
        { tokens: ["uniswap", "v3"] },
      ),
    ).toBe(true);
  });
});

describe("firmFromUrl", () => {
  it("identifies OpenZeppelin blog", () => {
    expect(firmFromUrl("https://blog.openzeppelin.com/uniswap-audit/")).toBe("OpenZeppelin");
  });
  it("identifies Trail of Bits via github path", () => {
    expect(
      firmFromUrl("https://github.com/trailofbits/publications/blob/master/reviews/x.pdf"),
    ).toBe("Trail of Bits");
  });
  it("returns null for unknown hosts", () => {
    expect(firmFromUrl("https://example.com/audit.pdf")).toBe(null);
  });
  it("handles malformed urls", () => {
    expect(firmFromUrl("not a url")).toBe(null);
  });
});
