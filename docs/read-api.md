# Read API: deployment & runtime gotchas

Quick reference for the three machine-readable read endpoints under
`apps/web/src/pages/api/{contract,safe}/*` (added in PRs #158–#160 and the
follow-ups on `main`). Each section captures something that bit us in
production while landing the API. If you're about to touch this code or
debug a production incident, scan this first.

## Endpoints

| Path | Use | Calls into |
|---|---|---|
| `/api/contract/abi` | Verified ABI lookup; auto-resolves proxies | Etherscan v2 → Sourcify |
| `/api/contract/read` | Encode/decode any view/pure call | viem `eth_call` via Alchemy → public RPC |
| `/api/safe/owners` | threshold + owners + version in one call | viem `multicall`-style aggregate |
| `/address/[chainId]/[address]` | HTML surfacer that emits the above URLs for a given address | None — pure URL synthesis |

Shared shape: every successful response returns `chainId`, `chain`, `contract`
(EIP-55), `blockNumber`, `blockHash`, decoded `result`, and a `provenance`
block (raw `calldata`, raw `rawReturnData`, the RPC providers tried). Errors
share `{ error, message, hint? }`.

## Vercel + Astro

### `/api/*` must be excluded from ISR

`apps/web/astro.config.mjs` sets `isr: { expiration: 60 }` for the
ISR-cached protocol pages. Without an `exclude`, **the Astro Vercel adapter
wraps every `output: server` route — including API endpoints — in the same
ISR singleton function**. ISR is path-keyed; its wrapper crashes on routes
that build their own `Response` with their own `Cache-Control`, surfacing as
`FUNCTION_INVOCATION_FAILED` on `/_isr` with `x_astro_path=/api/...` in the
log. Fix is one line:

```ts
isr: { expiration: 60, exclude: [/^\/api\//] }
```

Each `/api/*` route then runs as its own serverless function and owns its
caching via `apps/web/src/lib/onchain/error.ts:cacheControlForBlock`.

### Server-only secrets: use `process.env.X`, never `import.meta.env.X`

Astro 5 + Vite replaces `import.meta.env.X` at build time and only exposes
`PUBLIC_*` prefixed vars in production. Runtime-only Vercel project envs
(`ALCHEMY_API_KEY`, `ETHERSCAN_API_KEY`) resolve to `undefined` through that
path in some bundling configurations. `apps/web/src/lib/onchain/client.ts`
and `lib/onchain/abi.ts` read `process.env.X` with an empty-string guard —
keep that pattern for any new server-side secret.

### `console.error` in catch paths

Vercel function logs do not show response bodies — only status codes. A 502
from `/api/contract/read` could be `rpc-block-failed`, `decode-failed`, or
an unhandled exception, and the only way to tell from the dashboard is the
stack trace from a `console.error`. Every catch path in
`apps/web/src/pages/api/{contract,safe}/*` logs the err object plus relevant
context (rpcLabel, methodRaw, rawReturnData, address). Future routes should
do the same.

## Alchemy & RPC

### Domain allowlist needs explicit `Origin` + `Referer`

If the Alchemy app has any domain configured under "Allowed Domains",
**server-to-server `fetch()` from Vercel functions is rejected with HTTP
403 in ~6 ms** — Node's fetch sends no `Origin` or `Referer` by default,
and Alchemy's allowlist treats no-origin as no-match. We attach both
headers explicitly via viem's `http(url, { fetchOptions: { headers } })` in
`apps/web/src/lib/onchain/client.ts`. The headers are spoofable by any HTTP
client (Alchemy's allowlist is browser-policy hardening, not real auth — the
key itself is the auth), so sending them from our backend is exactly the
intended pattern for "this server represents the defipunkd.com property."

If the key leaks, the allowlist gives ~zero protection. Real protections:
- **Hard CU / $ cap** in the Alchemy dashboard (only line of defense that
  bounds financial damage).
- **Don't expose the key client-side** — already the case; it's in Vercel
  server env only.
- **Per-IP rate limiting on `/api/*`** if abuse becomes a real signal
  (currently we rely on Vercel edge cache + `s-maxage`).

### Avoid Cloudflare-fronted public RPCs as fallback

`eth.llamarpc.com` returns Cloudflare's "Just a moment..." JS challenge to
Vercel datacenter IPs, making it useless as a server-side fallback even
though it works fine in browsers. We use `ethereum-rpc.publicnode.com` for
ETH and `bsc-rpc.publicnode.com` for BSC. Other chains in
`apps/web/src/lib/onchain/chains.ts` use official sequencer / public
endpoints (mainnet.optimism.io, arb1.arbitrum.io/rpc, mainnet.base.org,
…) which are not Cloudflare-fronted. **Test any new public RPC URL from a
Vercel preview deploy — not from `pnpm dev` on your laptop — before
adding it to the rotation.**

viem's `fallback([alchemy, public])` rotates only on transport-level
errors. If 100% of traffic is hitting the public fallback, that means the
primary isn't being constructed at all (env var missing, allowlist
rejecting); investigate before declaring fallback resilience.

## viem `eth_call` edge cases

### EOAs return `{ data: '0x' }` — they don't revert

`client.call({ to: <EOA>, data: ... })` succeeds with empty data because
there's no code at the address to execute. Naively passing `'0x'` to
`decodeFunctionResult` throws `AbiDecodingZeroDataError`, which surfaces as
500 if unhandled. Both `apps/web/src/pages/api/safe/owners.ts` (the safe
gate) and any future decode path must short-circuit on `r.raw === '0x'`
*before* the decode, in addition to the revert check. We also wrap the
decodes in try/catch as defense-in-depth — a non-Safe contract that
responds to the selector but returns malformed data shouldn't crash the
function either.

## LLM client quirks

