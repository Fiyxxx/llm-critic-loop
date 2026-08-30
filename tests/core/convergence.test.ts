import { describe, expect, it } from "vitest";
import { evaluateConvergence } from "../../src/core/convergence.js";
import type { HistoryState, Issue } from "../../src/core/types.js";

const config = { maxRounds: 10, staleThreshold: 0.8 };
const emptyHistory: HistoryState = { round: 0, issueDigests: [] };

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    category: "bug",
    severity: "major",
    description: "off by one error in the loop bound",
    ...overrides,
  };
}

describe("evaluateConvergence", () => {
  it("approves when there are zero issues", () => {
    expect(evaluateConvergence([], 1, emptyHistory, config)).toEqual({
      verdict: "approved",
      done: true,
    });
  });

  it("does not accept minor-only issues on round 1", () => {
    const result = evaluateConvergence([issue({ severity: "minor" })], 1, emptyHistory, config);
    expect(result).toEqual({ verdict: "issues_found", done: false });
  });

  it("accepts minor-only issues from round 2 onward", () => {
    const result = evaluateConvergence([issue({ severity: "minor" })], 2, emptyHistory, config);
    expect(result).toEqual({ verdict: "issues_found", done: true });
  });

  it("does not accept a mix of minor and major issues from round 2 onward", () => {
    // Rule 2's allMinor guard is the highest-consequence branch in the machine:
    // a regression here would silently auto-accept a real bug as "just minor".
    const issues = [
      issue({ severity: "minor", description: "inconsistent naming on the helper" }),
      issue({ severity: "major", description: "off by one error in the loop bound" }),
    ];
    const result = evaluateConvergence(issues, 2, emptyHistory, config);
    expect(result).toEqual({ verdict: "issues_found", done: false });
  });

  it("marks stale when every issue duplicates history", () => {
    const history: HistoryState = { round: 2, issueDigests: ["off by one error in the loop bound"] };
    const result = evaluateConvergence([issue()], 3, history, config);
    expect(result).toEqual({ verdict: "stale", done: true });
  });

  it("does not mark stale when at least one issue is genuinely new", () => {
    const history: HistoryState = { round: 2, issueDigests: ["off by one error in the loop bound"] };
    const issues = [issue(), issue({ description: "race condition on the shared counter" })];
    const result = evaluateConvergence(issues, 3, history, config);
    expect(result).toEqual({ verdict: "issues_found", done: false });
  });

  it("caps at maxRounds with real unresolved issues", () => {
    const result = evaluateConvergence([issue()], 10, emptyHistory, config);
    expect(result).toEqual({ verdict: "cap_reached", done: true });
  });

  it("returns issues_found/not done for a normal in-progress round", () => {
    const result = evaluateConvergence([issue()], 1, emptyHistory, config);
    expect(result).toEqual({ verdict: "issues_found", done: false });
  });
});
