/**
 * GET /api/extension/protocol/[slug].json
 *
 * Returns the full ProtocolRecord for a single protocol, keyed by the
 * DeFiLlama slug. Map keys already include family parent slugs and slug
 * aliases (e.g. "aave", "sky"), so a raw DeFiLlama slug resolves directly.
 *
 * CORS-enabled so the extension can fetch from any origin.
 */
import type { APIRoute } from "astro";
import { jsonResponse } from "../../../../lib/onchain/error.js";
import { buildExtensionMap } from "../../../../lib/extension-data.js";

export const prerender = false;

const CACHE = "public, s-maxage=300, stale-while-revalidate=86400";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;
  const map = buildExtensionMap();
  const record = slug ? map[slug] : undefined;

  if (!record) {
    return new Response(
      JSON.stringify({ error: "not-found", slug: slug ?? "" }, null, 2),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          ...CORS,
        },
      },
    );
  }

  return jsonResponse(record, CACHE, CORS);
};

export const OPTIONS: APIRoute = async () =>
  new Response(null, { status: 204, headers: CORS });
