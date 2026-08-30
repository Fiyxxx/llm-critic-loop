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
});
