import { describe, expect, it, vi } from "vitest";

import { fetchSourcify } from "./fetch-sourcify.js";
import type { FetchFn } from "./fetch-etherscan.js";

function fakeFetch(payload: unknown, ok = true, status = 200): FetchFn {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => payload,
  }));
}

describe("fetchSourcify", () => {
  it("parses a perfect-match record", async () => {
    const f = fakeFetch([
      {
        address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
        status: "perfect",
        chainIds: ["1"],
      },
    ]);
    const r = await fetchSourcify({
      chain: "ethereum",
      address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      fetch: f,
    });
    expect(r.status).toBe("perfect");
    expect(r.warnings).toEqual([]);
  });

  it("parses partial matches", async () => {
    const f = fakeFetch([{ status: "partial" }]);
    const r = await fetchSourcify({
      chain: "ethereum",
      address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      fetch: f,
    });
    expect(r.status).toBe("partial");
  });

  it("parses unverified ('false') records", async () => {
    const f = fakeFetch([{ status: "false" }]);
    const r = await fetchSourcify({
      chain: "ethereum",
      address: "0xfff0000000000000000000000000000000000000",
      fetch: f,
    });
    expect(r.status).toBe("false");
  });

  it("warns on unsupported chain", async () => {
    const f = vi.fn();
    const r = await fetchSourcify({
      chain: "solana",
      address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      fetch: f as unknown as FetchFn,
    });
    expect(r.status).toBeNull();
    expect(r.warnings[0]).toContain("unsupported");
    expect(f).not.toHaveBeenCalled();
  });

  it("warns on unknown status string", async () => {
    const f = fakeFetch([{ status: "weird" }]);
    const r = await fetchSourcify({
      chain: "ethereum",
      address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      fetch: f,
    });
    expect(r.status).toBeNull();
    expect(r.warnings[0]).toContain("unknown status");
  });
});
