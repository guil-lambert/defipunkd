/**
 * EIP-55 mixed-case checksum address.
 *
 * Required by the Safe Transaction Service: the API returns 422 with
 * "Checksum address validation failed" if you submit a lowercase address.
 * Etherscan, Sourcify, and our own internal code don't care about case, but
 * the network boundary does.
 *
 * Spec: https://eips.ethereum.org/EIPS/eip-55
 */

import { keccak_256 } from "@noble/hashes/sha3.js";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function toChecksumAddress(address: string): string {
  if (!ADDRESS_RE.test(address)) {
    throw new Error(`toChecksumAddress: malformed address "${address}"`);
  }
  const lower = address.toLowerCase().slice(2);
  // EIP-55 hashes the lowercase hex string AS ASCII bytes (not the bytes the
  // string represents).
  const hashBytes = keccak_256(new TextEncoder().encode(lower));
  // Each character of the hash byte-string (rendered hex) controls case of
  // the corresponding address character: nibble >= 8 → uppercase.
  let out = "0x";
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i]!;
    if (ch >= "0" && ch <= "9") {
      out += ch;
    } else {
      const byte = hashBytes[i >> 1]!;
      const nibble = i % 2 === 0 ? byte >> 4 : byte & 0x0f;
      out += nibble >= 8 ? ch.toUpperCase() : ch;
    }
  }
  return out;
}
