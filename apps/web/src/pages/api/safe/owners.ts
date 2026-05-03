/**
 * GET /api/safe/owners?chainId=1&address=0x...&block=latest
 *
 * Convenience read for Safe (Gnosis Safe) multisigs. Hardcoded ABI for
 * getOwners/getThreshold/VERSION, batched as a single multicall3 round-trip.
 * Returns 404 with error="not-a-safe" when the contract reverts on these
 * calls (which is what would happen for a non-Safe address).
 */
import type { APIRoute } from "astro";
import { encodeFunctionData, decodeFunctionResult, getAddress, type Hex } from "viem";
import { toChecksumAddress } from "@defipunkd/enrichment";
import { getPublicClient, OnchainConfigError } from "../../../lib/onchain/client.js";
import { errorResponse, jsonResponse, cacheControlForBlock } from "../../../lib/onchain/error.js";
import { SAFE_ABI } from "../../../lib/onchain/safe-abi.js";
import { summarizeSafeOwners } from "../../../lib/onchain/summary.js";
import { buildSurfacerUrls } from "../../../lib/onchain/surfacer.js";
import { getTolerantSearchParams, parseAddress, parseBlock, parseChainId } from "../../../lib/onchain/validate.js";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const params = getTolerantSearchParams(url);
  const chainResult = parseChainId(params.get("chainId"));
  if (!chainResult.ok) {
    return errorResponse(chainResult.error === "unsupported-chain-id" ? 415 : 400, chainResult);
  }
  const addrResult = parseAddress(params.get("address"));
  if (!addrResult.ok) return errorResponse(400, addrResult);
  const blockResult = parseBlock(params.get("block"));
  if (!blockResult.ok) return errorResponse(400, blockResult);

  let resolved;
  try {
    resolved = getPublicClient(chainResult.value);
  } catch (err) {
    if (err instanceof OnchainConfigError) {
      return errorResponse(500, { error: "rpc-not-configured", message: err.message });
    }
    throw err;
  }
  const { client, chain, rpcLabel } = resolved;
  const address = addrResult.value;
  const blockTag = blockResult.value;

  // Resolve "latest" → numeric block first so the response self-describes.
  let blockNumber: bigint;
  let blockHash: Hex;
  try {
    const block =
      blockTag === "latest"
        ? await client.getBlock({ blockTag: "latest" })
        : await client.getBlock({ blockNumber: blockTag });
    blockNumber = block.number!;
    blockHash = block.hash!;
  } catch (err) {
    console.error("[/api/safe/owners] rpc-block-failed", { rpcLabel, err });
    return errorResponse(502, {
      error: "rpc-block-failed",
      message: `failed to fetch block: ${(err as Error).message}`,
      hint: `RPC providers tried: ${rpcLabel}`,
    });
  }

  const calls: Array<{ name: "getOwners" | "getThreshold" | "VERSION"; calldata: Hex }> = [
    { name: "getOwners", calldata: encodeFunctionData({ abi: SAFE_ABI, functionName: "getOwners" }) },
    { name: "getThreshold", calldata: encodeFunctionData({ abi: SAFE_ABI, functionName: "getThreshold" }) },
    { name: "VERSION", calldata: encodeFunctionData({ abi: SAFE_ABI, functionName: "VERSION" }) },
  ];

  const results = await Promise.all(
    calls.map(async (c) => {
      try {
        const ret = await client.call({ to: address, data: c.calldata, blockNumber });
        return { ok: true as const, name: c.name, calldata: c.calldata, raw: (ret.data ?? "0x") as Hex };
      } catch (err) {
        return { ok: false as const, name: c.name, calldata: c.calldata, error: (err as Error).message };
      }
    }),
  );

  // getOwners + getThreshold revert (or return 0x for an EOA / non-Safe with
  // no matching function and no fallback) on non-Safes. VERSION is optional —
  // older Safe forks may not expose it. So treat the first two as required
  // AND require non-empty return data; '0x' alone fails decode and would
  // crash the route otherwise.
  const required = results.filter((r) => r.name !== "VERSION");
  const requiredFailed = required.some((r) => !r.ok || r.raw === "0x");
  if (requiredFailed) {
    return errorResponse(404, {
      error: "not-a-safe",
      message: `${address} on ${chain.name} did not return decodeable getOwners/getThreshold data; it is probably an EOA or a non-Safe contract.`,
      hint: "Use /api/contract/read for arbitrary view methods.",
    });
  }

  const ownersRes = results.find((r) => r.name === "getOwners")! as Extract<typeof results[number], { ok: true }>;
  const thresholdRes = results.find((r) => r.name === "getThreshold")! as Extract<typeof results[number], { ok: true }>;
  const versionRes = results.find((r) => r.name === "VERSION")!;

  let ownersRaw: readonly `0x${string}`[];
  let threshold: bigint;
  try {
    ownersRaw = decodeFunctionResult({
      abi: SAFE_ABI,
      functionName: "getOwners",
      data: ownersRes.raw,
    }) as readonly `0x${string}`[];
    threshold = decodeFunctionResult({
      abi: SAFE_ABI,
      functionName: "getThreshold",
      data: thresholdRes.raw,
    }) as bigint;
  } catch (err) {
    // Defense in depth — if decode fails despite non-empty data, the contract
    // is responding to the call selector but in a non-Safe shape.
    console.error("[/api/safe/owners] decode-failed", { address, err });
    return errorResponse(404, {
      error: "not-a-safe",
      message: `${address} on ${chain.name} returned data that does not decode as Safe getOwners/getThreshold output.`,
      hint: `decode error: ${(err as Error).message}`,
    });
  }
  const owners = ownersRaw.map((a) => getAddress(a));
  // VERSION is optional; non-empty 0x AND ok required, decode wrapped so a
  // weird VERSION return doesn't take down a successful owners/threshold read.
  let version: string | null = null;
  if (versionRes.ok && versionRes.raw !== "0x") {
    try {
      version = decodeFunctionResult({
        abi: SAFE_ABI,
        functionName: "VERSION",
        data: versionRes.raw,
      }) as string;
    } catch {
      version = null;
    }
  }

  const checksummed = toChecksumAddress(address);
  const payload = {
    chainId: chainResult.value,
    chain: chain.name,
    contract: checksummed,
    kind: "safe",
    blockNumber: Number(blockNumber),
    blockHash,
    threshold: Number(threshold),
    owners,
    version,
    // Surfacer URLs for each owner — see surfacer.ts for the rationale
    // (allowlists only accept URLs that appeared verbatim in context).
    // Also injected into `summary` prose below as belt-and-suspenders for
    // any content extractor that summarizes JSON by dropping unfamiliar keys.
    crawl: {
      surfacers: buildSurfacerUrls(chainResult.value, owners),
    },
    provenance: {
      rpc: rpcLabel,
      abiSource: "hardcoded Safe ABI",
      calls: results.map((r) => ({
        method: `${r.name}()`,
        calldata: r.calldata,
        rawReturnData: r.ok ? r.raw : null,
        error: r.ok ? null : r.error,
      })),
    },
    summary: summarizeSafeOwners({
      address: checksummed,
      chain: chain.name,
      threshold,
      owners,
      version,
      blockNumber,
      surfacers: buildSurfacerUrls(chainResult.value, owners),
    }),
  };

  return jsonResponse(payload, cacheControlForBlock(params.get("block") ?? undefined));
};
