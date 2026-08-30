import { describe, expect, it } from "vitest";
import { decodeHistory, encodeHistory } from "../../src/core/history.js";
import type { HistoryState } from "../../src/core/types.js";

describe("history codec", () => {
  it("round-trips a non-empty state", () => {
    const state: HistoryState = { round: 3, issueDigests: ["missing null check", "sql injection risk"] };
    const blob = encodeHistory(state);
    expect(decodeHistory(blob)).toEqual(state);
  });

  it("decodes undefined as empty history", () => {
    expect(decodeHistory(undefined)).toEqual({ round: 0, issueDigests: [] });
  });

  it("decodes garbage input as empty history without throwing", () => {
    expect(decodeHistory("not-valid-base64-json")).toEqual({ round: 0, issueDigests: [] });
  });

  it("falls back to empty history when issueDigests holds a non-string element", () => {
    const poisoned = Buffer.from(
      JSON.stringify({ round: 1, issueDigests: [null] }),
      "utf-8"
    ).toString("base64");
    expect(decodeHistory(poisoned)).toEqual({ round: 0, issueDigests: [] });
  });

  it("falls back to empty history when issueDigests mixes strings and non-strings", () => {
    const poisoned = Buffer.from(
      JSON.stringify({ round: 2, issueDigests: ["a real digest", 42] }),
      "utf-8"
    ).toString("base64");
    expect(decodeHistory(poisoned)).toEqual({ round: 0, issueDigests: [] });
  });
});
