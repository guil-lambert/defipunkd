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
  it("rejects when both sides have versions but they don't agree", () => {
    expect(
      isMatch(
        { slug: "uniswap-v3", name: "Uniswap V3" },
        { tokens: ["uniswap", "core"], raw_name: "uniswap-v4-core" },
      ),
    ).toBe(false);
  });
  it("matches when both sides have the same version", () => {
    expect(
      isMatch(
        { slug: "uniswap-v3", name: "Uniswap V3" },
        { tokens: ["uniswap", "core"], raw_name: "uniswap-v3-core" },
      ),
    ).toBe(true);
  });
  it("matches when only the audit has a version (parent protocol)", () => {
    // Aave parent (no version in slug/name) should still get all v3/v4 audits.
    expect(
      isMatch(
        { slug: "aave", name: "Aave" },
        { tokens: ["aave"], raw_name: "aave-v4" },
      ),
    ).toBe(true);
  });
  it("matches when only the protocol has a version (versionless audit)", () => {
    // Aave-v3 should still get a generic "Aave Lens" audit with no v in name.
    expect(
      isMatch(
        { slug: "aave-v3", name: "Aave V3" },
        { tokens: ["aave", "lens"], raw_name: "aave-lens" },
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
