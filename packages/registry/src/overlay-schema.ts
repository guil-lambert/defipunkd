import { z } from "zod";

export const OverlaySchema = z
  .object({
    name: z.string(),
    category: z.string().nullable(),
    chains: z.array(z.string()),
    tvl: z.number().nullable(),
    tvl_by_chain: z.record(z.string(), z.number()),
    website: z.string().nullable(),
    twitter: z.string().nullable(),
    github: z.array(z.string()).nullable(),
    audit_count: z.number().int().nonnegative(),
    audit_links: z.array(z.string()),
    hallmarks: z.array(z.tuple([z.number(), z.string()])),
    parent_slug: z.string().nullable(),
    is_dead: z.boolean(),
  })
  .partial()
  .strict();

export type Overlay = z.infer<typeof OverlaySchema>;
