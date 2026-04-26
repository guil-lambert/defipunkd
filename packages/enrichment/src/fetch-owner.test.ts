import { describe, expect, it, vi } from "vitest";

import { fetchOwner } from "./fetch-owner.js";
import type { FetchFn } from "./fetch-etherscan.js";

function fakeFetch(payload: unknown, ok = true, status = 200): FetchFn {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => payload,
  }));
}

describe("fetchOwner", () => {
  it("decodes a 32-byte padded address from eth_call result", async () => {
    const padded = "0x000000000000000000000000abcdef0123456789abcdef0123456789abcdef01";
    const f = fakeFetch({ jsonrpc: "2.0", id: 1, result: padded });
    const r = await fetchOwner({
      chain: "ethereum",
      address: "0x1111111111111111111111111111111111111111",
      apiKey: "TESTKEY",
      fetch: f,
    });
    expect(r.owner).toBe("0xabcdef0123456789abcdef0123456789abcdef01");
    expect(r.warnings).toEqual([]);
  });

  it("returns null (not an error) when the contract has no owner() function", async () => {
    const f = fakeFetch({
      jsonrpc: "2.0",
      id: 1,
      error: { code: 3, message: "execution reverted" },
    });
    const r = await fetchOwner({
      chain: "ethereum",
      address: "0x1111111111111111111111111111111111111111",
      apiKey: "TESTKEY",
      fetch: f,
    });
    expect(r.owner).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it("returns null when the result is the zero address (renounced)", async () => {
    const f = fakeFetch({
      jsonrpc: "2.0",
      id: 1,
      result: "0x0000000000000000000000000000000000000000000000000000000000000000",
    });
    const r = await fetchOwner({
      chain: "ethereum",
      address: "0x1111111111111111111111111111111111111111",
      apiKey: "TESTKEY",
      fetch: f,
    });
    expect(r.owner).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it("returns null when the result is empty / 0x", async () => {
    const f = fakeFetch({ jsonrpc: "2.0", id: 1, result: "0x" });
    const r = await fetchOwner({
      chain: "ethereum",
      address: "0x1111111111111111111111111111111111111111",
      apiKey: "TESTKEY",
      fetch: f,
    });
    expect(r.owner).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it("treats status=0 with revert message as 'no owner', not an error", async () => {
    const f = fakeFetch({
      status: "0",
      message: "NOTOK",
      result: "execution reverted: no owner",
    });
    const r = await fetchOwner({
      chain: "ethereum",
      address: "0x1111111111111111111111111111111111111111",
      apiKey: "TESTKEY",
      fetch: f,
    });
    expect(r.owner).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it("warns on unsupported chain without making a request", async () => {
    const f = vi.fn();
    const r = await fetchOwner({
      chain: "solana",
      address: "0x1111111111111111111111111111111111111111",
      apiKey: "TESTKEY",
      fetch: f as unknown as FetchFn,
    });
    expect(r.owner).toBeNull();
    expect(r.warnings[0]).toContain("unsupported chain");
    expect(f).not.toHaveBeenCalled();
  });

  it("records http errors as warnings", async () => {
    const f = fakeFetch({}, false, 503);
    const r = await fetchOwner({
      chain: "ethereum",
      address: "0x1111111111111111111111111111111111111111",
      apiKey: "TESTKEY",
      fetch: f,
    });
    expect(r.owner).toBeNull();
    expect(r.warnings[0]).toContain("http 503");
  });

  it("records unexpected error messages as warnings", async () => {
    const f = fakeFetch({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32000, message: "something else broke" },
    });
    const r = await fetchOwner({
      chain: "ethereum",
      address: "0x1111111111111111111111111111111111111111",
      apiKey: "TESTKEY",
      fetch: f,
    });
    expect(r.owner).toBeNull();
    expect(r.warnings[0]).toContain("something else broke");
  });
});
