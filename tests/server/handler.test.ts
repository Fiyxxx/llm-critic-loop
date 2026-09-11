import { describe, expect, it, vi } from "vitest";
import { handleAdversarialCritique } from "../../src/server/handler.js";
import { CriticError, critique } from "../../src/client/critic-client.js";
import { decodeHistory, encodeHistory } from "../../src/core/history.js";
import {
  AdversarialCritiqueOutputSchema,
  type AdversarialCritiqueInput,
} from "../../src/server/tool-schema.js";

const criticConfig = { baseUrl: "https://example.test/v1", apiKey: "key", model: "test-model" };

function input(overrides: Partial<AdversarialCritiqueInput> = {}): AdversarialCritiqueInput {
  return { artifact: "const x = 1;", mode: "code", round: 1, ...overrides };
}

describe("handleAdversarialCritique", () => {
  it("returns approved with done:true when the critic finds no issues", async () => {
    const criticFn = vi.fn().mockResolvedValue({ issues: [], summary: "Looks good." });

    const result = await handleAdversarialCritique(input(), { criticConfig, criticFn });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.verdict).toBe("approved");
    expect(result.structuredContent.done).toBe(true);
    expect(result.content[0].text).toBe("Looks good.");
  });

  it("returns issues_found with done:false on a normal in-progress round", async () => {
    const criticFn = vi.fn().mockResolvedValue({
      issues: [{ category: "bug", severity: "major", description: "off by one" }],
      summary: "One bug found.",
    });

    const result = await handleAdversarialCritique(input({ round: 1 }), { criticConfig, criticFn });

    expect(result.structuredContent.verdict).toBe("issues_found");
    expect(result.structuredContent.done).toBe(false);
    expect(typeof result.structuredContent.history).toBe("string");
  });

  it("returns isError:true with verdict 'error' when the critic call fails", async () => {
    const criticFn = vi.fn().mockRejectedValue(new CriticError("boom"));

    const result = await handleAdversarialCritique(input(), { criticConfig, criticFn });

    expect(result.isError).toBe(true);
    expect(result.structuredContent.verdict).toBe("error");
  });

  it("returns structuredContent that satisfies the declared MCP outputSchema", async () => {
    // The SDK runtime-validates successful results against the declared
    // outputSchema, so any drift between ToolResult and the schema breaks
    // every real call. Catch that here rather than in production.
    const criticFn = vi.fn().mockResolvedValue({
      issues: [
        {
          category: "error-handling",
          severity: "major",
          description: "no null check on the parsed value",
          location: "line 3",
        },
      ],
      summary: "One major issue found.",
    });

    const result = await handleAdversarialCritique(input(), { criticConfig, criticFn });

    expect(() => AdversarialCritiqueOutputSchema.parse(result.structuredContent)).not.toThrow();
  });

  it("resolves to verdict 'error' with an intact history blob when the critic returns malformed issue elements", async () => {
    // End-to-end through the real client: a critic that returns issue objects
    // with none of the required fields must never escape as a raw TypeError,
    // because that would strip structuredContent (and the history blob the
    // calling agent needs to continue its loop) off the tool result entirely.
    const malformed = JSON.stringify({
      issues: [{ issue: "missing null check", level: "high" }],
      summary: "found something",
    });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ choices: [{ message: { content: malformed } }] }),
    } as unknown as Response);
    const criticFn = (config: typeof criticConfig, request: Parameters<typeof critique>[1]) =>
      critique(config, request, fetchImpl as unknown as typeof fetch);

    const result = await handleAdversarialCritique(input(), { criticConfig, criticFn });

    expect(result.isError).toBe(true);
    expect(result.structuredContent.verdict).toBe("error");
    expect(result.structuredContent.done).toBe(false);
    expect(typeof result.structuredContent.history).toBe("string");
    expect(result.structuredContent.history.length).toBeGreaterThan(0);
    // The returned blob must itself decode cleanly, so the next round works.
    expect(decodeHistory(result.structuredContent.history)).toEqual({
      round: 0,
      issueDigests: [],
    });
  });

  it("recovers from a poisoned history blob rather than throwing on the next round", async () => {
    const poisoned = Buffer.from(
      JSON.stringify({ round: 1, issueDigests: [null] }),
      "utf-8",
    ).toString("base64");
    const criticFn = vi.fn().mockResolvedValue({
      issues: [{ category: "bug", severity: "major", description: "a real issue" }],
      summary: "One bug found.",
    });

    const result = await handleAdversarialCritique(input({ round: 2, history: poisoned }), {
      criticConfig,
      criticFn,
    });

    expect(result.structuredContent.verdict).toBe("issues_found");
    expect(decodeHistory(result.structuredContent.history).issueDigests).toEqual(["a real issue"]);
  });

  it("carries prior history digests forward into the new history blob", async () => {
    const priorHistory = encodeHistory({ round: 1, issueDigests: ["earlier issue text"] });
    const criticFn = vi.fn().mockResolvedValue({
      issues: [{ category: "bug", severity: "major", description: "a brand new issue" }],
      summary: "Found one new issue.",
    });

    const result = await handleAdversarialCritique(input({ round: 2, history: priorHistory }), {
      criticConfig,
      criticFn,
    });

    expect(result.structuredContent.history).not.toBe(priorHistory);
    expect(result.structuredContent.verdict).toBe("issues_found");
  });
});
