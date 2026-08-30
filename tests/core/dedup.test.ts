import { describe, expect, it } from "vitest";
import { isDuplicate, wordOverlap } from "../../src/core/dedup.js";

describe("wordOverlap", () => {
  it("returns 1 for identical text", () => {
    expect(wordOverlap("missing null check on input", "missing null check on input")).toBe(1);
  });

  it("returns 0 for completely disjoint text", () => {
    expect(wordOverlap("missing null check", "typo in readme heading")).toBe(0);
  });

  it("returns a high fraction for reworded near-duplicates", () => {
    const a = "missing null check on the user supplied input value";
    const b = "missing null check on the user supplied input argument";
    expect(wordOverlap(a, b)).toBeGreaterThanOrEqual(0.8);
  });

  it("returns 0 when either string is empty", () => {
    expect(wordOverlap("", "some text")).toBe(0);
    expect(wordOverlap("some text", "")).toBe(0);
  });
});

describe("isDuplicate", () => {
  it("is true when overlap with any prior digest meets the threshold", () => {
    const priors = ["typo in heading", "missing null check on input"];
    expect(isDuplicate("missing null check on input", priors, 0.8)).toBe(true);
  });

  it("is false when no prior digest meets the threshold", () => {
    const priors = ["typo in heading"];
    expect(isDuplicate("missing null check on input", priors, 0.8)).toBe(false);
  });

  it("is false against an empty prior list", () => {
    expect(isDuplicate("missing null check on input", [], 0.8)).toBe(false);
  });
});
