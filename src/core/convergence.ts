import { isDuplicate } from "./dedup.js";
import type { ConvergenceConfig, ConvergenceResult, HistoryState, Issue } from "./types.js";

/**
 * Rule order is fixed and intentional — see spec's Convergence rules section:
 * 1. no issues -> approved
 * 2. all minor, round >= 2 -> accept as-is
 * 3. every issue is a near-duplicate of one already in history -> stale
 * 4. round hit the cap -> cap_reached
 * 5. otherwise -> keep going
 */
export function evaluateConvergence(
  issues: Issue[],
  round: number,
  history: HistoryState,
  config: ConvergenceConfig
): ConvergenceResult {
  if (issues.length === 0) {
    return { verdict: "approved", done: true };
  }

  const allMinor = issues.every((issue) => issue.severity === "minor");
  if (allMinor && round >= 2) {
    return { verdict: "issues_found", done: true };
  }

  const allStale = issues.every((issue) =>
    isDuplicate(issue.description, history.issueDigests, config.staleThreshold)
  );
  if (allStale) {
    return { verdict: "stale", done: true };
  }

  if (round >= config.maxRounds) {
    return { verdict: "cap_reached", done: true };
  }

  return { verdict: "issues_found", done: false };
}
