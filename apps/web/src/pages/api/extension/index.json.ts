/**
 * GET /api/extension/index.json
 *
 * Returns a lightweight index of all assessed protocols (grade, tier, slices)
 * for the DeFiLlama browser extension. Strips verbose fields (about, pills,
 * verdict, shortHeadline) — use /api/extension/protocol/[slug].json for those.
 *
 * CORS-enabled so the extension can fetch from any origin.
 */
import type { APIRoute } from "astro";
import { jsonResponse } from "../../../lib/onchain/error.js";
import { buildExtensionMap, toIndex } from "../../../lib/extension-data.js";

export const prerender = false;

const CACHE = "public, s-maxage=300, stale-while-revalidate=86400";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const GET: APIRoute = async () => {
  const protocols = toIndex(buildExtensionMap());
  return jsonResponse({ protocols }, CACHE, CORS);
};

export const OPTIONS: APIRoute = async () =>
  new Response(null, { status: 204, headers: CORS });
