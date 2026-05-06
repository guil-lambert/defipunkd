import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export type AssessmentGrade = "green" | "orange" | "red" | "unknown";
export type AssessmentStrength = "strong" | "weak";
export type SliceId = "discovery" | "control" | "ability-to-exit" | "autonomy" | "open-access" | "verifiability";

export type Finding = { code: string; text: string };
export type Steelman = { red: string; orange: string; green: string };
export type Rationale = {
  findings: Finding[];
  steelman: Steelman | null;
  verdict: string;
};

export type AuditEntry = { firm: string; url: string; date?: string };
export type VotingToken = { chain: string; address: string; symbol?: string };
export type AdminAddress = {
  chain: string;
  address: string;
  role: string;
  actor_class: "eoa" | "multisig" | "timelock" | "governance" | "unknown";
};
export type Upgradeability = "immutable" | "upgradeable" | "mixed" | "unknown";
export type ProtocolMetadata = {
  github?: string[];
  docs_url?: string | null;
  audits?: AuditEntry[];
  governance_forum?: string | null;
  voting_token?: VotingToken | null;
  bug_bounty_url?: string | null;
  security_contact?: string | null;
  deployed_contracts_doc?: string | null;
  admin_addresses?: AdminAddress[];
  upgradeability?: Upgradeability;
  about?: string | null;
};

export type HumanSignoff = {
  signed_at: string;
  signers?: string[];
};

export type LoadedAssessment = {
  slug: string;
  slice: SliceId;
  grade: AssessmentGrade;
  strength: AssessmentStrength;
  headline: string;
  short_headline?: string;
  rationale: Rationale;
  models: string[];
  models_with_chat_url: number;
  model_sources: Array<{ model: string; chat_url: string | null }>;
  consensus_sources: Array<{ model: string; chat_url: string | null; weight: number }>;
  merged_at?: string;
  human_signoff?: HumanSignoff | null;
  protocol_metadata?: ProtocolMetadata;
};

type RawAssessment = {
  schema_version: number;
  slug: string;
  slice: SliceId;
  consensus_grade: AssessmentGrade;
  consensus_strength: AssessmentStrength;
  short_headline?: string;
  merged_at?: string;
  human_signoff?: HumanSignoff | null;
  primary_submission_path: string;
  merged_from?: Array<{ model: string; chat_url?: string | null; weight?: number; path?: string }>;
  protocol_metadata?: ProtocolMetadata;
};

type RawSubmission = {
  headline: string;
  rationale: Rationale;
};

