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
import { parseAddress, parseBlock, parseChainId } from "../../../lib/onchain/validate.js";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const chainResult = parseChainId(url.searchParams.get("chainId"));
  if (!chainResult.ok) {
    return errorResponse(chainResult.error === "unsupported-chain-id" ? 415 : 400, chainResult);
  }
  const addrResult = parseAddress(url.searchParams.get("address"));
  if (!addrResult.ok) return errorResponse(400, addrResult);
  const blockResult = parseBlock(url.searchParams.get("block"));
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
    return errorResponse(502, {
      error: "rpc-block-failed",
      message: `failed to fetch block: ${(err as Error).message}`,
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

  // getOwners + getThreshold revert on non-Safes. VERSION is optional — older
  // forks may not expose it. So treat the first two as required.
  const required = results.filter((r) => r.name !== "VERSION");
  if (required.some((r) => !r.ok)) {
    return errorResponse(404, {
      error: "not-a-safe",
      message: `${address} on ${chain.name} did not respond to getOwners/getThreshold; it is probably not a Safe.`,
      hint: "Use /api/contract/read for arbitrary view methods.",
    });
  }

  const ownersRes = results.find((r) => r.name === "getOwners")!;
  const thresholdRes = results.find((r) => r.name === "getThreshold")!;
  const versionRes = results.find((r) => r.name === "VERSION")!;

  const ownersRaw = decodeFunctionResult({
    abi: SAFE_ABI,
    functionName: "getOwners",
    data: ownersRes.ok ? ownersRes.raw : "0x",
  }) as readonly `0x${string}`[];
  const owners = ownersRaw.map((a) => getAddress(a));
  const threshold = decodeFunctionResult({
    abi: SAFE_ABI,
    functionName: "getThreshold",
    data: thresholdRes.ok ? thresholdRes.raw : "0x",
  }) as bigint;
  const version = versionRes.ok
    ? (decodeFunctionResult({ abi: SAFE_ABI, functionName: "VERSION", data: versionRes.raw }) as string)
    : null;

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
    }),
  };

  return jsonResponse(payload, cacheControlForBlock(url.searchParams.get("block") ?? undefined));
};
