/**
 * GET /api/contract/read?chainId=1&address=0x...&method=getOwners()&args=&block=latest
 *
 * Auto-fetches the contract's ABI (Etherscan → Sourcify), matches the named
 * method by its canonical signature, encodes calldata, performs eth_call at
 * the requested block, decodes the result. Always includes raw calldata and
 * raw return data so an LLM can re-decode if needed.
 *
 * Only `view` and `pure` methods are accepted — anything that would mutate
 * state is rejected with 400 because the semantics of "reading" via GET on
 * a state-mutating call are ambiguous (eth_call doesn't mutate, but the
 * decoded "result" wouldn't reflect production behavior).
 *
 * MVP arg-encoding limits: only flat scalar/address/bool/bytes/uint args.
 * Arrays and structs return 400 with a hint.
 */
import type { APIRoute } from "astro";
import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  type AbiFunction,
  type Hex,
} from "viem";
import { toChecksumAddress } from "@defipunkd/enrichment";
import { resolveAbi, AbiNotFoundError } from "../../../lib/onchain/abi.js";
import { getPublicClient, OnchainConfigError } from "../../../lib/onchain/client.js";
import { errorResponse, jsonResponse, cacheControlForBlock } from "../../../lib/onchain/error.js";
import { summarizeContractRead } from "../../../lib/onchain/summary.js";
import {
  parseAddress,
  parseArgsList,
  parseBlock,
  parseChainId,
} from "../../../lib/onchain/validate.js";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const chainResult = parseChainId(url.searchParams.get("chainId"));
  if (!chainResult.ok) {
    return errorResponse(chainResult.error === "unsupported-chain-id" ? 415 : 400, chainResult);
  }
  const addrResult = parseAddress(url.searchParams.get("address"));
  if (!addrResult.ok) return errorResponse(400, addrResult);

  const methodRaw = url.searchParams.get("method");
  if (!methodRaw) {
    return errorResponse(400, {
      error: "missing-method",
      message: 'method query param is required, e.g. method=getOwners() or method=balanceOf(address)',
    });
  }
  const blockResult = parseBlock(url.searchParams.get("block"));
  if (!blockResult.ok) return errorResponse(400, blockResult);
  const argsList = parseArgsList(url.searchParams.get("args"));

  // Resolve ABI.
  let resolvedAbi;
  try {
    resolvedAbi = await resolveAbi(chainResult.value, addrResult.value);
  } catch (err) {
    if (err instanceof AbiNotFoundError) {
      return errorResponse(404, {
        error: "abi-not-found",
        message: err.message,
        hint: "Use /api/contract/abi to inspect; this method only works for verified contracts.",
      });
    }
    throw err;
  }

  // Find a matching function by canonical signature.
  const fnMatch = matchFunction(resolvedAbi.abi, methodRaw);
  if (!fnMatch.ok) return errorResponse(400, fnMatch);
  const fn = fnMatch.value;

  if (fn.stateMutability !== "view" && fn.stateMutability !== "pure") {
    return errorResponse(400, {
      error: "method-not-view",
      message: `method ${methodRaw} is "${fn.stateMutability ?? "nonpayable"}", not view/pure`,
      hint: "This API only exposes read-only methods. eth_call doesn't mutate state, but exposing non-view methods would mislead callers about production semantics.",
    });
  }
  if ((fn.inputs?.length ?? 0) !== argsList.length) {
    return errorResponse(400, {
      error: "arg-count-mismatch",
      message: `${fn.name} expects ${fn.inputs?.length ?? 0} args, received ${argsList.length}`,
      hint: "Pass args as a comma-separated list, e.g. args=0xabc...,123",
    });
  }
  const encoded = encodeArgs(fn, argsList);
  if (!encoded.ok) return errorResponse(400, encoded);

  // Resolve client + block.
  let resolvedClient;
  try {
    resolvedClient = getPublicClient(chainResult.value);
  } catch (err) {
    if (err instanceof OnchainConfigError) {
      return errorResponse(500, { error: "rpc-not-configured", message: err.message });
    }
    throw err;
  }
  const { client, chain, rpcLabel } = resolvedClient;
  const blockTag = blockResult.value;

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

  let calldata: Hex;
  try {
    calldata = encodeFunctionData({
      abi: [fn],
      functionName: fn.name,
      args: encoded.value,
    });
  } catch (err) {
    return errorResponse(400, {
      error: "calldata-encode-failed",
      message: `failed to encode args for ${methodRaw}: ${(err as Error).message}`,
    });
  }

  let rawReturnData: Hex;
  try {
    const ret = await client.call({ to: addrResult.value, data: calldata, blockNumber });
    rawReturnData = (ret.data ?? "0x") as Hex;
  } catch (err) {
    return errorResponse(404, {
      error: "call-reverted",
      message: `eth_call reverted: ${(err as Error).message}`,
      hint: "The contract may not implement this method, or args may be invalid for the contract's state at this block.",
    });
  }

  let decoded: unknown;
  try {
    decoded = decodeFunctionResult({ abi: [fn], functionName: fn.name, data: rawReturnData });
  } catch (err) {
    return errorResponse(502, {
      error: "decode-failed",
      message: `decode failed: ${(err as Error).message}`,
      hint: "rawReturnData is included in the response so you can re-decode with a different ABI if needed.",
    });
  }

  // Normalize address-typed results to EIP-55 for tidy output.
  const normalized = normalizeResult(fn, decoded);

  const checksummed = toChecksumAddress(addrResult.value);
  const payload = {
    chainId: chainResult.value,
    chain: chain.name,
    contract: checksummed,
    method: canonicalSignature(fn),
    blockNumber: Number(blockNumber),
    blockHash,
    result: serializeForJson(normalized),
    provenance: {
      rpc: rpcLabel,
      abiSource: resolvedAbi.source,
      calldata,
      rawReturnData,
    },
    summary: summarizeContractRead({
      address: checksummed,
      chain: chain.name,
      method: canonicalSignature(fn),
      result: normalized,
      blockNumber,
    }),
  };

  return jsonResponse(payload, cacheControlForBlock(url.searchParams.get("block") ?? undefined));
};

