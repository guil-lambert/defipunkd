import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import vercel from "@astrojs/vercel/serverless";

// Hybrid mode: pages are server-rendered by default, but we mark the
// landing / contribute / methodology pages as prerender=true so they
// ship as static HTML. /protocol/[slug].astro is prerender=false + ISR,
// so we render on demand and cache at the edge — no more 8107-page
// static build for every master-file update.
export default defineConfig({
  site: "https://defipunkd.com",
  output: "server",
  adapter: vercel({
    isr: {
      // No expiration: pages are cached for the life of the deployment.
      // Data files are bundled into the function via includeFiles, so
      // content can only change on redeploy; time-based revalidation just
      // burned ISR write units.
      // /api/* are dynamic JSON endpoints with query-param-keyed responses,
      // not page renders. ISR's path-keyed cache + crash-prone wrapper
      // (it returns FUNCTION_INVOCATION_FAILED on routes that do their own
      // streaming/JSON output) does not fit this access pattern. Each route
      // sets its own Cache-Control: see apps/web/src/lib/onchain/error.ts.
      // /address/* is an unbounded URL space of live on-chain reads; it sets
      // its own CDN Cache-Control instead of filling the ISR cache.
      exclude: [/^\/api\//, /^\/address\//],
    },
    // Data files live outside apps/web and are read at runtime by
    // @defipunkd/registry via process.cwd() traversal. Bundle them with
    // the serverless function so they're readable from /var/task.
    includeFiles: [
      "../../data/defillama-snapshot.json",
      "../../data/overlays",
      "../../data/assessments",
      "../../data/master",
      "../../data/submissions",
      "../../data/enrichment",
    ],
  }),
  integrations: [svelte()],
  devToolbar: { enabled: false },
});
