import { isDuplicate } from "./dedup.js";
import type { ConvergenceConfig, ConvergenceResult, HistoryState, Issue } from "./types.js";

/**
 * `low`-confidence issues are informational only — they still surface in the
 * tool's output for the calling agent to see, but never block approval or
 * count toward staleness/cap. This is the deterministic filter recommended
 * over trusting a critic's own restraint: let it report uncertainty honestly,
 * then decide what counts here instead of in the prompt.
 */
export function countableIssues(issues: Issue[]): Issue[] {
  return issues.filter((issue) => issue.confidence !== "low");
}

/**
 * Rule order is fixed and intentional — see spec's Convergence rules section:
 * 1. no (countable) issues -> approved
 * 2. all minor, round >= 2 -> accept as-is
 * 3. every issue is a near-duplicate of one already in history -> stale
 * 4. round hit the cap -> cap_reached
 * 5. otherwise -> keep going
 */
export function evaluateConvergence(
  issues: Issue[],
  round: number,
  history: HistoryState,
  config: ConvergenceConfig,
): ConvergenceResult {
  const countable = countableIssues(issues);

  if (countable.length === 0) {
    return { verdict: "approved", done: true };
  }

  const allMinor = countable.every((issue) => issue.severity === "minor");
  if (allMinor && round >= 2) {
    return { verdict: "issues_found", done: true };
  }

  const allStale = countable.every((issue) =>
    isDuplicate(issue.description, history.issueDigests, config.staleThreshold),
  );
  if (allStale) {
    return { verdict: "stale", done: true };
  }

  if (round >= config.maxRounds) {
    return { verdict: "cap_reached", done: true };
  }

  return { verdict: "issues_found", done: false };
}