// ---------------------------------------------------------------------------
// Helpers

interface MatchOk {
  ok: true;
  value: AbiFunction;
}
interface MatchErr {
  ok: false;
  error: string;
  message: string;
  hint?: string;
}

function matchFunction(abi: readonly unknown[], requested: string): MatchOk | MatchErr {
  const stripped = requested.replace(/\s+/g, "");
  const fns = abi.filter(
    (e): e is AbiFunction => typeof e === "object" && e !== null && (e as { type?: string }).type === "function",
  );
  // Try exact signature match first (e.g. "balanceOf(address)").
  for (const fn of fns) {
    if (canonicalSignature(fn) === stripped) return { ok: true, value: fn };
  }
  // Then bare name without parens (only unambiguous if a single overload exists).
  const bareName = stripped.replace(/\(.*$/, "");
  const byName = fns.filter((fn) => fn.name === bareName);
  if (byName.length === 1) return { ok: true, value: byName[0]! };
  if (byName.length > 1) {
    return {
      ok: false,
      error: "method-ambiguous",
      message: `${bareName} has ${byName.length} overloads on this ABI`,
      hint: `Use the full signature: ${byName.map(canonicalSignature).join(", ")}`,
    };
  }
  return {
    ok: false,
    error: "method-not-found",
    message: `method ${requested} not found in this contract's ABI`,
    hint: "Use /api/contract/abi to list available methods.",
  };
}

function canonicalSignature(fn: AbiFunction): string {
  const inputs = (fn.inputs ?? []).map(canonicalType).join(",");
  return `${fn.name}(${inputs})`;
}

function canonicalType(input: { type: string; components?: ReadonlyArray<{ type: string; components?: unknown }> }): string {
  // Solidity ABI canonicalization: tuples expand to (t1,t2,...).
  if (input.type.startsWith("tuple") && input.components) {
    const inner = input.components.map((c) => canonicalType(c as never)).join(",");
    return input.type.replace("tuple", `(${inner})`);
  }
  return input.type;
}

interface EncodedArgsOk {
  ok: true;
  value: unknown[];
}

function encodeArgs(fn: AbiFunction, raw: string[]): EncodedArgsOk | MatchErr {
  const inputs = fn.inputs ?? [];
  const out: unknown[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const t = inputs[i]!.type;
    const v = raw[i]!;
    if (t.endsWith("[]") || t.startsWith("tuple")) {
      return {
        ok: false,
        error: "arg-type-unsupported",
        message: `arg #${i} has type ${t}; arrays and tuples aren't supported via GET in this MVP`,
        hint: "Open an issue if you need this — POST with a JSON body is the planned follow-up.",
      };
    }
    if (t === "address") {
      // Let viem's isAddress + getAddress validate; rethrow as 400.
      try {
        out.push(getAddress(v));
      } catch (err) {
        return { ok: false, error: "arg-invalid", message: `arg #${i}: invalid address "${v}"` };
      }
      continue;
    }
    if (t === "bool") {
      if (v === "true" || v === "1") out.push(true);
      else if (v === "false" || v === "0") out.push(false);
      else return { ok: false, error: "arg-invalid", message: `arg #${i}: bool must be true/false/0/1, got "${v}"` };
      continue;
    }
    if (t.startsWith("uint") || t.startsWith("int")) {
      if (!/^-?\d+$/.test(v)) {
        return { ok: false, error: "arg-invalid", message: `arg #${i}: ${t} must be an integer, got "${v}"` };
      }
      out.push(BigInt(v));
      continue;
    }
    if (t === "bytes" || /^bytes\d+$/.test(t)) {
      if (!/^0x[0-9a-fA-F]*$/.test(v)) {
        return { ok: false, error: "arg-invalid", message: `arg #${i}: ${t} must be 0x-prefixed hex, got "${v}"` };
      }
      out.push(v);
      continue;
    }
    if (t === "string") {
      out.push(v);
      continue;
    }
    return {
      ok: false,
      error: "arg-type-unsupported",
      message: `arg #${i} has type ${t}; not supported in MVP`,
    };
  }
  return { ok: true, value: out };
}

function normalizeResult(fn: AbiFunction, decoded: unknown): unknown {
  const outputs = fn.outputs ?? [];
  // viem unwraps single-output methods to a scalar; multi-output becomes a tuple.
  if (outputs.length === 1) return normalizeByType(outputs[0]!.type, decoded);
  if (outputs.length > 1 && Array.isArray(decoded)) {
    return decoded.map((v, i) => normalizeByType(outputs[i]!.type, v));
  }
  return decoded;
}

function normalizeByType(type: string, value: unknown): unknown {
  if (type === "address" && typeof value === "string") return getAddress(value as `0x${string}`);
  if (type === "address[]" && Array.isArray(value)) {
    return value.map((a) => getAddress(a as `0x${string}`));
  }
  return value;
}

/** Recursively turn bigints into strings so JSON.stringify doesn't throw. */
function serializeForJson(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(serializeForJson);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = serializeForJson(val);
    return out;
  }
  return v;
}
