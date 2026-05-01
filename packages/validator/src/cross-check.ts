import type { Submission } from "./schema";
import { SLICES } from "./schema";

const PROVIDER_SHARE_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "claude.ai",
  "gemini.google.com",
  "g.co",
  "chat.mistral.ai",
  "grok.com",
  "copilot.microsoft.com",
  "www.perplexity.ai",
  "perplexity.ai",
];

export type ChatUrlReachability =
  | { ok: true; status: number }
  | { ok: false; status: number | null; reason: string };

// Liveness check only: confirms the share URL resolves to *something* on the
// provider host. Catches typos, dead links, and fabricated IDs on claude.ai
// (403) and chatgpt.com (404). Does NOT catch tampering on gemini.google.com
// — the SPA shell returns 200 for any well-formed /share/<anything>, so a
// bogus Gemini share ID looks identical to a real one over plain HTTP.
export async function verifyChatUrlReachable(
  url: string,
  opts: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<ChatUrlReachability> {
  const fetchFn = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,*/*;q=0.5",
      },
    });
    if (res.status >= 200 && res.status < 400) return { ok: true, status: res.status };
    return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
  } catch (err) {
    const reason = (err as Error).name === "AbortError" ? `timeout after ${timeoutMs}ms` : (err as Error).message;
    return { ok: false, status: null, reason };
  } finally {
    clearTimeout(timer);
  }
}

export function isHallucinationProneModel(model: string): boolean {
  const m = model.toLowerCase();
  if (/claude-haiku-4-5/.test(m)) return true;
  if (/gemini-3-flash-preview/.test(m)) return true;
  const gpt = m.match(/gpt-(\d+(?:\.\d+)?)/);
  if (gpt && parseFloat(gpt[1]!) <= 5.3) return true;
  return false;
}

// "Thinking" models do meaningful chain-of-thought before answering. The
// distinction matters for an audit task: non-thinking models pattern-match
// from training data and are far more likely to miss subtle on-chain
// reasoning, which the quorum then has to absorb. We downweight non-thinking
// models 5x (vs. 20x for hallucination-prone) so they can still contribute
// signal but can't drown out a single thinking submission.
export function isThinkingModel(model: string): boolean {
  const m = model.toLowerCase();
  // Explicit thinking/reasoning markers in the model name
  if (/thinking|reason/.test(m)) return true;
  // Claude: Opus runs extended thinking by default; Sonnet/Haiku do not.
  if (/claude-opus/.test(m)) return true;
  // OpenAI o-series (o1, o3, o4, …) are reasoning models.
  if (/^o\d/.test(m)) return true;
  // Gemini: Pro tier (3+) ships with built-in deep thinking; -flash is
  // speed-tuned and does not.
  if (/gemini-(?:3|[4-9])(?:\.\d+)?-pro/.test(m)) return true;
  return false;
}

export function isNonThinkingModel(model: string): boolean {
  return !isHallucinationProneModel(model) && !isThinkingModel(model);
}

export function isPublicChatShareUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.toLowerCase();
    if (!PROVIDER_SHARE_HOSTS.some((h) => host === h || host.endsWith("." + h))) return false;
    return /\/share\//.test(pathname) || host === "g.co";
  } catch {
    return false;
  }
}

export type CrossCheckContext = {
  currentPromptVersion: number;
  currentSnapshotGeneratedAt: string;
  knownSlugs: Set<string>;
  filePath: string | null;
};

export type CrossCheckIssue = {
  severity: "error" | "warning";
  field: string;
  message: string;
};

const ONCHAIN_SLICES = new Set<Submission["slice"]>([
  "control",
  "ability-to-exit",
  "autonomy",
  "verifiability",
]);

const EXPLORER_HOSTS = [
  "etherscan.io",
  "basescan.org",
  "arbiscan.io",
  "optimistic.etherscan.io",
  "polygonscan.com",
  "bscscan.com",
  "snowtrace.io",
  "ftmscan.com",
  "gnosisscan.io",
  "scrollscan.com",
  "lineascan.build",
  "celoscan.io",
  "era.zksync.network",
  "explorer.zksync.io",
  "blastscan.io",
  "mantlescan.xyz",
];

function isExplorerUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return EXPLORER_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

export function crossCheck(s: Submission, ctx: CrossCheckContext): CrossCheckIssue[] {
  const issues: CrossCheckIssue[] = [];

  if (!ctx.knownSlugs.has(s.slug)) {
    issues.push({
      severity: "error",
      field: "slug",
      message: `slug "${s.slug}" is not present in the current DeFiLlama snapshot`,
    });
  }

  if (!SLICES.includes(s.slice)) {
    issues.push({
      severity: "error",
      field: "slice",
      message: `slice "${s.slice}" is not one of ${SLICES.join(", ")}`,
    });
  }

  if (ctx.filePath) {
    const parts = ctx.filePath.split("/");
    const sliceDir = parts[parts.length - 2];
    const slugDir = parts[parts.length - 3];
    if (slugDir && slugDir !== s.slug) {
      issues.push({
        severity: "error",
        field: "slug",
        message: `slug field "${s.slug}" does not match parent directory "${slugDir}"`,
      });
    }
    if (sliceDir && sliceDir !== s.slice) {
      issues.push({
        severity: "error",
        field: "slice",
        message: `slice field "${s.slice}" does not match parent directory "${sliceDir}"`,
      });
    }
  }

  if (s.prompt_version > ctx.currentPromptVersion) {
    issues.push({
      severity: "error",
      field: "prompt_version",
      message: `prompt_version ${s.prompt_version} is newer than the repo's current version (${ctx.currentPromptVersion})`,
    });
  } else if (s.prompt_version < ctx.currentPromptVersion) {
    issues.push({
      severity: "warning",
      field: "prompt_version",
      message: `prompt_version ${s.prompt_version} is older than current (${ctx.currentPromptVersion}); downweighted by quorum`,
    });
  }

  if (s.snapshot_generated_at !== ctx.currentSnapshotGeneratedAt) {
    issues.push({
      severity: "warning",
      field: "snapshot_generated_at",
      message: `snapshot pin does not match current snapshot (${ctx.currentSnapshotGeneratedAt}); downweighted by quorum`,
    });
  }

  if (!isPublicChatShareUrl(s.chat_url ?? null)) {
    issues.push({
      severity: "warning",
      field: "chat_url",
      message: `no verified chat_url provided; quorum weight reduced by 95% — add a public share link (e.g. claude.ai, chatgpt.com, gemini.google.com) to restore full weight`,
    });
  }

  if (s.grade !== "unknown" && ONCHAIN_SLICES.has(s.slice)) {
    const hasExplorer = s.evidence.some((e) => isExplorerUrl(e.url));
    if (!hasExplorer) {
      issues.push({
        severity: "warning",
        field: "evidence",
        message: `on-chain slice "${s.slice}" has no block-explorer URL in evidence[]; downweighted by quorum`,
      });
    }
  }

  if (isHallucinationProneModel(s.model)) {
    issues.push({
      severity: "warning",
      field: "model",
      message: `model "${s.model}" is hallucination-prone (also: claude-haiku-4-5, gemini-3-flash-preview, gpt ≤ 5.3); quorum weight reduced by 95% — re-run with claude-opus-4-7, a "-thinking" GPT variant, gemini-3-pro, or similar to restore full weight`,
    });
  } else if (isNonThinkingModel(s.model)) {
    issues.push({
      severity: "warning",
      field: "model",
      message: `model "${s.model}" does not run with extended thinking; quorum weight reduced by 80% — re-run with a thinking variant (claude-opus-4-7, gpt-*-thinking, gemini-3-pro, openai o-series) to restore full weight`,
    });
  }

  if (s.grade !== "unknown" && s.evidence.length > 0) {
    const hasFetchedAt = s.evidence.some((e) => typeof e.fetched_at === "string" && e.fetched_at.length > 0);
    if (!hasFetchedAt) {
      issues.push({
        severity: "warning",
        field: "evidence",
        message: `evidence entries lack fetched_at timestamps; quorum gives up to +0.2 weight for cited-and-dated evidence`,
      });
    }
  }

  if (s.grade !== "unknown" && s.unknowns.length === 0) {
    issues.push({
      severity: "warning",
      field: "unknowns",
      message: `grade is "${s.grade}" but unknowns[] is empty; quorum awards +0.15 weight when a graded submission acknowledges residual unknowns`,
    });
  }

  return issues;
}

export { isExplorerUrl };
