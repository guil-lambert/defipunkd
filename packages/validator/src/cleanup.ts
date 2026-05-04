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
  if (cloned.protocol_metadata && typeof cloned.protocol_metadata === "object") {
    stripNulls(cloned.protocol_metadata, "protocol_metadata", changes);
  }

  const evidence = cloned.evidence;
  if (Array.isArray(evidence)) {
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
      // Optional fields with strict format constraints: drop the field if
      // the model emitted an invalid value (branch name in `commit`,
      // freeform string in `fetched_at`, etc.) rather than failing the whole
      // submission. The schema marks these optional, so dropping is safe.
      const commit = row.commit;
      if (typeof commit === "string" && !/^[0-9a-f]{7,40}$/.test(commit)) {
        delete row.commit;
        changes.push(`dropped invalid evidence[${i}].commit (${JSON.stringify(commit)})`);
      }
      const fetchedAt = row.fetched_at;
      if (typeof fetchedAt === "string" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(fetchedAt)) {
        delete row.fetched_at;
        changes.push(`dropped invalid evidence[${i}].fetched_at (${JSON.stringify(fetchedAt)})`);
      }
    });
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
