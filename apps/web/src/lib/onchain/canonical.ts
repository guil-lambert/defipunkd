/**
 * Solidity ABI canonicalization helpers, shared by the ABI resolver (for
 * proxy/implementation merge dedup) and the read route (for signature
 * matching).
 *
 * Canonical signature for `balanceOf(address account) returns (uint256)` is
 * `balanceOf(address)` — exact match-able across Etherscan / Sourcify / user
 * input. Tuples expand to `(t1,t2,...)`.
 */

interface AbiInput {
  type: string;
  components?: ReadonlyArray<AbiInput>;
}

interface NamedAbiEntry {
  type: string;
  name?: string;
  inputs?: ReadonlyArray<AbiInput>;
}

export function canonicalType(input: AbiInput): string {
  if (input.type.startsWith("tuple") && input.components) {
    const inner = input.components.map(canonicalType).join(",");
    return input.type.replace("tuple", `(${inner})`);
  }
  return input.type;
}

export function canonicalSignature(entry: { name?: string; inputs?: ReadonlyArray<AbiInput> }): string {
  const inputs = (entry.inputs ?? []).map(canonicalType).join(",");
  return `${entry.name ?? ""}(${inputs})`;
}

/**
 * Stable dedup key including the abi entry kind (function/event/error). Two
 * entries with the same name+signature but different kinds (e.g. event vs
 * error) won't collide.
 */
export function canonicalAbiKey(entry: NamedAbiEntry): string {
  if (entry.type === "function" || entry.type === "event" || entry.type === "error") {
    return `${entry.type}:${canonicalSignature(entry)}`;
  }
  // constructor / fallback / receive — only one of each can exist per ABI;
  // key by type alone.
  return entry.type;
}
