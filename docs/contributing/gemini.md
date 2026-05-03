# Running DeFiPunk'd assessment prompts on Gemini

The user prompt expects the model to fetch protocol websites, audit PDFs, and
on-chain reads via the DeFiPunk'd read API or block-explorers. Gemini can do
all of this — but only when the surface you're running on actually exposes the
search-grounding or URL-fetching tool to the model. Different Gemini deployment
surfaces ship with different tool defaults, and a few inject system-level
"do not search" guardrails that override anything our user prompt says.

If your Gemini run produces a JSON with `grade: "unknown"`, empty `evidence[]`,
and an `unknowns[]` entry citing "tools forbidden by system instructions" or
"google_search forbidden by system prompt", you have hit one of those
guardrails. The fix is environmental — pick a surface that doesn't block the
tools — not prompt-side.

## Surfaces that work

- **gemini.google.com** (consumer chat). Search grounding is on by default.
  No configuration needed. This is the easiest path for one-off contributions.
- **Google AI Studio** (`aistudio.google.com`). Works **only** when the
  "Grounding with Google Search" tool is toggled ON in the right-hand tools
  panel before you send the prompt. The toggle resets per session.
- **Vertex AI** with the grounding tool enabled in the request config. If
  you're calling the API directly, attach the grounding tool to the
  `tools` array in your request — without it, Gemini has no search and will
  return blocked-by-tooling output.

## Surfaces that don't (without configuration)

- **Any wrapper / Chrome extension / playground that injects** a system prompt
  like `Do NOT issue search queries to the google search tool for this
  prompt.` These guardrails outrank our user prompt and Gemini will faithfully
  refuse to search. Inspect the wrapper's system-prompt config and either
  strip that line or use a different surface.
- **Restricted-tier Vertex AI deployments** where grounding is policy-disabled.
  Same symptom; same fix (different surface or get the policy lifted).
- **Stale conversations**: if earlier in the same Gemini session you told it
  "stop searching, just answer me", that turn can stick as an effective
  constraint for the rest of the session. Start a fresh conversation.

## Quick diagnostic

Before sending the assessment prompt, run a one-line probe in the same Gemini
session:

> Do you have access to a search-grounding tool right now? If yes, name it.
> If no, name the system instruction that forbids it (verbatim).

If Gemini answers "yes, google_search" or similar, the assessment prompt will
work. If it names a forbidden-tool instruction, switch surfaces before
spending time on the assessment.

## Why this matters

The assessment prompt's quorum logic weights submissions by what they
actually verified. A Gemini run that lacks search returns empty `evidence[]`
and is correctly weighted at zero by the validator — it doesn't pollute the
quorum, but it also doesn't contribute. Running on a surface that exposes
search lets the same model contribute real off-chain corroboration weighted
at ~0.3× of an on-chain run, which is meaningful signal especially for
protocols that are well-documented but where on-chain reads timeout or hit
rate limits.

In short: the prompt is the same, the model is the same, but the deployment
surface decides whether your contribution counts. Pick the right one.
