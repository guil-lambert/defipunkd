const MARKDOWN_URL = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/;

export type CleanupResult = {
  cleaned: unknown;
  changes: string[];
  errors: string[];
};

export function cleanupSubmission(raw: unknown): CleanupResult {
  const changes: string[] = [];
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { cleaned: raw, changes, errors: ["input is not an object"] };
  }

  const cloned = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;

  // strip trailing whitespace in all string values
  walkStrings(cloned, (value, path) => {
    const trimmed = value.replace(/\s+$/gm, "").replace(/\r\n/g, "\n");
    if (trimmed !== value) {
      changes.push(`normalized whitespace at ${path}`);
      return trimmed;
    }
    return value;
  });

  // Models routinely emit `null` for optional protocol_metadata fields the
  // schema declares as optional-but-not-nullable (arrays like `github`,
  // `audits`, `admin_addresses`; nested fields like `audits[].date`). Every
  // nullable schema field is also `.optional()`, so dropping null entries
  // anywhere inside protocol_metadata is always safe and handles nested
  // cases without enumerating each field.
  const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
  const COMMIT_RE = /^[0-9a-fA-F]{7,40}$/;
  const FETCHED_AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  const AUDIT_DATE_RE = /^\d{4}(-\d{2}){0,2}$/;
  const ACTOR_CLASSES = new Set(["eoa", "multisig", "timelock", "governance", "unknown"]);

  if (cloned.protocol_metadata && typeof cloned.protocol_metadata === "object") {
    stripNulls(cloned.protocol_metadata, "protocol_metadata", changes);
    const meta = cloned.protocol_metadata as Record<string, unknown>;

    // audits: smaller models routinely emit entries with missing/non-URL urls
    // (placeholders like "(GitBook reference)") or non-conforming date strings
    // ("unknown", "2021-Q2", bare year that's fine, "2024" works). Drop entries
    // without a usable url; drop the date field if it doesn't match the schema
    // pattern. url is required; date is optional, so this preserves the entry.
    const audits = meta.audits;
    if (Array.isArray(audits)) {
      const kept = audits.filter((entry, i) => {
        if (!entry || typeof entry !== "object") return false;
        const row = entry as Record<string, unknown>;
        const url = row.url;
        if (typeof url !== "string") {
          changes.push(`dropped protocol_metadata.audits[${i}] (missing url)`);
          return false;
        }
        const norm = normalizeUrl(url);
        try {
          new URL(norm.value);
        } catch {
          changes.push(`dropped protocol_metadata.audits[${i}] (invalid url ${JSON.stringify(url)})`);
          return false;
        }
        if (norm.value !== url) {
          row.url = norm.value;
          changes.push(`normalized protocol_metadata.audits[${i}].url (${norm.reason})`);
        }
        const date = row.date;
        if (typeof date === "string" && !AUDIT_DATE_RE.test(date)) {
          delete row.date;
          changes.push(`dropped invalid protocol_metadata.audits[${i}].date (${JSON.stringify(date)})`);
        }
        return true;
      });
      if (kept.length !== audits.length) meta.audits = kept;
    }

    // voting_token: require a valid address; if missing/malformed, drop the
    // whole object (it's optional, partial entries fail validation).
    const vt = meta.voting_token;
    if (vt && typeof vt === "object") {
      const addr = (vt as Record<string, unknown>).address;
      if (typeof addr !== "string" || !ADDRESS_RE.test(addr)) {
        delete meta.voting_token;
        changes.push(`dropped protocol_metadata.voting_token (missing/invalid address)`);
      }
    }

    // admin_addresses: filter entries with invalid required fields. Map
    // out-of-enum actor_class values to "unknown" rather than dropping.
    const admins = meta.admin_addresses;
    if (Array.isArray(admins)) {
      const kept = admins.filter((entry, i) => {
        if (!entry || typeof entry !== "object") return false;
        const row = entry as Record<string, unknown>;
        const addr = row.address;
        if (typeof addr !== "string" || !ADDRESS_RE.test(addr)) {
          changes.push(`dropped protocol_metadata.admin_addresses[${i}] (invalid address ${JSON.stringify(addr)})`);
          return false;
        }
        if (typeof row.chain !== "string" || !row.chain) {
          changes.push(`dropped protocol_metadata.admin_addresses[${i}] (missing chain)`);
          return false;
        }
        if (typeof row.role !== "string" || !row.role) {
          changes.push(`dropped protocol_metadata.admin_addresses[${i}] (missing role)`);
          return false;
        }
        const ac = row.actor_class;
        if (typeof ac !== "string" || !ACTOR_CLASSES.has(ac)) {
          row.actor_class = "unknown";
          changes.push(`mapped protocol_metadata.admin_addresses[${i}].actor_class → "unknown" (was ${JSON.stringify(ac)})`);
        }
        return true;
      });
      if (kept.length !== admins.length) meta.admin_addresses = kept;
    }
  }

  const evidence = cloned.evidence;
  if (Array.isArray(evidence)) {
    // Strip nulls inside evidence entries too — chain/address/commit/fetched_at
    // are optional-but-not-nullable, and models routinely emit null for
    // "field doesn't apply to this evidence row".
    stripNulls(evidence, "evidence", changes);
    evidence.forEach((entry, i) => {
      if (!entry || typeof entry !== "object") return;
      const row = entry as Record<string, unknown>;
      const url = row.url;
      if (typeof url !== "string") return;
      const cleaned = normalizeUrl(url);
      if (cleaned.value !== url) {
        row.url = cleaned.value;
        changes.push(`normalized evidence[${i}].url (${cleaned.reason})`);
      }
      const match = (row.url as string).match(MARKDOWN_URL);
      if (match) {
        const inner = match[1]!.trim();
        const outer = match[2]!.trim();
        if (inner === outer) {
          row.url = outer;
          changes.push(`stripped markdown wrapper from evidence[${i}].url`);
        } else {
          errors.push(
            `evidence[${i}].url: labeled markdown link detected ("${inner}" ≠ "${outer}"). URLs must be bare strings.`,
          );
        }
      }
      // Optional formatted fields: drop if the model emitted an invalid
      // value rather than failing the whole submission.
      const addr = row.address;
      if (typeof addr === "string" && !ADDRESS_RE.test(addr)) {
        delete row.address;
        changes.push(`dropped invalid evidence[${i}].address (${JSON.stringify(addr)})`);
      }
      const commit = row.commit;
      if (typeof commit === "string" && !COMMIT_RE.test(commit)) {
        delete row.commit;
        changes.push(`dropped invalid evidence[${i}].commit (${JSON.stringify(commit)})`);
      }
      const fetchedAt = row.fetched_at;
      if (typeof fetchedAt === "string" && !FETCHED_AT_RE.test(fetchedAt)) {
        delete row.fetched_at;
        changes.push(`dropped invalid evidence[${i}].fetched_at (${JSON.stringify(fetchedAt)})`);
      }
    });
  }

  // grade="unknown" requires unknowns[] ≥ 1. If the model claimed unknown
  // but emitted an empty unknowns[], insert a sentinel so the file passes
  // schema validation and the failure mode is recorded in-band rather than
  // silently dropped.
  if (cloned.grade === "unknown") {
    const unk = cloned.unknowns;
    if (!Array.isArray(unk) || unk.length === 0) {
      cloned.unknowns = ["X-cleanup: model emitted grade=\"unknown\" with empty unknowns[] — see verdict for details"];
      changes.push(`inserted sentinel unknowns[] entry (grade=unknown but unknowns[] was empty)`);
    }
  }

  return { cleaned: cloned, changes, errors };
}

