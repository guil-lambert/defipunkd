export type PurposeHint =
  | "token"
  | "pool"
  | "vault"
  | "factory"
  | "admin"
  | "oracle"
  | "router"
  | "staking"
  | "unknown";

export type ChainName = string;

export interface StaticAddress {
  /** Top-level chain key in module.exports the address sits under, or null if outside any chain block. */
  chain: ChainName | null;
  /** Lowercased EVM address. */
  address: string;
  /** Variable name or property key surrounding the literal, if any. */
  context: string | null;
  /** 1-indexed line number in the adapter source. */
  source_line: number;
  /** Heuristic role classification from the surrounding identifier. */
  purpose_hint: PurposeHint;
}

export interface DynamicResolution {
  chain: ChainName | null;
  /** Address being called as a factory, when statically resolvable. */
  factory: string | null;
  /** ABI signature passed (e.g. "address:vault"). */
  abi_call: string | null;
  source_line: number;
  note: string;
}

export interface ParsedAdapter {
  static_addresses: StaticAddress[];
  dynamic_resolution: DynamicResolution[];
  /** Paths from require()/import — for a future recursive helper-resolution pass. */
  imports: string[];
  warnings: string[];
}
