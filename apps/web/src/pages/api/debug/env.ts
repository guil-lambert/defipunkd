/**
 * Dev-only env-presence check. Reports which server-side keys are loaded
 * into process.env without ever returning their values — useful when the
 * /api/contract/abi resolver returns abi-not-found locally and you need
 * to verify whether ETHERSCAN_API_KEY is actually visible to the running
 * dev server (vs. only sitting in apps/web/.env on disk).
 *
 * Returns 404 in production so this never shows up on defipunkd.com.
 */
import type { APIRoute } from "astro";
import { readServerEnv } from "../../../lib/onchain/env.js";

export const prerender = false;

const KEYS = ["ETHERSCAN_API_KEY", "ALCHEMY_API_KEY"] as const;

export const GET: APIRoute = async () => {
  if (process.env.NODE_ENV === "production") {
    return new Response("not found", { status: 404 });
  }
  const report = Object.fromEntries(
    KEYS.map((k) => {
      const v = readServerEnv(k);
      return [
        k,
        v
          ? { present: true, length: v.length, prefix: v.slice(0, 4) }
          : { present: false },
      ];
    }),
  );
  return new Response(
    JSON.stringify({ nodeEnv: process.env.NODE_ENV ?? null, env: report }, null, 2),
    {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    },
  );
};
