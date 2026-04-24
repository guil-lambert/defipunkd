import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SubmissionSchema } from "./schema";

const here = dirname(fileURLToPath(import.meta.url));
const jsonSchemaPath = join(here, "..", "..", "..", "data", "schema", "slice-assessment.v2.json");
const jsonSchema = JSON.parse(readFileSync(jsonSchemaPath, "utf8"));

const VALID: unknown = {
  schema_version: 2,
  slug: "lido",
  slice: "ability-to-exit",
  snapshot_generated_at: "2026-04-22T22:09:47.359Z",
  prompt_version: 5,
  analysis_date: "2026-04-23",
  model: "claude-sonnet-4-6",
  chat_url: null,
  grade: "orange",
  headline: "Claims exempt from pause; new requests pausable 14d or indefinitely via DAO",
  rationale: {
    findings: [
      { code: "E1", text: "Request: requestWithdrawals; Claim: claimWithdrawals, claimWithdrawal." },
      { code: "E2", text: "Request functions guarded by _checkResumed(); claim functions have no pause guard." },
    ],
    steelman: {
      red: "Indefinite pause exists and traps unfinalized requests.",
      orange: "GateSeal capped at 14d and claims-of-finalized are never blocked.",
      green: "Claims are always open on-chain.",
    },
    verdict: "Choosing orange because GateSeal exceeds the 7-day green threshold but claims stay open.",
  },
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
    const bad = { ...(VALID as object), grade: "unknown", evidence: [], unknowns: [], rationale: { findings: [], steelman: null, verdict: "not enough info" } };
    expect(SubmissionSchema.safeParse(bad).success).toBe(false);
    const ok = { ...(VALID as object), grade: "unknown", evidence: [], unknowns: ["E1: x"], rationale: { findings: [], steelman: null, verdict: "not enough info" } };
    expect(SubmissionSchema.safeParse(ok).success).toBe(true);
  });

  it("enforces grade!=unknown ⇒ rationale.steelman required", () => {
    const bad = { ...(VALID as object), rationale: { findings: [], steelman: null, verdict: "x" } };
    expect(SubmissionSchema.safeParse(bad).success).toBe(false);
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

  it("accepts schema_version 3 with protocol_metadata populated", () => {
    const v3 = {
      ...(VALID as object),
      schema_version: 3,
      protocol_metadata: {
        github: ["https://github.com/lidofinance/lido-dao"],
        docs_url: "https://docs.lido.fi",
        audits: [{ firm: "Trail of Bits", url: "https://report.example/tob.pdf", date: "2023-10" }],
        governance_forum: "https://research.lido.fi",
        voting_token: { chain: "Ethereum", address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32", symbol: "LDO" },
        bug_bounty_url: "https://immunefi.com/bounty/lido",
        security_contact: "security@lido.fi",
        deployed_contracts_doc: "https://docs.lido.fi/deployed-contracts",
        admin_addresses: [
          { chain: "Ethereum", address: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c", role: "Aragon Agent", actor_class: "governance" },
        ],
        upgradeability: "upgradeable",
      },
    };
    const result = SubmissionSchema.safeParse(v3);
    expect(result.success).toBe(true);
  });

  it("rejects protocol_metadata with invalid actor_class", () => {
    const bad = {
      ...(VALID as object),
      schema_version: 3,
      protocol_metadata: {
        admin_addresses: [{ chain: "Ethereum", address: "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c", role: "x", actor_class: "dao" }],
      },
    };
    expect(SubmissionSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid schema_version (only 2 or 3 allowed)", () => {
    const bad = { ...(VALID as object), schema_version: 1 };
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
      "autonomy",
      "access",
      "verifiability",
    ]);
    expect(jsonSchema.properties.grade.enum).toEqual(["green", "orange", "red", "unknown"]);
  });
});
