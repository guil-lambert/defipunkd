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
      // Re-fetch from origin after this many seconds. Master-file updates
      // thus become visible within the window even without a redeploy.
      // Short enough to pick up fresh assessments quickly; long enough
      // that a popular page isn't re-rendered on every request.
      expiration: 60,
      // /api/* are dynamic JSON endpoints with query-param-keyed responses,
      // not page renders. ISR's path-keyed cache + crash-prone wrapper
      // (it returns FUNCTION_INVOCATION_FAILED on routes that do their own
      // streaming/JSON output) does not fit this access pattern. Each route
      // sets its own Cache-Control: see apps/web/src/lib/onchain/error.ts.
      exclude: [/^\/api\//],
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