### Browser-tool URL allowlists: surfacer page + pre-baked URLs in prompt

ChatGPT's browser tool and Claude.ai's `web_fetch` both refuse to fetch
URLs that haven't appeared verbatim in conversation context. **The
allowlist also rejects URLs the LLM constructs from a template** — the
prompt describing the URL pattern is not enough; the exact URL string
has to be in context as text.

Two-tier solution:

1. **The surfacer page**
   `apps/web/src/pages/address/[chainId]/[address].astro` is a
   server-rendered HTML page whose body contains concrete
   `/api/contract/abi`, `/api/contract/read`, and `/api/safe/owners`
   URLs for the queried address (~14 URLs covering ABI, owner/admin
   reads, Safe shortcut, ERC-20 fields, timelock constants). Once the
   LLM fetches the surfacer page, those embedded URLs are in context
   and become fetchable directly.

2. **Pre-baked surfacer URLs in the prompt**
   The prompt itself can't unlock the surfacer URL — the allowlist
   rejects template-constructed URLs. So `packages/prompts/src/index.ts`
   emits **one concrete surfacer URL per pinned `address_book` entry**,
   verbatim, in the preamble's "Pre-built read-API surfacer URLs"
   section. The LLM sees those URLs as text → allowlist accepts them →
   fetches the surfacer page → embedded API URLs are now in context →
   read API calls go through.

The chain — verbatim surfacer URL → fetched HTML → verbatim API URLs →
fetched JSON — works without any user paste once the prompt has the
address book.

For addresses discovered transitively during the assessment (e.g. an
admin returned by `owner()`), the LLM cannot construct a fetchable
surfacer URL on its own. As of PROMPT_VERSION 19 the preamble teaches a
**URL-relay** escape hatch: the LLM emits a "URL FETCH REQUEST" fenced
code block listing the surfacer URLs it needs, asks the user to paste
them back as a new message, and pauses without emitting JSON. Once the
user pastes, the URLs are in user-message context and become fetchable;
the LLM resumes the assessment with the answers in `evidence[]`. The
contributor's role becomes a one-click copy-paste relay, not a curl
runner. Falling back to `grade="unknown"` is reserved for cases where
the user declines or the surfacer fetch returns a non-200.

After `defipunkd.com` lands on Anthropic's / OpenAI's standard
fetchable-domain allowlist (the proper long-term fix), this restriction
goes away entirely and the URL relay becomes vestigial.

If you add new common-method URLs to the surfacer, edit `groups[]` in
the `.astro` file — keep the list short and well-named so the LLM picks
meaningful URLs to fetch instead of spamming the API.

### `()` in `method=` triggers safety rejection

ChatGPT's web tool (and likely others) normalizes URLs before fetching:
reorders query params, percent-encodes parens (`(` → `%28`, `)` → `%29`).
Its safety layer then refuses to fetch the normalized URL because it no
longer matches the user-provided / context URL exactly. Net effect: a URL
written as `?method=totalSupply()` in chat is unfetchable through the
browser tool, even if the user just pasted it verbatim.

The fix is on the prompt side — teach the LLM to use the BARE method
name. `apps/web/src/pages/api/contract/read.ts:matchFunction` already
falls through to bare-name matching when the requested string lacks
parens, so `?method=totalSupply` works for any method without overloads
(which is most of them). Multi-overload methods still need the full
signature; the API returns `error: "method-ambiguous"` with a hint
listing the canonical signatures so the LLM can retry.

The preamble's "On-chain reading via the DeFiPunkd API" section as of
PROMPT_VERSION 16 spells this out and uses bare names in every example.
If you add a slice-body URL example, use bare names too.

### `&amp;` query-string separators

When an LLM (observed: Claude.ai) renders a URL into its chat / thinking
buffer, the chat UI HTML-encodes ampersands for display (`&` → `&amp;`).
If the LLM's `web_fetch` then reads that rendered string back to make the
real HTTP call, the request goes out with literal `&amp;` between params.
A strict server splits on `&` and ends up with garbage param names like
`amp;address` → 400 missing-address → web_fetch reports "Failed to fetch".

We can't fix the encoding from our side; we tolerate it.
`apps/web/src/lib/onchain/validate.ts:getTolerantSearchParams` rebuilds
`URLSearchParams` from a `&amp;`-decoded query string. All three routes use
it instead of `url.searchParams`. Legitimate query strings should never
contain literal `&amp;`, so this is a free robustness win.

If you add a new `/api/*` route, use `getTolerantSearchParams(url)` from
the start.

## Verification checklist when redeploying

After a change to any of the above, retest:

```bash
# 1. Plain end-to-end (USDC = proxy, exercises proxy resolution + Alchemy).
curl -sS "https://defipunkd.com/api/contract/read?chainId=1&address=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&method=totalSupply()" | jq '.result, .blockNumber, .provenance'

# 2. EOA — must return 404 not-a-safe, not 500.
curl -sS "https://defipunkd.com/api/safe/owners?chainId=1&address=0xB33f8879d4608711cEBb623F293F8Da13B8A37c5" | jq

# 3. Broken &amp; tolerance — must succeed.
curl -sS "https://defipunkd.com/api/contract/read?chainId=1&amp;address=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48&amp;method=totalSupply()" | jq '.result'

# 4. Provenance shows both providers (alchemy first, public second).
curl -sS "https://defipunkd.com/api/contract/read?chainId=1&address=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&method=totalSupply()" | jq '.provenance.rpc'
# Expected: "alchemy/eth-mainnet,public/ethereum-rpc.publicnode.com"
```

If `provenance.rpc` shows only `public/...`, Alchemy isn't being constructed
— check the env var and the allowlist headers. If provenance is missing
entirely (response is an error envelope), the `hint` field includes the
RPC providers that were tried.
