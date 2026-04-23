import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SubmissionSchema } from "./schema";

const here = dirname(fileURLToPath(import.meta.url));
const jsonSchemaPath = join(here, "..", "..", "..", "data", "schema", "slice-assessment.v1.json");
const jsonSchema = JSON.parse(readFileSync(jsonSchemaPath, "utf8"));

const VALID: unknown = {
  schema_version: 1,
  slug: "lido",
  slice: "ability-to-exit",
  snapshot_generated_at: "2026-04-22T22:09:47.359Z",
  prompt_version: 4,
  analysis_date: "2026-04-23",
  model: "claude-sonnet-4-6",
  chat_url: null,
  grade: "orange",
  headline: "Claims exempt from pause; new requests pausable 14d or indefinitely via DAO",
  rationale: "Steel-man red: indefinite pause exists. Steel-man orange: 14d cap + claim exempt. Steel-man green: claims always open. Choosing orange.",
  evidence: [
    {
      url: "https://etherscan.io/address/0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1",
      shows: "Deployed WithdrawalQueueERC721 proxy on mainnet",
      chain: "ethereum",
      address: "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1",
    },
  ],
  unknowns: ["E3: PAUSE_ROLE holders not enumerated via getRoleMember"],
};

describe("SubmissionSchema", () => {
  it("accepts a well-formed submission", () => {
    const result = SubmissionSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it("rejects unknown fields (additionalProperties: false)", () => {
    const result = SubmissionSchema.safeParse({ ...(VALID as object), extra_field: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects branch-ref as commit SHA", () => {
    const bad = {
      ...(VALID as object),
      evidence: [{ url: "https://x.test", shows: "y", commit: "main" }],
    };
    expect(SubmissionSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts 7-char and 40-char lowercase hex SHAs", () => {
    const ok7 = {
      ...(VALID as object),
      evidence: [{ url: "https://x.test", shows: "y", commit: "9496e61" }],
    };
    const ok40 = {
      ...(VALID as object),
      evidence: [
        {
          url: "https://x.test",
          shows: "y",
          commit: "9496e6172ab495d4014224ac0041b1b723b501d7",
        },
      ],
    };
    expect(SubmissionSchema.safeParse(ok7).success).toBe(true);
    expect(SubmissionSchema.safeParse(ok40).success).toBe(true);
  });

  it("enforces grade=unknown ⇒ unknowns[] non-empty", () => {
    const bad = { ...(VALID as object), grade: "unknown", evidence: [], unknowns: [] };
    expect(SubmissionSchema.safeParse(bad).success).toBe(false);
    const ok = { ...(VALID as object), grade: "unknown", evidence: [], unknowns: ["E1: x"] };
    expect(SubmissionSchema.safeParse(ok).success).toBe(true);
  });

  it("enforces grade!=unknown ⇒ evidence[] non-empty", () => {
    const bad = { ...(VALID as object), grade: "orange", evidence: [] };
    expect(SubmissionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid addresses", () => {
    const bad = {
      ...(VALID as object),
      evidence: [{ url: "https://x.test", shows: "y", address: "0xNOTHEX" }],
    };
    expect(SubmissionSchema.safeParse(bad).success).toBe(false);
  });

  it("committed JSON Schema declares the same required fields", () => {
    expect(jsonSchema.required).toEqual(
      expect.arrayContaining([
        "schema_version",
        "slug",
        "slice",
        "snapshot_generated_at",
        "prompt_version",
        "analysis_date",
        "model",
        "grade",
        "headline",
        "rationale",
        "evidence",
        "unknowns",
      ]),
    );
    expect(jsonSchema.additionalProperties).toBe(false);
    expect(jsonSchema.properties.slice.enum).toEqual([
      "control",
      "ability-to-exit",
      "dependencies",
      "access",
      "verifiability",
    ]);
    expect(jsonSchema.properties.grade.enum).toEqual(["green", "orange", "red", "unknown"]);
  });
});
