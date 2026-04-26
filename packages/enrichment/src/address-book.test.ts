import { describe, expect, it } from "vitest";

import { loadAddressBook } from "./address-book.js";

describe("loadAddressBook", () => {
  it("flattens chain.symbol entries with lowercased addresses", () => {
    const book = loadAddressBook({
      ethereum: {
        STETH: "0xAE7ab96520DE3A18E5e111B5EaAb095312D7fE84",
        WETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      },
      arbitrum: {
        USDC: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      },
    });
    expect(book.size).toBe(3);
    expect(book.get("ethereum.STETH")?.address).toBe(
      "0xae7ab96520de3a18e5e111b5eaab095312d7fe84",
    );
    expect(book.get("ethereum.STETH")?.chain).toBe("ethereum");
    expect(book.get("ethereum.STETH")?.symbol).toBe("STETH");
    expect(book.get("arbitrum.USDC")?.chain).toBe("arbitrum");
  });

  it("captures top-level scalar entries like null and GAS_TOKEN_2", () => {
    const book = loadAddressBook({
      null: "0x0000000000000000000000000000000000000000",
      GAS_TOKEN_2: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      ethereum: { WETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" },
    });
    expect(book.get("null")?.address).toBe("0x0000000000000000000000000000000000000000");
    expect(book.get("null")?.chain).toBeNull();
    expect(book.get("GAS_TOKEN_2")?.symbol).toBe("GAS_TOKEN_2");
  });

  it("skips non-address values without throwing", () => {
    const book = loadAddressBook({
      ethereum: {
        WETH: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        notAnAddress: "lol",
        nested: { ignored: true },
      },
      junk: 42,
    });
    expect(book.size).toBe(1);
    expect(book.get("ethereum.WETH")).toBeDefined();
  });

  it("returns an empty map for null/undefined input", () => {
    expect(loadAddressBook(null).size).toBe(0);
    expect(loadAddressBook(undefined).size).toBe(0);
    expect(loadAddressBook("not an object").size).toBe(0);
  });
});
