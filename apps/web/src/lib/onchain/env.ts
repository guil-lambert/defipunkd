/**
 * Read a server-only secret from whichever env source has it.
 *
 * On Vercel, runtime env vars live in `process.env`. In local `astro dev`,
 * Vite reads `apps/web/.env` into `import.meta.env` but does NOT populate
 * `process.env`, so a naive `process.env.ETHERSCAN_API_KEY` read returns
 * undefined locally even though the value is on disk. This helper checks
 * `process.env` first (so prod behavior is identical) and falls back to
 * `import.meta.env` so local dev "just works" without a separate dotenv
 * loader.
 *
 * Use only for server-side secrets — Astro strips non-PUBLIC `import.meta.env`
 * keys from client bundles, so this is safe in SSR routes only.
 */
export function readServerEnv(key: string): string | null {
  const fromProcess = typeof process !== "undefined" ? process.env?.[key] : undefined;
  if (fromProcess && fromProcess.length > 0) return fromProcess;
  const meta = (import.meta as { env?: Record<string, string | undefined> }).env;
  const fromMeta = meta?.[key];
  if (fromMeta && fromMeta.length > 0) return fromMeta;
  return null;
}
