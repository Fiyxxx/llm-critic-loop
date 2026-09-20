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
    expect(result?.issues[0]).toEqual({ category: "bug", severity: "major", description: "d" });
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
