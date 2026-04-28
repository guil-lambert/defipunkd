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

  return issues;
}

export { isExplorerUrl };
