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

/**
 * Build a URLSearchParams that tolerates `&amp;` separators in addition to `&`.
 *
 * Why: when an LLM (e.g. Claude.ai) emits a URL into its chat / thinking
 * buffer, the chat UI HTML-encodes ampersands for display ("&" → "&amp;").
 * If the LLM's own web_fetch tool then reads that rendered string back to
 * make a real HTTP call, the request goes out with literal `&amp;` between
 * params. A strict server splits on `&` and ends up with garbage param names
 * like `amp;address`, returning 400. The helper restores the `&` delimiter
 * before URLSearchParams parses, so a broken client still gets a useful
 * response. Legitimate query strings should never contain literal `&amp;`,
 * so this is safe.
 */
export function getTolerantSearchParams(url: URL): URLSearchParams {
  const fixed = url.search.replace(/&amp;/g, "&");
  return new URLSearchParams(fixed);
}

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
  // Non-strict: accept any case (lowercase, mixed-case-with-wrong-checksum,
  // ALL-CAPS, …). Real-world callers — LLMs reading from explorers and docs
  // — frequently lose the EIP-55 checksum on round-trips, and strict mode
  // doesn't protect against anything meaningful (wrong-case still resolves
  // to the same address). The route's own response normalizes via
  // toChecksumAddress so output is canonical.
  if (!isAddress(raw, { strict: false })) {
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
