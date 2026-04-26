import { describe, expect, it } from "vitest";

import { chainNameToId, isSupportedChain } from "./chain-id.js";

describe("chainNameToId", () => {
  it("maps canonical chain names", () => {
    expect(chainNameToId("ethereum")).toBe(1);
    expect(chainNameToId("arbitrum")).toBe(42161);
    expect(chainNameToId("optimism")).toBe(10);
    expect(chainNameToId("base")).toBe(8453);
    expect(chainNameToId("polygon")).toBe(137);
    expect(chainNameToId("bsc")).toBe(56);
  });

  it("treats common adapter aliases as the same chain", () => {
    expect(chainNameToId("xdai")).toBe(chainNameToId("gnosis"));
    expect(chainNameToId("avax")).toBe(chainNameToId("avalanche"));
    expect(chainNameToId("era")).toBe(chainNameToId("zksync"));
  });

  it("is case-insensitive on the chain key", () => {
    expect(chainNameToId("Ethereum")).toBe(1);
    expect(chainNameToId("ARBITRUM")).toBe(42161);
  });

  it("returns null for unknown / unsupported / null input", () => {
    expect(chainNameToId(null)).toBeNull();
    expect(chainNameToId("solana")).toBeNull(); // non-EVM
    expect(chainNameToId("madeupchain")).toBeNull();
  });

  it("isSupportedChain agrees with chainNameToId", () => {
    expect(isSupportedChain("ethereum")).toBe(true);
    expect(isSupportedChain("solana")).toBe(false);
    expect(isSupportedChain(null)).toBe(false);
  });
});
