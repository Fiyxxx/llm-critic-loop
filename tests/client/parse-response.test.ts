import { describe, expect, it } from "vitest";
import { parseResponse, snippet, validateResponse } from "../../src/client/parse-response.js";

describe("validateResponse", () => {
  it("returns null for a non-object", () => {
    expect(validateResponse("not an object")).toBeNull();
  });

  it("returns null when an issue is missing required fields", () => {
    expect(validateResponse({ issues: [{ issue: "x" }], summary: "s" })).toBeNull();
  });

  it("strips unknown fields from a valid issue", () => {
    const result = validateResponse({
      issues: [{ category: "bug", severity: "major", description: "d", extra: true }],
      summary: "s",
    });
    expect(result?.issues[0]).toEqual({
      category: "bug",
      severity: "major",
      confidence: "medium",
      description: "d",
    });
  });

  it("defaults confidence to medium when the critic omits it", () => {
    const result = validateResponse({
      issues: [{ category: "bug", severity: "major", description: "d" }],
      summary: "s",
    });
    expect(result?.issues[0].confidence).toBe("medium");
  });

  it("defaults confidence to medium when the critic sends an invalid value", () => {
    const result = validateResponse({
      issues: [{ category: "bug", severity: "major", description: "d", confidence: "sure" }],
      summary: "s",
    });
    expect(result?.issues[0].confidence).toBe("medium");
  });

  it("preserves a valid confidence value", () => {
    const result = validateResponse({
      issues: [{ category: "bug", severity: "major", description: "d", confidence: "low" }],
      summary: "s",
    });
    expect(result?.issues[0].confidence).toBe("low");
  });

  it("preserves an issue's optional suggestion field", () => {
    const result = validateResponse({
      issues: [
        { category: "bug", severity: "major", description: "d", suggestion: "use <= instead" },
      ],
      summary: "s",
    });
    expect(result?.issues[0].suggestion).toBe("use <= instead");
  });

  it("rejects a response whose suggestion is present but not a string", () => {
    const result = validateResponse({
      issues: [{ category: "bug", severity: "major", description: "d", suggestion: 42 }],
      summary: "s",
    });
    expect(result).toBeNull();
  });

  it("rejects a response whose suggestion is an empty string", () => {
    const result = validateResponse({
      issues: [{ category: "bug", severity: "major", description: "d", suggestion: "  " }],
      summary: "s",
    });
    expect(result).toBeNull();
  });
});

describe("parseResponse", () => {
  it("returns null on invalid JSON", () => {
    expect(parseResponse("not json")).toBeNull();
  });

  it("parses valid JSON matching the shape", () => {
    const result = parseResponse(JSON.stringify({ issues: [], summary: "ok" }));
    expect(result).toEqual({ issues: [], summary: "ok" });
  });
});

describe("snippet", () => {
  it("returns '(empty)' for an empty string", () => {
    expect(snippet("")).toBe("(empty)");
  });

  it("truncates content over 200 chars with a trailing ellipsis", () => {
    expect(snippet("x".repeat(5000))).toMatch(/^x{200}\.\.\.$/);
  });

  it("returns short content unchanged", () => {
    expect(snippet("short")).toBe("short");
  });
});
