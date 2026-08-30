import { z } from "zod";

export const AdversarialCritiqueInputSchema = z.object({
  artifact: z.string().min(1).describe("The code or docs content to critique"),
  mode: z
    .enum(["code", "docs"])
    .describe("Whether the artifact is source code or documentation/prose"),
  context: z
    .string()
    .optional()
    .describe("What the artifact is for or its requirements, to focus the critique"),
  round: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(1)
    .describe("Which round of critique this is, starting at 1"),
  history: z
    .string()
    .optional()
    .describe("Opaque history blob returned from the previous call; omit on round 1"),
  config: z
    .object({
      maxRounds: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Maximum rounds before forcing a stop, default 10"),
      staleThreshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Word-overlap fraction above which an issue counts as a repeat, default 0.8"),
    })
    .optional()
    .describe("Convergence tuning overrides"),
});

export type AdversarialCritiqueInput = z.infer<typeof AdversarialCritiqueInputSchema>;
