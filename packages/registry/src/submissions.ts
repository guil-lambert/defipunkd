import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ProtocolMetadata, Rationale, SliceId } from "./assessments";

const ALL_SUBMISSIONS_DIR = "all";
const RISK_SLICES = new Set<SliceId>(["control", "ability-to-exit", "autonomy", "open-access", "verifiability"]);

export type SubmissionGrade = "green" | "orange" | "red" | "unknown";

export type SubmissionEvidence = {
  url: string;
  shows: string;
  chain?: string;
  address?: string;
  fetched_at?: string;
};

export type LoadedSubmission = {
  slug: string;
  slice: SliceId;
  model: string;
  chat_url: string | null;
  grade: SubmissionGrade;
  headline: string;
  short_headline?: string;
  rationale: Rationale;
  evidence: SubmissionEvidence[];
  unknowns?: string[];
  analysis_date?: string;
  protocol_metadata?: ProtocolMetadata;
  source_path: string;
};

type RawSubmission = {
  schema_version?: number;
  slug: string;
  slice: SliceId;
  model: string;
  chat_url?: string | null;
  grade: SubmissionGrade;
  headline: string;
  short_headline?: string;
  rationale: Rationale;
  evidence?: SubmissionEvidence[];
  unknowns?: string[];
  analysis_date?: string;
  protocol_metadata?: ProtocolMetadata;
};

/**
 * Scan data/submissions/{slug}/{slice}/*.json and data/submissions/{slug}/all/*.json
 * and return all raw submissions grouped by their actual slice.
 * Independent of data/assessments/ — this surfaces partial work that has
 * not yet reached quorum.
 */
export function loadSubmissions(dataDir: string): Map<string, Map<SliceId, LoadedSubmission[]>> {
  const out = new Map<string, Map<SliceId, LoadedSubmission[]>>();
  const submissionsDir = join(dataDir, "submissions");
  if (!existsSync(submissionsDir)) return out;

  let slugDirs: string[];
  try {
    slugDirs = readdirSync(submissionsDir);
  } catch {
    return out;
  }

  for (const slug of slugDirs) {
    const slugPath = join(submissionsDir, slug);
    let s;
    try {
      s = statSync(slugPath);
    } catch {
      continue;
    }
    if (!s.isDirectory()) continue;

    let sliceDirs: string[];
    try {
      sliceDirs = readdirSync(slugPath);
    } catch {
      continue;
    }

    const bySlice = new Map<SliceId, LoadedSubmission[]>();

    for (const sliceDirName of sliceDirs) {
      const slicePath = join(slugPath, sliceDirName);
      let ss;
      try {
        ss = statSync(slicePath);
      } catch {
        continue;
      }
      if (!ss.isDirectory()) continue;
      const isAllDir = sliceDirName === ALL_SUBMISSIONS_DIR;
      const sliceId = sliceDirName as SliceId;
      if (!isAllDir && sliceId !== "discovery" && !RISK_SLICES.has(sliceId)) continue;

      let files: string[];
      try {
        files = readdirSync(slicePath);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const path = join(slicePath, file);
        let raw: RawSubmission | RawSubmission[];
        try {
          raw = JSON.parse(readFileSync(path, "utf8")) as RawSubmission | RawSubmission[];
        } catch (err) {
          console.warn(`[registry] invalid submission ${path}: ${(err as Error).message}`);
          continue;
        }
        const items = Array.isArray(raw) ? raw : [raw];
        for (let index = 0; index < items.length; index++) {
          const r = items[index]!;
          if (!r || !r.model || !r.slice) continue;
          if (isAllDir && !RISK_SLICES.has(r.slice)) continue;
          if (!isAllDir && r.slice !== sliceId) continue;
          const arr = bySlice.get(r.slice) ?? [];
          arr.push({
            slug: r.slug,
            slice: r.slice,
            model: r.model,
            chat_url: typeof r.chat_url === "string" && r.chat_url.length > 0 ? r.chat_url : null,
            grade: r.grade,
            headline: r.headline ?? "",
            short_headline: r.short_headline,
            rationale: r.rationale ?? { findings: [], steelman: null, verdict: "" },
            evidence: r.evidence ?? [],
            unknowns: r.unknowns,
            analysis_date: r.analysis_date,
            protocol_metadata: r.protocol_metadata,
            source_path: Array.isArray(raw) ? `${path}#${index}` : path,
          });
          bySlice.set(r.slice, arr);
        }
      }
    }

    for (const arr of bySlice.values()) {
      // Sort newest analysis_date first so the "latest" is index 0.
      arr.sort((a, b) => (b.analysis_date ?? "").localeCompare(a.analysis_date ?? ""));
    }

    if (bySlice.size > 0) out.set(slug, bySlice);
  }

  return out;
}
