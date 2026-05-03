/**
 * Build /address/{chainId}/{eip55Addr} surfacer URLs for address values in
 * an eth_call result, so an LLM that hits /api/contract/read or
 * /api/safe/owners directly (without going through the surfacer page first)
 * still has the crawl URLs verbatim in the response body — the
 * browser/web_fetch allowlist accepts URLs only when they appear in fetched
 * conversation context, so embedding them here turns API-first crawling
 * from a dead end into a working ratchet step.
 */
import { getAddress, type AbiFunction, type AbiParameter } from "viem";

const BASE = "https://defipunkd.com";

export function surfacerUrl(chainId: number, addr: string): string {
  return `${BASE}/address/${chainId}/${getAddress(addr as `0x${string}`)}`;
}

/**
 * Recursively collect every EIP-55 checksummed address value found in
 * `decoded` according to the given `abi-typed` outputs. Order-preserving,
 * deduplicated.
 */
export function collectAddressesFromResult(
  fn: AbiFunction,
  decoded: unknown,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== "string") return;
    try {
      const checksummed = getAddress(v as `0x${string}`);
      if (!seen.has(checksummed)) {
        seen.add(checksummed);
        out.push(checksummed);
      }
    } catch {
      // not a valid address; skip
    }
  };

  const outputs = fn.outputs ?? [];
  if (outputs.length === 0) return out;

  if (outputs.length === 1) {
    walk(outputs[0]!, decoded, push);
  } else if (Array.isArray(decoded)) {
    decoded.forEach((v, i) => {
      if (outputs[i]) walk(outputs[i]!, v, push);
    });
  }
  return out;
}

function walk(p: AbiParameter, value: unknown, push: (v: unknown) => void): void {
  const type = p.type;
  if (type === "address") {
    push(value);
    return;
  }
  if (type === "address[]" && Array.isArray(value)) {
    for (const v of value) push(v);
    return;
  }
  if (type.endsWith("[]") && Array.isArray(value)) {
    const inner = type.slice(0, -2);
    const innerParam: AbiParameter = {
      ...(p as { components?: readonly AbiParameter[] }),
      type: inner,
    } as AbiParameter;
    for (const v of value) walk(innerParam, v, push);
    return;
  }
  if (type.startsWith("tuple") && Array.isArray(value)) {
    const components = (p as { components?: readonly AbiParameter[] }).components ?? [];
    value.forEach((v, i) => {
      if (components[i]) walk(components[i]!, v, push);
    });
  }
}

export function buildSurfacerUrls(chainId: number, addresses: readonly string[]): string[] {
  return addresses.map((a) => surfacerUrl(chainId, a));
}
