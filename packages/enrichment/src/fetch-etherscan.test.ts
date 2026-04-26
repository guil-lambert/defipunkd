import { describe, expect, it, vi } from "vitest";

import { fetchEtherscanSourceCode, type FetchFn } from "./fetch-etherscan.js";

function fakeFetch(payload: unknown, ok = true, status = 200): FetchFn {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => payload,
  }));
}

describe("fetchEtherscanSourceCode", () => {
  it("parses a verified non-proxy contract", async () => {
    const f = fakeFetch({
      status: "1",
      message: "OK",
      result: [
        {
          SourceCode: "pragma solidity ^0.8.0; contract Foo {}",
          ContractName: "Foo",
          CompilerVersion: "v0.8.20+commit.a1b79de6",
          OptimizationUsed: "1",
          Proxy: "0",
          Implementation: "",
        },
      ],
    });
    const result = await fetchEtherscanSourceCode({
      chain: "ethereum",
      address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      apiKey: "TESTKEY",
      fetch: f,
    });
    expect(result.contract).toEqual({
      verified: true,
      contract_name: "Foo",
      compiler: "v0.8.20+commit.a1b79de6",
      optimization: true,
      is_proxy: false,
      implementation: null,
    });
    expect(result.warnings).toEqual([]);
  });

  it("parses a proxy contract with implementation", async () => {
    const f = fakeFetch({
      status: "1",
      result: [
        {
          SourceCode: "{}",
          ContractName: "TransparentUpgradeableProxy",
          CompilerVersion: "v0.8.10",
          OptimizationUsed: "1",
          Proxy: "1",
          Implementation: "0x1234567890123456789012345678901234567890",
        },
      ],
    });
    const r = await fetchEtherscanSourceCode({
      chain: "ethereum",
      address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      apiKey: "TESTKEY",
      fetch: f,
    });
    expect(r.contract?.is_proxy).toBe(true);
    expect(r.contract?.implementation).toBe("0x1234567890123456789012345678901234567890");
  });

  it("returns a 'not verified' record for unverified contracts (no warning)", async () => {
    const f = fakeFetch({
      status: "0",
      message: "NOTOK",
      result: "Contract source code not verified",
    });
    const r = await fetchEtherscanSourceCode({
      chain: "ethereum",
      address: "0xfff0000000000000000000000000000000000000",
      apiKey: "TESTKEY",
      fetch: f,
    });
    expect(r.contract?.verified).toBe(false);
    expect(r.warnings).toEqual([]);
  });

  it("returns a warning on unsupported chain (no fetch attempted)", async () => {
    const f = vi.fn();
    const r = await fetchEtherscanSourceCode({
      chain: "solana",
      address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      apiKey: "TESTKEY",
      fetch: f as unknown as FetchFn,
    });
    expect(r.contract).toBeNull();
    expect(r.warnings).toEqual(["unsupported chain: solana"]);
    expect(f).not.toHaveBeenCalled();
  });

  it("records http errors as warnings rather than throwing", async () => {
    const f = fakeFetch({}, false, 503);
    const r = await fetchEtherscanSourceCode({
      chain: "ethereum",
      address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      apiKey: "TESTKEY",
      fetch: f,
    });
    expect(r.contract).toBeNull();
    expect(r.warnings).toEqual(["etherscan http 503"]);
  });

  it("records rate-limit / NOTOK responses as warnings", async () => {
    const f = fakeFetch({
      status: "0",
      message: "NOTOK",
      result: "Max calls per sec rate limit reached (5/sec)",
    });
    const r = await fetchEtherscanSourceCode({
      chain: "ethereum",
      address: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      apiKey: "TESTKEY",
      fetch: f,
    });
    expect(r.contract).toBeNull();
    expect(r.warnings[0]).toContain("rate limit");
  });
});
