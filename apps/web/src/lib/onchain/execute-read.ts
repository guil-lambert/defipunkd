/**
 * Execute a single view/pure ABI function against a contract and return the
 * decoded result alongside the raw calldata + return data.
 *
 * Shared by /api/contract/read (single explicit call) and the address surfacer
 * page (batch pre-execution of zero-arg view methods) so both decode through
 * the exact same pipeline.
 */
import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  type AbiFunction,
  type Hex,
  type PublicClient,
} from "viem";

export interface ExecuteReadOk {
  ok: true;
  /** Decoded, address-normalized (EIP-55) result. bigints are NOT serialized — caller decides. */
  value: unknown;
  calldata: Hex;
  rawReturnData: Hex;
}

export interface ExecuteReadErr {
  ok: false;
  stage: "encode" | "call" | "decode";
  message: string;
}

export type ExecuteReadResult = ExecuteReadOk | ExecuteReadErr;

export interface ExecuteReadInput {
  client: PublicClient;
  address: `0x${string}`;
  fn: AbiFunction;
  args: readonly unknown[];
  blockNumber: bigint;
}

export async function executeRead(input: ExecuteReadInput): Promise<ExecuteReadResult> {
  const { client, address, fn, args, blockNumber } = input;

  let calldata: Hex;
  try {
    calldata = encodeFunctionData({ abi: [fn], functionName: fn.name, args: args as unknown[] });
  } catch (err) {
    return { ok: false, stage: "encode", message: (err as Error).message };
  }

  let rawReturnData: Hex;
  try {
    const ret = await client.call({ to: address, data: calldata, blockNumber });
    // viem returns 0x for EOAs (no revert). Decoding 0x with a non-empty output
    // ABI throws — that flows through to the decode error below, which is the
    // signal we want anyway.
    rawReturnData = (ret.data ?? "0x") as Hex;
  } catch (err) {
    return { ok: false, stage: "call", message: (err as Error).message };
  }

  let decoded: unknown;
  try {
    decoded = decodeFunctionResult({ abi: [fn], functionName: fn.name, data: rawReturnData });
  } catch (err) {
    return { ok: false, stage: "decode", message: (err as Error).message };
  }

  return {
    ok: true,
    value: normalizeResult(fn, decoded),
    calldata,
    rawReturnData,
  };
}

/** Single-output methods are unwrapped to a scalar by viem; multi-output is a tuple. */
export function normalizeResult(fn: AbiFunction, decoded: unknown): unknown {
  const outputs = fn.outputs ?? [];
  if (outputs.length === 1) return normalizeByType(outputs[0]!.type, decoded);
  if (outputs.length > 1 && Array.isArray(decoded)) {
    return decoded.map((v, i) => normalizeByType(outputs[i]!.type, v));
  }
  return decoded;
}

function normalizeByType(type: string, value: unknown): unknown {
  if (type === "address" && typeof value === "string") {
    return getAddress(value as `0x${string}`);
  }
  if (type === "address[]" && Array.isArray(value)) {
    return value.map((a) => getAddress(a as `0x${string}`));
  }
  return value;
}
