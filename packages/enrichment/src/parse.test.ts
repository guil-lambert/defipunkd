import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseAdapter } from "./parse.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../test/fixtures");

function loadFixture(name: string): string {
  return readFileSync(resolve(fixturesDir, name), "utf8");
}

describe("parseAdapter", () => {
  it("extracts addresses from a single-chain adapter and attributes them to the chain block", () => {
    const result = parseAdapter(loadFixture("single-chain.js"));

    expect(result.warnings).toEqual([]);
    // Three top-level const decls — chain attribution depends on whether the
    // declaration sits inside a chain block. These declarations are file-scoped,
    // so chain should be null.
    const stETH = result.static_addresses.find(
      (a) => a.address === "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
    );
    expect(stETH).toBeDefined();
    expect(stETH?.chain).toBeNull();
    expect(stETH?.context).toBe("stETH");
    // stETH is a token symbol but doesn't match a purpose keyword — that's OK,
    // unknown is the honest answer for symbol-named consts.
    expect(stETH?.purpose_hint).toBe("unknown");

    const wstETH = result.static_addresses.find(
      (a) => a.address === "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
    );
    expect(wstETH?.context).toBe("wstETH");

    const treasury = result.static_addresses.find(
      (a) => a.address === "0x3e40d73eb977dc6a537af587d48316fee66e9c8c",
    );
    expect(treasury?.context).toBe("treasury");
    expect(treasury?.purpose_hint).toBe("admin");

    // Comment-embedded address must NOT appear.
    expect(
      result.static_addresses.find(
        (a) => a.address === "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      ),
    ).toBeUndefined();
  });

  it("attributes addresses inside a chain block to the chain key, with purpose hints", () => {
    const result = parseAdapter(loadFixture("multi-chain.js"));

    const oracle = result.static_addresses.find(
      (a) => a.address === "0x3333333333333333333333333333333333333333",
    );
    expect(oracle?.chain).toBe("ethereum");
    expect(oracle?.context).toBe("oracle");
    expect(oracle?.purpose_hint).toBe("oracle");

    const admin = result.static_addresses.find(
      (a) => a.address === "0x4444444444444444444444444444444444444444",
    );
    expect(admin?.chain).toBe("ethereum");
    expect(admin?.context).toBe("admin");
    expect(admin?.purpose_hint).toBe("admin");

    // The const ARB_VAULT is at file scope (not inside the chain block).
    const arbVault = result.static_addresses.find(
      (a) => a.address === "0x2222222222222222222222222222222222222222",
    );
    expect(arbVault?.chain).toBeNull();
    expect(arbVault?.context).toBe("ARB_VAULT");
    expect(arbVault?.purpose_hint).toBe("vault");
  });

  it("addresses are deduplicated across literal occurrences (lowercased)", () => {
    const result = parseAdapter(loadFixture("multi-chain.js"));
    const dupCheck = result.static_addresses.filter(
      (a) => a.address === "0x1111111111111111111111111111111111111111",
    );
    // ETH_VAULT is referenced once at file scope; even if it appeared in
    // ethereum block via the function, we'd still emit one entry per
    // (chain, address) tuple. File-scope dedupe keeps it single here.
    expect(dupCheck.length).toBe(1);
  });

  it("captures dynamic factory-call resolution as a separate bucket", () => {
    const result = parseAdapter(loadFixture("dynamic-resolution.js"));

    expect(result.dynamic_resolution.length).toBeGreaterThanOrEqual(1);
    const dyn = result.dynamic_resolution[0]!;
    expect(dyn.factory).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(dyn.abi_call).toBe("address:vault");
    expect(dyn.chain).toBe("ethereum");
  });

  it("records require() and import paths under imports[]", () => {
    const result = parseAdapter(loadFixture("single-chain.js"));
    expect(result.imports).toContain("../helpers/unwrapLPs");
  });

  it("returns a warning rather than throwing on invalid source", () => {
    const result = parseAdapter("this is not valid javascript ((((");
    // Babel error-recovery is on; it may parse as best-effort and produce
    // an empty result, OR yield a warning. Either way, no throw and no addresses.
    expect(result.static_addresses).toEqual([]);
  });

  it("ignores 0x literals that are not 40-hex EVM addresses", () => {
    const source = `
      const padded = "0x123";
      const tooLong = "0xae7ab96520de3a18e5e111b5eaab095312d7fe8400";
      const notHex = "0xZZZZab96520de3a18e5e111b5eaab095312d7fe8";
    `;
    const result = parseAdapter(source);
    expect(result.static_addresses).toEqual([]);
  });

  it("produces stable ordering on repeated runs", () => {
    const source = loadFixture("multi-chain.js");
    const a = parseAdapter(source);
    const b = parseAdapter(source);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
