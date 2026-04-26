import { describe, expect, it, vi } from "vitest";

import { fetchSafe } from "./fetch-safe.js";
import type { FetchFn } from "./fetch-etherscan.js";

function fakeFetch(payload: unknown, ok = true, status = 200): FetchFn {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => payload,
  }));
}

describe("fetchSafe", () => {
  it("parses a real Safe response", async () => {
    const f = fakeFetch({
      address: "0x1234567890123456789012345678901234567890",
      threshold: 4,
      owners: [
        "0xAaA0000000000000000000000000000000000000",
        "0xBBb0000000000000000000000000000000000000",
        "0xccc0000000000000000000000000000000000000",
      ],
      version: "1.4.1",
      modules: [{ moduleAddress: "0xdef0000000000000000000000000000000000000" }],
    });
    const r = await fetchSafe({
      chain: "ethereum",
      address: "0x1234567890123456789012345678901234567890",
      fetch: f,
    });
    expect(r.is_safe).toBe(true);
    expect(r.safe?.threshold).toBe(4);
    expect(r.safe?.owners_count).toBe(3);
    expect(r.safe?.owners[0]).toBe("0xaaa0000000000000000000000000000000000000");
    expect(r.safe?.version).toBe("1.4.1");
    expect(r.safe?.modules_count).toBe(1);
    expect(r.warnings).toEqual([]);
  });

  it("returns is_safe=false on 404 (not a Safe) — no warning, reason='not_a_safe'", async () => {
    const f = fakeFetch({}, false, 404);
    const r = await fetchSafe({
      chain: "ethereum",
      address: "0x1234567890123456789012345678901234567890",
      fetch: f,
    });
    expect(r.is_safe).toBe(false);
    expect(r.safe).toBeNull();
    expect(r.not_safe_reason).toBe("not_a_safe");
    expect(r.warnings).toEqual([]);
  });

  it("422 should never happen now that we send checksummed; surfaces as a warning if it does", async () => {
    const f = fakeFetch({}, false, 422);
    const r = await fetchSafe({
      chain: "ethereum",
      address: "0x1234567890123456789012345678901234567890",
      fetch: f,
    });
    expect(r.is_safe).toBe(false);
    expect(r.warnings[0]).toContain("422");
  });

  it("sends an EIP-55-checksummed address in the URL", async () => {
    const f = vi.fn(async (url: string) => {
      // Address: 0xae7ab96520de3a18e5e111b5eaab095312d7fe84 (stETH)
      // EIP-55:  0xae7ab96520DE3a18E5e111B5EaAb095312D7fE84
      expect(url).toContain("0xae7ab96520DE3a18E5e111B5EaAb095312D7fE84");
      return { ok: false, status: 404, json: async () => ({}) };
    });
    await fetchSafe({
      chain: "ethereum",
      address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      fetch: f as unknown as FetchFn,
    });
    expect(f).toHaveBeenCalled();
  });

  it("on a real Safe response, not_safe_reason is null", async () => {
    const f = fakeFetch({
      threshold: 4,
      owners: ["0x1111111111111111111111111111111111111111"],
      version: "1.4.1",
      modules: [],
    });
    const r = await fetchSafe({
      chain: "ethereum",
      address: "0x1234567890123456789012345678901234567890",
      fetch: f,
    });
    expect(r.is_safe).toBe(true);
    expect(r.not_safe_reason).toBeNull();
  });

  it("unsupported chain → not_safe_reason='skipped'", async () => {
    const r = await fetchSafe({
      chain: "fantom",
      address: "0x1234567890123456789012345678901234567890",
      fetch: vi.fn() as unknown as FetchFn,
    });
    expect(r.not_safe_reason).toBe("skipped");
  });

  it("warns on unsupported chain (no fetch attempted)", async () => {
    const f = vi.fn();
    const r = await fetchSafe({
      chain: "fantom",
      address: "0x1234567890123456789012345678901234567890",
      fetch: f as unknown as FetchFn,
    });
    expect(r.is_safe).toBe(false);
    expect(r.warnings[0]).toContain("unsupported chain");
    expect(f).not.toHaveBeenCalled();
  });

  it("rejects malformed addresses", async () => {
    const f = vi.fn();
    const r = await fetchSafe({
      chain: "ethereum",
      address: "0xnope",
      fetch: f as unknown as FetchFn,
    });
    expect(r.warnings[0]).toContain("malformed address");
    expect(f).not.toHaveBeenCalled();
  });

  it("records non-404 http errors as warnings", async () => {
    const f = fakeFetch({}, false, 503);
    const r = await fetchSafe({
      chain: "ethereum",
      address: "0x1234567890123456789012345678901234567890",
      fetch: f,
    });
    expect(r.is_safe).toBe(false);
    expect(r.warnings[0]).toContain("http 503");
  });

  it("uses the gnosis-chain slug for gnosis", async () => {
    const f = vi.fn(async (url: string) => {
      expect(url).toContain("safe-transaction-gnosis-chain.safe.global");
      return { ok: false, status: 404, json: async () => ({}) };
    });
    await fetchSafe({
      chain: "gnosis",
      address: "0x1234567890123456789012345678901234567890",
      fetch: f as unknown as FetchFn,
    });
    expect(f).toHaveBeenCalled();
  });
});
