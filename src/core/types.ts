export type Severity = "minor" | "major" | "critical";

export type Confidence = "low" | "medium" | "high";

export interface Issue {
  category: string;
  severity: Severity;
  confidence: Confidence;
  description: string;
  suggestion?: string;
  location?: string;
}

export type Verdict = "approved" | "issues_found" | "stale" | "cap_reached" | "error";

export interface ConvergenceConfig {
  maxRounds: number;
  staleThreshold: number;
}

export const DEFAULT_CONVERGENCE_CONFIG: ConvergenceConfig = {
  maxRounds: 10,
  staleThreshold: 0.8,
};

export interface HistoryState {
  round: number;
  issueDigests: string[];
}

export interface ConvergenceResult {
  verdict: Verdict;
  done: boolean;
}

export type CriticConfig =
  | { mode: "http"; baseUrl: string; apiKey: string; model: string }
  | { mode: "cli"; cli: "claude" | "codex"; model?: string };