function stripNulls(obj: unknown, path: string, changes: string[]): void {
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      if (item !== null && typeof item === "object") {
        stripNulls(item, `${path}[${i}]`, changes);
      }
    });
    return;
  }
  if (obj && typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      const val = rec[key];
      if (val === null) {
        delete rec[key];
        changes.push(`stripped null at ${path}.${key}`);
      } else if (typeof val === "object") {
        stripNulls(val, `${path}.${key}`, changes);
      }
    }
  }
}

function normalizeUrl(raw: string): { value: string; reason: string } {
  let v = raw.trim();
  const reasons: string[] = [];

  if (v.startsWith("<") && v.endsWith(">")) {
    v = v.slice(1, -1).trim();
    reasons.push("stripped angle brackets");
  }

  const quoted = /^(['"`])(.*)\1$/.exec(v);
  if (quoted) {
    v = quoted[2]!.trim();
    reasons.push("stripped surrounding quotes");
  }

  const trailing = v.match(/[.,;:!?)\]]+$/);
  if (trailing) {
    const stripped = v.slice(0, v.length - trailing[0].length);
    try {
      new URL(stripped);
      v = stripped;
      reasons.push("stripped trailing punctuation");
    } catch {
      // keep original if stripping doesn't yield a valid URL
    }
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v) && /^[a-z0-9.-]+\.[a-z]{2,}/i.test(v)) {
    v = `https://${v}`;
    reasons.push("added https:// scheme");
  }

  return { value: v, reason: reasons.join(", ") || "no change" };
}

function walkStrings(
  obj: unknown,
  visit: (value: string, path: string) => string,
  path = "",
): void {
  if (obj === null || obj === undefined) return;
  if (typeof obj === "string") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      const childPath = `${path}[${i}]`;
      if (typeof item === "string") {
        obj[i] = visit(item, childPath);
      } else if (typeof item === "object" && item !== null) {
        walkStrings(item, visit, childPath);
      }
    });
    return;
  }
  if (typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      const childPath = path ? `${path}.${key}` : key;
      const val = rec[key];
      if (typeof val === "string") {
        rec[key] = visit(val, childPath);
      } else if (val !== null && typeof val === "object") {
        walkStrings(val, visit, childPath);
      }
    }
  }
}
