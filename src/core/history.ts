import type { HistoryState } from "./types.js";

const EMPTY_HISTORY: HistoryState = { round: 0, issueDigests: [] };

export function encodeHistory(state: HistoryState): string {
  return Buffer.from(JSON.stringify(state), "utf-8").toString("base64");
}

export function decodeHistory(blob: string | undefined): HistoryState {
  if (!blob) return { ...EMPTY_HISTORY };
  try {
    const parsed = JSON.parse(Buffer.from(blob, "base64").toString("utf-8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.round === "number" &&
      Array.isArray(parsed.issueDigests)
    ) {
      return parsed as HistoryState;
    }
  } catch {
    // fall through to default below
  }
  return { ...EMPTY_HISTORY };
}