export function loadAssessments(dataDir: string): Map<string, Map<SliceId, LoadedAssessment>> {
  const out = new Map<string, Map<SliceId, LoadedAssessment>>();
  const assessmentsDir = join(dataDir, "assessments");
  if (!existsSync(assessmentsDir)) return out;

  let slugDirs: string[];
  try {
    slugDirs = readdirSync(assessmentsDir);
  } catch {
    return out;
  }

  const repoRoot = dataDir.replace(/\/data\/?$/, "");

  for (const slug of slugDirs) {
    const slugPath = join(assessmentsDir, slug);
    let s;
    try {
      s = statSync(slugPath);
    } catch {
      continue;
    }
    if (!s.isDirectory()) continue;

    let sliceFiles: string[];
    try {
      sliceFiles = readdirSync(slugPath);
    } catch {
      continue;
    }

    const bySlice = new Map<SliceId, LoadedAssessment>();

    for (const file of sliceFiles) {
      if (!file.endsWith(".json")) continue;
      const sliceId = file.slice(0, -5) as SliceId;
      const path = join(slugPath, file);

      let raw: RawAssessment;
      try {
        raw = JSON.parse(readFileSync(path, "utf8")) as RawAssessment;
      } catch (err) {
        console.warn(`[registry] invalid assessment ${path}: ${(err as Error).message}`);
        continue;
      }

      const candidatePaths: string[] = [raw.primary_submission_path];
      for (const m of raw.merged_from ?? []) {
        if (typeof m.path === "string" && m.path.length > 0 && !candidatePaths.includes(m.path)) {
          candidatePaths.push(m.path);
        }
      }

      let sub: RawSubmission | null = null;
      let resolvedFromFallback: string | null = null;
      for (const candidate of candidatePaths) {
        const hashIdx = candidate.lastIndexOf("#");
        const fileRelPath = hashIdx === -1 ? candidate : candidate.slice(0, hashIdx);
        const arrayIndex = hashIdx === -1 ? null : Number(candidate.slice(hashIdx + 1));
        const submissionPath = join(repoRoot, fileRelPath);
        try {
          const parsed = JSON.parse(readFileSync(submissionPath, "utf8")) as RawSubmission | RawSubmission[];
          if (arrayIndex !== null) {
            if (!Array.isArray(parsed) || !Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex >= parsed.length) {
              throw new Error(`array index ${arrayIndex} out of range`);
            }
            const indexed = parsed[arrayIndex];
            if (!indexed) throw new Error(`array index ${arrayIndex} resolved to undefined`);
            sub = indexed;
          } else if (Array.isArray(parsed)) {
            const first = parsed[0];
            if (!first) throw new Error(`submission file is empty array`);
            sub = first;
          } else {
            sub = parsed;
          }
          if (candidate !== raw.primary_submission_path) resolvedFromFallback = candidate;
          break;
        } catch {
          // try next candidate
        }
      }

      if (!sub) {
        console.warn(
          `[registry] assessment ${slug}/${sliceId} primary submission ${raw.primary_submission_path} and all merged_from fallbacks are missing — skipping`,
        );
        continue;
      }
      if (resolvedFromFallback) {
        console.warn(
          `[registry] assessment ${slug}/${sliceId} primary ${raw.primary_submission_path} missing; rendered headline from fallback ${resolvedFromFallback}`,
        );
      }

      const models = Array.from(
        new Set((raw.merged_from ?? []).map((m) => m.model).filter((m) => typeof m === "string" && m.length > 0)),
      );
      const modelsWithChatUrl = new Set<string>();
      const seenModels = new Set<string>();
      const modelSources: Array<{ model: string; chat_url: string | null }> = [];
      const consensusSources: Array<{ model: string; chat_url: string | null; weight: number }> = [];
      for (const m of raw.merged_from ?? []) {
        if (typeof m.model !== "string" || m.model.length === 0) continue;
        const url = typeof m.chat_url === "string" && m.chat_url.length > 0 ? m.chat_url : null;
        const weight = typeof m.weight === "number" && Number.isFinite(m.weight) ? m.weight : 1;
        consensusSources.push({ model: m.model, chat_url: url, weight });
        if (url) modelsWithChatUrl.add(m.model);
        if (!seenModels.has(m.model)) {
          seenModels.add(m.model);
          modelSources.push({ model: m.model, chat_url: url });
        } else if (url) {
          // Prefer first non-null chat_url for the same model.
          const existing = modelSources.find((ms) => ms.model === m.model);
          if (existing && !existing.chat_url) existing.chat_url = url;
        }
      }

      bySlice.set(sliceId, {
        slug: raw.slug,
        slice: raw.slice,
        grade: raw.consensus_grade,
        strength: raw.consensus_strength,
        headline: sub.headline,
        short_headline: raw.short_headline,
        rationale: sub.rationale,
        models,
        models_with_chat_url: modelsWithChatUrl.size,
        model_sources: modelSources,
        consensus_sources: consensusSources,
        merged_at: raw.merged_at,
        human_signoff: raw.human_signoff ?? null,
        protocol_metadata: raw.protocol_metadata,
      });
    }

    if (bySlice.size > 0) out.set(slug, bySlice);
  }

  return out;
}

/**
 * Aggregate per-slice protocol_metadata into one blob per slug.
 * Arrays are unioned; scalars pick the most-recent non-null value by merged_at.
 */
export function aggregateProtocolMetadata(
  bySlice: Map<SliceId, LoadedAssessment>,
): ProtocolMetadata | undefined {
  const entries = Array.from(bySlice.values())
    .filter((a) => a.protocol_metadata)
    .sort((a, b) => (b.merged_at ?? "").localeCompare(a.merged_at ?? ""));
  if (entries.length === 0) return undefined;

  const github = unionBy(entries, (m) => m.github ?? [], (s) => s.toLowerCase());
  const audits = unionBy(
    entries,
    (m) => m.audits ?? [],
    (a) => `${a.firm.toLowerCase()}|${a.url.toLowerCase()}`,
  );
  const admin_addresses = unionBy(
    entries,
    (m) => m.admin_addresses ?? [],
    (a) => `${a.chain.toLowerCase()}|${a.address.toLowerCase()}`,
  );

  const out: ProtocolMetadata = {};
  if (github.length > 0) out.github = github;
  if (audits.length > 0) out.audits = audits;
  if (admin_addresses.length > 0) out.admin_addresses = admin_addresses;

  const firstNonNull = <T,>(pick: (m: ProtocolMetadata) => T | null | undefined): T | null => {
    for (const e of entries) {
      const v = pick(e.protocol_metadata!);
      if (v !== null && v !== undefined) return v;
    }
    return null;
  };
  const docs_url = firstNonNull((m) => m.docs_url);
  if (docs_url !== null) out.docs_url = docs_url;
  const governance_forum = firstNonNull((m) => m.governance_forum);
  if (governance_forum !== null) out.governance_forum = governance_forum;
  const voting_token = firstNonNull((m) => m.voting_token);
  if (voting_token !== null) out.voting_token = voting_token;
  const bug_bounty_url = firstNonNull((m) => m.bug_bounty_url);
  if (bug_bounty_url !== null) out.bug_bounty_url = bug_bounty_url;
  const security_contact = firstNonNull((m) => m.security_contact);
  if (security_contact !== null) out.security_contact = security_contact;
  const deployed_contracts_doc = firstNonNull((m) => m.deployed_contracts_doc);
  if (deployed_contracts_doc !== null) out.deployed_contracts_doc = deployed_contracts_doc;
  const upgradeability = majorityVote(entries.map((e) => e.protocol_metadata!.upgradeability));
  if (upgradeability !== null) out.upgradeability = upgradeability;
  const about = firstNonNull((m) => m.about);
  if (about !== null) out.about = about;

  return Object.keys(out).length > 0 ? out : undefined;
}

