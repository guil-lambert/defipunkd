/**
 * GET /api/contract/abi?chainId=1&address=0x...
 *
 * Resolves a contract's ABI via Etherscan v2; falls back to Sourcify when
 * Etherscan reports the contract as unverified. Useful as a primitive for
 * agents that want to introspect what view methods a contract exposes
 * before calling /api/contract/read.
 */
import type { APIRoute } from "astro";
import type { Abi, AbiFunction, AbiEvent } from "viem";
import { toChecksumAddress } from "@defipunkd/enrichment";
import { getChainEntry } from "../../../lib/onchain/chains.js";
import { resolveAbi, AbiNotFoundError } from "../../../lib/onchain/abi.js";
import { errorResponse, jsonResponse } from "../../../lib/onchain/error.js";
import { summarizeContractAbi } from "../../../lib/onchain/summary.js";
import { getTolerantSearchParams, parseAddress, parseChainId } from "../../../lib/onchain/validate.js";

export const prerender = false;

const ABI_CACHE_CONTROL = "public, s-maxage=86400, stale-while-revalidate=604800";

export const GET: APIRoute = async ({ url }) => {
  const params = getTolerantSearchParams(url);
  const chainResult = parseChainId(params.get("chainId"));
  if (!chainResult.ok) {
    return errorResponse(chainResult.error === "unsupported-chain-id" ? 415 : 400, chainResult);
  }
  const addrResult = parseAddress(params.get("address"));
  if (!addrResult.ok) return errorResponse(400, addrResult);

  const chain = getChainEntry(chainResult.value)!;
  const address = addrResult.value;

  let abi;
  try {
    abi = await resolveAbi(chainResult.value, address);
  } catch (err) {
    if (err instanceof AbiNotFoundError) {
      return errorResponse(404, {
        error: "abi-not-found",
        message: err.message,
        hint: "Contract may be unverified, deployed via Create2 without source upload, or not yet indexed.",
      });
    }
    throw err;
  }

  const checksummed = toChecksumAddress(address);
  const fnCount = countAbiKind(abi.abi, "function");
  const eventCount = countAbiKind(abi.abi, "event");

  const payload = {
    chainId: chainResult.value,
    chain: chain.name,
    contract: checksummed,
    contractName: abi.contractName,
    abiSource: abi.source,
    verified: abi.verified,
    proxy: abi.proxy,
    abi: abi.abi,
    counts: { functions: fnCount, events: eventCount },
    warnings: abi.warnings,
    summary: summarizeContractAbi({
      address: checksummed,
      chain: chain.name,
      source: abi.source,
      contractName: abi.contractName,
      fnCount,
      eventCount,
      proxy: abi.proxy,
    }),
  };

  return jsonResponse(payload, ABI_CACHE_CONTROL);
};

function countAbiKind(abi: Abi, kind: AbiFunction["type"] | AbiEvent["type"]): number {
  return abi.filter((entry) => entry.type === kind).length;
}
