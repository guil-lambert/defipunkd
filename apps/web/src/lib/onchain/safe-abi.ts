/**
 * Minimal Safe (Gnosis Safe) ABI fragment for the /safe/owners read.
 *
 * We only need three view functions, all stable across Safe v1.0+ releases.
 * Using a hand-typed `as const` literal lets viem infer return types.
 */
export const SAFE_ABI = [
  {
    type: "function",
    name: "getOwners",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]", name: "" }],
  },
  {
    type: "function",
    name: "getThreshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256", name: "" }],
  },
  {
    type: "function",
    name: "VERSION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string", name: "" }],
  },
] as const;