// Pick the most-frequent non-null value. On a tie, prefer the value that
// appears earliest in the input (callers pass entries sorted recency-desc, so
// the freshest source wins ties). Returns null if there are no non-null votes.
function majorityVote<T>(values: Array<T | null | undefined>): T | null {
  const counts = new Map<T, { count: number; firstIdx: number }>();
  values.forEach((v, i) => {
    if (v === null || v === undefined) return;
    const existing = counts.get(v);
    if (existing) existing.count++;
    else counts.set(v, { count: 1, firstIdx: i });
  });
  if (counts.size === 0) return null;
  let winner: T | null = null;
  let bestCount = -1;
  let bestIdx = Infinity;
  for (const [val, { count, firstIdx }] of counts) {
    if (count > bestCount || (count === bestCount && firstIdx < bestIdx)) {
      winner = val;
      bestCount = count;
      bestIdx = firstIdx;
    }
  }
  return winner;
}

function unionBy<T>(
  entries: LoadedAssessment[],
  get: (m: ProtocolMetadata) => T[],
  keyOf: (x: T) => string,
): T[] {
  return unionByMeta(entries.map((e) => e.protocol_metadata!), get, keyOf);
}

function unionByMeta<T>(
  entries: ProtocolMetadata[],
  get: (m: ProtocolMetadata) => T[],
  keyOf: (x: T) => string,
): T[] {
  const seen = new Map<string, T>();
  for (const e of entries) {
    for (const item of get(e)) {
      const k = keyOf(item);
      if (!seen.has(k)) seen.set(k, item);
    }
  }
  return Array.from(seen.values());
}

/**
 * Same shape as aggregateProtocolMetadata, but sourced from raw submissions
 * that haven't reached quorum yet. Used as a fallback so a single discovery
 * run still surfaces github / audits / bug bounty / etc. on the protocol page.
 */
export function aggregateProtocolMetadataFromSubmissions(
  submissions: Array<{ protocol_metadata?: ProtocolMetadata; analysis_date?: string }>,
): ProtocolMetadata | undefined {
  const entries = submissions
    .filter((s): s is { protocol_metadata: ProtocolMetadata; analysis_date?: string } => !!s.protocol_metadata)
    .sort((a, b) => (b.analysis_date ?? "").localeCompare(a.analysis_date ?? ""))
    .map((s) => s.protocol_metadata);
  if (entries.length === 0) return undefined;

  const github = unionByMeta(entries, (m) => m.github ?? [], (s) => s.toLowerCase());
  const audits = unionByMeta(
    entries,
    (m) => m.audits ?? [],
    (a) => `${a.firm.toLowerCase()}|${a.url.toLowerCase()}`,
  );
  const admin_addresses = unionByMeta(
    entries,
    (m) => m.admin_addresses ?? [],
    (a) => `${a.chain.toLowerCase()}|${a.address.toLowerCase()}`,
  );

  const out: ProtocolMetadata = {};
  if (github.length > 0) out.github = github;
  if (audits.length > 0) out.audits = audits;
  if (admin_addresses.length > 0) out.admin_addresses = admin_addresses;

  const firstNonNull = <T,>(pick: (m: ProtocolMetadata) => T | null | undefined): T | null => {
    for (const e of entries) {
      const v = pick(e);
      if (v !== null && v !== undefined) return v;
    }
    return null;
  };
  const docs_url = firstNonNull((m) => m.docs_url);
  if (docs_url !== null) out.docs_url = docs_url;
  const governance_forum = firstNonNull((m) => m.governance_forum);
  if (governance_forum !== null) out.governance_forum = governance_forum;
  const voting_token = firstNonNull((m) => m.voting_token);
  if (voting_token !== null) out.voting_token = voting_token;
  const bug_bounty_url = firstNonNull((m) => m.bug_bounty_url);
  if (bug_bounty_url !== null) out.bug_bounty_url = bug_bounty_url;
  const security_contact = firstNonNull((m) => m.security_contact);
  if (security_contact !== null) out.security_contact = security_contact;
  const deployed_contracts_doc = firstNonNull((m) => m.deployed_contracts_doc);
  if (deployed_contracts_doc !== null) out.deployed_contracts_doc = deployed_contracts_doc;
  const upgradeability = majorityVote(entries.map((m) => m.upgradeability));
  if (upgradeability !== null) out.upgradeability = upgradeability;
  const about = firstNonNull((m) => m.about);
  if (about !== null) out.about = about;

  return Object.keys(out).length > 0 ? out : undefined;
}
