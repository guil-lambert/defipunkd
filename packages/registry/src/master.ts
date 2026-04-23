import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ProtocolMetadata, SliceId } from "./assessments";

export type MasterSliceConsensus = {
  grade: "green" | "orange" | "red" | "unknown";
  strength: "strong" | "weak" | null;
  headline: string;
  rationale: {
    findings: Array<{ code: string; text: string }>;
    steelman: { red: string; orange: string; green: string } | null;
    verdict: string;
  };
  evidence: Array<{
    url: string;
    shows: string;
    chain?: string;
    address?: string;
    commit?: string;
    fetched_at?: string;
  }>;
  dissent: Array<{
    path: string;
    model: string;
    grade: "green" | "orange" | "red" | "unknown";
    reason?: string;
  }>;
};

export type Master = {
  schema_version: 1;
  slug: string;
  generated_at: string;
  reconciler_model: string;
  reconciler_kind: "llm" | "deterministic-fallback";
  slices: Record<SliceId, MasterSliceConsensus>;
  protocol_metadata: ProtocolMetadata;
  source_submissions: Array<{
    slice: SliceId;
    path: string;
    model: string;
    grade: "green" | "orange" | "red" | "unknown";
  }>;
  flags: string[];
};

export function loadMasters(dataDir: string): Map<string, Master> {
  const out = new Map<string, Master>();
  const dir = join(dataDir, "master");
  if (!existsSync(dir)) return out;
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return out;
  }
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const slug = file.slice(0, -5);
    try {
      const raw = readFileSync(join(dir, file), "utf8");
      const parsed = JSON.parse(raw) as Master;
      if (parsed && typeof parsed === "object" && parsed.slug === slug) {
        out.set(slug, parsed);
      }
    } catch (err) {
      console.warn(`[registry] invalid master file ${file}: ${(err as Error).message}`);
    }
  }
  return out;
}
