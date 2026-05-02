/**
 * Memoized viem PublicClient per chainId, with a fallback RPC.
 *
 * Primary: Alchemy (paid, fast). Secondary: a curated public RPC per chain
 * (slower, stricter limits but free). viem's `fallback` transport rotates
 * to the next provider on errors so a single Alchemy hiccup doesn't
 * surface to the caller as a 502.
 *
 * If ALCHEMY_API_KEY is missing we still construct a client using the
 * public RPC alone, so the API stays usable in dev / preview environments
 * where the operator hasn't provisioned a key yet — same code path, just
 * slower with more rate-limit risk under load.
 */
import { createPublicClient, fallback, http, type PublicClient, type Transport } from "viem";
import { getChainEntry, type ChainEntry } from "./chains.js";

const CLIENTS = new Map<number, PublicClient>();

const ALCHEMY_ORIGIN_HEADERS = {
  Origin: "https://defipunkd.com",
  Referer: "https://defipunkd.com/",
};

export class OnchainConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OnchainConfigError";
  }
}

function alchemyKey(): string | null {
  // Server-only secret. Use process.env directly: Astro/Vite's import.meta.env
  // is build-time-replaced and only exposes PUBLIC_-prefixed vars in
  // production, while ALCHEMY_API_KEY is a runtime Vercel project env var.
  const k = process.env.ALCHEMY_API_KEY;
  return k && k.length > 0 ? k : null;
}

export interface ResolvedClient {
  client: PublicClient;
  chain: ChainEntry;
  /** Comma-joined ordered list of providers backing this client (for the response provenance). */
  rpcLabel: string;
}

export function getPublicClient(chainId: number): ResolvedClient {
  const entry = getChainEntry(chainId);
  if (!entry) {
    throw new OnchainConfigError(`unsupported chainId: ${chainId}`);
  }
  let client = CLIENTS.get(chainId);
  let rpcLabel: string;
  if (!client) {
    const transports: Transport[] = [];
    const labels: string[] = [];
    const key = alchemyKey();
    if (key) {
      // Alchemy's "Allowed Domains" feature checks Origin / Referer on
      // incoming requests. Server-to-server fetch() in Node doesn't send
      // either by default, so a key with defipunkd.com on its allowlist
      // gets rejected with a 403 in ~6ms unless we attach the headers
      // explicitly. (These headers are spoofable by any HTTP client and
      // are not auth — the API key itself is the auth — so sending them
      // here just opts our server-side calls into the allowlist that the
      // Alchemy app is already configured for.)
      transports.push(
        http(`https://${entry.alchemySlug}.g.alchemy.com/v2/${key}`, {
          fetchOptions: {
            headers: ALCHEMY_ORIGIN_HEADERS,
          },
        }),
      );
      labels.push(`alchemy/${entry.alchemySlug}`);
    }
    transports.push(http(entry.publicRpc));
    labels.push(`public/${new URL(entry.publicRpc).host}`);
    // viem's `fallback` retries the next transport on transport-level errors
    // (timeouts, 5xx, network failures). It does NOT retry on JSON-RPC
    // application errors like reverts, which is what we want.
    const transport = transports.length === 1 ? transports[0]! : fallback(transports);
    client = createPublicClient({ chain: entry.viemChain, transport });
    CLIENTS.set(chainId, client);
    rpcLabel = labels.join(",");
  } else {
    // Re-derive label from the entry; cheap and avoids storing it alongside
    // the cached client.
    const key = alchemyKey();
    rpcLabel = key
      ? `alchemy/${entry.alchemySlug},public/${new URL(entry.publicRpc).host}`
      : `public/${new URL(entry.publicRpc).host}`;
  }
  return { client, chain: entry, rpcLabel };
}
