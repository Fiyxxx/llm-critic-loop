import { describe, expect, it } from "vitest";
import { CriticInputSchema } from "../../src/server/tool-schema.js";

describe("CriticInputSchema", () => {
  it("accepts a minimal valid input and defaults round to 1", () => {
    const result = CriticInputSchema.parse({
      artifact: "const x = 1;",
      mode: "code",
    });
    expect(result.round).toBe(1);
  });

  it("rejects an empty artifact", () => {
    expect(() => CriticInputSchema.parse({ artifact: "", mode: "code" })).toThrow();
  });

  it("rejects an invalid mode", () => {
    expect(() => CriticInputSchema.parse({ artifact: "text", mode: "spreadsheet" })).toThrow();
  });

  it("accepts the full shape with history and config overrides", () => {
    const result = CriticInputSchema.parse({
      artifact: "text",
      mode: "docs",
      context: "a README",
      round: 2,
      history: "opaque-blob",
      config: { maxRounds: 5, staleThreshold: 0.9 },
    });
    expect(result.config?.maxRounds).toBe(5);
  });
});
