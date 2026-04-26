/**
 * The DefiLlama-Adapters repo ships `projects/helper/coreAssets.json` — a
 * canonical token-address dictionary keyed by chain → SYMBOL. Most adapters
 * dereference it as `ADDRESSES.<chain>.<SYMBOL>`, so we flatten it into a
 * lookup map keyed by `chain.SYMBOL` (and `null`/`GAS_TOKEN_2` at the top
 * level) and resolve those member-expression references during parsing.
 */

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export interface AddressBookEntry {
  address: string;
  chain: string | null;
  symbol: string;
}

export type AddressBook = Map<string, AddressBookEntry>;

export function loadAddressBook(coreAssets: unknown): AddressBook {
  const book: AddressBook = new Map();
  if (!coreAssets || typeof coreAssets !== "object") return book;
  for (const [topKey, topValue] of Object.entries(coreAssets as Record<string, unknown>)) {
    if (typeof topValue === "string") {
      // Top-level scalar entries: { "null": "0x000...", "GAS_TOKEN_2": "0xeee..." }
      if (ADDRESS_RE.test(topValue)) {
        book.set(topKey, {
          address: topValue.toLowerCase(),
          chain: null,
          symbol: topKey,
        });
      }
      continue;
    }
    if (!topValue || typeof topValue !== "object") continue;
    const chain = topKey;
    for (const [symbol, addr] of Object.entries(topValue as Record<string, unknown>)) {
      if (typeof addr !== "string") continue;
      if (!ADDRESS_RE.test(addr)) continue;
      book.set(`${chain}.${symbol}`, {
        address: addr.toLowerCase(),
        chain,
        symbol,
      });
    }
  }
  return book;
}
