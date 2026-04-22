import { describe, expect, it } from "vitest";
import { OverlaySchema } from "./overlay-schema";

describe("OverlaySchema", () => {
  it("accepts an empty overlay", () => {
    expect(OverlaySchema.safeParse({}).success).toBe(true);
  });

  it("accepts partial overlays", () => {
    expect(OverlaySchema.safeParse({ website: "https://example.com" }).success).toBe(true);
  });

  it("accepts null as an explicit 'no value' sentinel", () => {
    expect(OverlaySchema.safeParse({ website: null, github: null, twitter: null }).success).toBe(true);
  });

  it("rejects unknown keys (strict)", () => {
    const r = OverlaySchema.safeParse({ bogus: "field" });
    expect(r.success).toBe(false);
  });

  it("rejects wrong-typed values", () => {
    expect(OverlaySchema.safeParse({ audit_count: "2" }).success).toBe(false);
    expect(OverlaySchema.safeParse({ chains: "Ethereum" }).success).toBe(false);
    expect(OverlaySchema.safeParse({ audit_count: -1 }).success).toBe(false);
  });

  it("accepts hallmarks as [number, string] tuples", () => {
    expect(OverlaySchema.safeParse({ hallmarks: [[1700000000, "Launch"]] }).success).toBe(true);
    expect(OverlaySchema.safeParse({ hallmarks: [["bad", "x"]] }).success).toBe(false);
  });
});
