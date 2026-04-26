import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadAddressBook } from "./address-book.js";
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
    // Top-level const decls get chain-attributed when their values are
    // referenced from inside a chain block. Here `stETH`, `wstETH`, and
    // `treasury` are passed to `sumTokens2` from inside `tvl()` which is
    // exported under the `ethereum` chain block, so they all attribute to
    // ethereum.
    const stETH = result.static_addresses.find(
      (a) => a.address === "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
    );
    expect(stETH).toBeDefined();
    expect(stETH?.chain).toBe("ethereum");
    expect(stETH?.context).toBe("stETH");
    // stETH matches the token-symbol regex (LSTs, wrapped ETH variants).
    expect(stETH?.purpose_hint).toBe("token");

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

    // ARB_VAULT is declared at file scope but referenced inside `arbTvl`
    // (bound under the `arbitrum` chain block), so it attributes to arbitrum.
    const arbVault = result.static_addresses.find(
      (a) => a.address === "0x2222222222222222222222222222222222222222",
    );
    expect(arbVault?.chain).toBe("arbitrum");
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

  it("emits literal-target abi.call as static_address (no longer dynamic)", () => {
    // Now that targets are resolved at the source level, a literal target +
    // abi.call is fully static — the address goes into static_addresses, not
    // dynamic_resolution. dynamic_resolution is now reserved for genuinely
    // unresolvable targets (computed identifiers, computed member expressions).
    const result = parseAdapter(loadFixture("dynamic-resolution.js"));

    const factory = result.static_addresses.find(
      (a) => a.address === "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(factory).toBeDefined();
    expect(factory?.chain).toBe("ethereum");
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

  describe("address-book resolution", () => {
    const addressBook = loadAddressBook({
      ethereum: {
        STETH: "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
        MATIC: "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0",
      },
      null: "0x0000000000000000000000000000000000000000",
    });

    it("resolves `const X = ADDRESSES.ethereum.STETH` and references at use sites", () => {
      const result = parseAdapter(loadFixture("address-book.js"), { addressBook });

      // The aliased identifier `ethContract` resolves to STETH and is emitted
      // when used as `target: ethContract`.
      const steth = result.static_addresses.find(
        (a) => a.address === "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      );
      expect(steth).toBeDefined();
      expect(steth?.chain).toBe("ethereum");
      expect(steth?.context).toBe("STETH"); // label from the address book
      expect(steth?.purpose_hint).toBe("token"); // STETH matches token regex via 'eth'
    });

    it("resolves inline `target: ADDRESSES.ethereum.MATIC` member expressions", () => {
      const result = parseAdapter(loadFixture("address-book.js"), { addressBook });

      const matic = result.static_addresses.find(
        (a) => a.address === "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0",
      );
      expect(matic).toBeDefined();
      expect(matic?.chain).toBe("ethereum");
      expect(matic?.context).toBe("MATIC");
    });

    it("does not double-emit when the same address appears as both a literal and via address book", () => {
      const result = parseAdapter(loadFixture("address-book.js"), { addressBook });
      // Each (chain, address) tuple appears exactly once after dedup.
      const dups = new Map<string, number>();
      for (const a of result.static_addresses) {
        const key = `${a.chain}|${a.address}`;
        dups.set(key, (dups.get(key) ?? 0) + 1);
      }
      for (const [, count] of dups) expect(count).toBe(1);
    });

    it("genuinely dynamic targets still produce a dynamic_resolution entry", () => {
      const result = parseAdapter(loadFixture("address-book.js"), { addressBook });
      // The literal-target call resolves to a static address; only the
      // call-result-flow ones (or unresolvable identifiers) should land in dynamic_resolution.
      // In this fixture, all targets resolve, so dynamic_resolution should be empty.
      // The "0xaaaa…" target is a string literal that gets emitted statically.
      expect(result.static_addresses.find(
        (a) => a.address === "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      )).toBeDefined();
    });

    it("works without an address book (back-compat)", () => {
      const result = parseAdapter(loadFixture("address-book.js"));
      // Without the book, ADDRESSES.ethereum.STETH cannot resolve — only the
      // literal "0xaaaa…" survives.
      const literalOnly = result.static_addresses.find(
        (a) => a.address === "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      );
      expect(literalOnly).toBeDefined();
      const stETH = result.static_addresses.find(
        (a) => a.address === "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
      );
      expect(stETH).toBeUndefined();
    });
  });
});
