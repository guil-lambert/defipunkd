/**
 * Tiny query-param validators shared by the three API routes.
 *
 * No zod dependency — keeping the API surface dependency-light. Each helper
 * returns a tagged result so callers can map to a 400 with a stable error code.
 */
import { isAddress } from "viem";
import { isSupportedChainId } from "./chains.js";

export type Valid<T> = { ok: true; value: T };
export type Invalid = { ok: false; error: string; message: string; hint?: string };
export type Validated<T> = Valid<T> | Invalid;

export function parseChainId(raw: string | null): Validated<number> {
  if (!raw) return { ok: false, error: "missing-chain-id", message: "chainId query param is required" };
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, error: "invalid-chain-id", message: `chainId must be a positive integer, got "${raw}"` };
  }
  if (!isSupportedChainId(n)) {
    return {
      ok: false,
      error: "unsupported-chain-id",
      message: `chainId ${n} is not supported by this API`,
      hint: "See /api/contract/abi response or README for the supported list.",
    };
  }
  return { ok: true, value: n };
}

export function parseAddress(raw: string | null): Validated<`0x${string}`> {
  if (!raw) return { ok: false, error: "missing-address", message: "address query param is required" };
  if (!isAddress(raw)) {
    return { ok: false, error: "invalid-address", message: `address "${raw}" is not a valid 0x-hex address` };
  }
  return { ok: true, value: raw as `0x${string}` };
}

export type BlockTag = "latest" | bigint;

export function parseBlock(raw: string | null): Validated<BlockTag> {
  if (!raw || raw === "latest") return { ok: true, value: "latest" };
  if (!/^\d+$/.test(raw)) {
    return {
      ok: false,
      error: "invalid-block",
      message: `block must be "latest" or a non-negative integer, got "${raw}"`,
    };
  }
  return { ok: true, value: BigInt(raw) };
}

/**
 * Parse comma-separated args from a URL query param into raw strings.
 * Empty string → []. Per the plan, only flat scalar/address/bool/bytes/uint
 * values are supported; arrays/structs return 400 at encoding time.
 */
export function parseArgsList(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
