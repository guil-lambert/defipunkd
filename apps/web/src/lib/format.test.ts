import { describe, expect, it } from "vitest";
import { auditorDomain, EM_DASH, formatTvl, formatUtc, parseHallmarks, primaryChain } from "./format";

describe("formatTvl", () => {
  it("formats B / M / K with one decimal", () => {
    expect(formatTvl(42_300_000)).toBe("$42.3M");
    expect(formatTvl(1_500_000_000)).toBe("$1.5B");
    expect(formatTvl(25_000)).toBe("$25.0K");
  });
  it("renders zero literally", () => {
    expect(formatTvl(0)).toBe("$0");
  });
  it("null / undefined become em-dash", () => {
    expect(formatTvl(null)).toBe(EM_DASH);
    expect(formatTvl(undefined)).toBe(EM_DASH);
  });
  it("sub-thousand values print as dollars", () => {
    expect(formatTvl(42)).toBe("$42");
  });
});

describe("formatUtc", () => {
  it("formats ISO input as YYYY-MM-DD HH:mm UTC", () => {
    expect(formatUtc("2026-04-21T14:02:00.000Z")).toBe("2026-04-21 14:02 UTC");
  });
  it("em-dash on null / invalid", () => {
    expect(formatUtc(null)).toBe(EM_DASH);
    expect(formatUtc("not a date")).toBe(EM_DASH);
  });
});

describe("auditorDomain", () => {
  it("extracts domain, strips www", () => {
    expect(auditorDomain("https://www.trailofbits.com/reports/foo.pdf")).toBe("trailofbits.com");
    expect(auditorDomain("https://certora.com/x")).toBe("certora.com");
  });
  it("returns null on bad URL", () => {
    expect(auditorDomain("not a url")).toBeNull();
  });
});

describe("parseHallmarks", () => {
  it("parses tuples, drops malformed, sorts chronologically", () => {
    const h = parseHallmarks([
      [1700000000, "later"],
      [1600000000, "earlier"],
      ["bad", "drop"],
      [1650000000],
    ]);
    expect(h).toEqual([
      { unixTs: 1600000000, description: "earlier" },
      { unixTs: 1700000000, description: "later" },
    ]);
  });
  it("empty and non-array inputs produce []", () => {
    expect(parseHallmarks([])).toEqual([]);
    expect(parseHallmarks(null)).toEqual([]);
    expect(parseHallmarks("garbage")).toEqual([]);
  });
});

describe("primaryChain", () => {
  it("returns null for empty map", () => {
    expect(primaryChain({})).toBeNull();
  });
  it("picks single chain", () => {
    expect(primaryChain({ Ethereum: 100 })).toBe("Ethereum");
  });
  it("picks highest TVL", () => {
    expect(primaryChain({ Ethereum: 100, Arbitrum: 200 })).toBe("Arbitrum");
  });
  it("ties break alphabetically", () => {
    expect(primaryChain({ Ethereum: 100, Arbitrum: 100 })).toBe("Arbitrum");
  });
});
