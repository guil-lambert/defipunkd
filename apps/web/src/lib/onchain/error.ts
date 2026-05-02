/**
 * Uniform JSON error envelope for the read API.
 *
 * Stable shape so an LLM agent can parse failures without per-endpoint logic:
 *   { error: "<kebab-code>", message: "...", hint?: "..." }
 */

export interface ApiError {
  error: string;
  message: string;
  hint?: string;
}

export function errorResponse(status: number, body: ApiError): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function jsonResponse(body: unknown, cacheControl: string): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
    },
  });
}

export function cacheControlForBlock(blockParam: string | undefined): string {
  if (blockParam && blockParam !== "latest") {
    // A pinned block is content-addressed — its return value never changes.
    return "public, s-maxage=31536000, max-age=600, immutable";
  }
  // ~1 mainnet block; SWR window keeps the edge serving while it refetches.
  return "public, s-maxage=12, stale-while-revalidate=60";
}
