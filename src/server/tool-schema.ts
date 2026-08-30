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

/**
 * Mirrors ToolResult["structuredContent"] exactly. The MCP SDK runtime-validates
 * a successful tool result against this once it is declared, so the two must stay
 * in lockstep — a drift here fails every real call, not just malformed ones.
 */
export const AdversarialCritiqueOutputSchema = z.object({
  verdict: z
    .enum(["approved", "issues_found", "stale", "cap_reached", "error"])
    .describe("Convergence verdict for this round"),
  issues: z
    .array(
      z.object({
        category: z.string().describe("Taxonomy category for the issue, e.g. bug or clarity"),
        severity: z.enum(["minor", "major", "critical"]).describe("How serious the issue is"),
        description: z.string().describe("What is wrong and why it matters"),
        location: z
          .string()
          .optional()
          .describe("Where in the artifact the issue is, if the critic identified it"),
      })
    )
    .describe("Issues the critic found this round"),
  summary: z.string().describe("Human-readable summary of the critique"),
  round: z.number().describe("Which round this result is for"),
  done: z.boolean().describe("True when the calling agent should stop looping"),
  history: z.string().describe("Opaque history blob to pass back unmodified on the next call"),
});
