import { z } from "zod";

export const OverlaySchema = z
  .object({
    name: z.string().nullable(),
    category: z.string().nullable(),
    chains: z.array(z.string()).nullable(),
    tvl: z.number().nullable(),
    tvl_by_chain: z.record(z.string(), z.number()).nullable(),
    website: z.string().nullable(),
    twitter: z.string().nullable(),
    github: z.array(z.string()).nullable(),
    audit_count: z.number().int().nonnegative().nullable(),
    audit_links: z.array(z.string()).nullable(),
    hallmarks: z.array(z.tuple([z.number(), z.string()])).nullable(),
    parent_slug: z.string().nullable(),
    forked_from: z.array(z.number()).nullable(),
    is_dead: z.boolean().nullable(),
    bug_bounty_url: z.string().nullable(),
  })
  .partial()
  .strict();

export type Overlay = z.infer<typeof OverlaySchema>;
