import type { Issue } from "../core/types.js";
import type { CriticResponse } from "./types.js";

const SEVERITIES: readonly string[] = ["minor", "major", "critical"];

function isValidIssue(value: unknown): value is Issue {
  if (typeof value !== "object" || value === null) return false;
  const issue = value as Record<string, unknown>;
  if (typeof issue.category !== "string" || issue.category.trim() === "") return false;
  if (typeof issue.severity !== "string" || !SEVERITIES.includes(issue.severity)) return false;
  if (typeof issue.description !== "string" || issue.description.trim() === "") return false;
  if (issue.location !== undefined && typeof issue.location !== "string") return false;
  return true;
}

function normalizeIssue(issue: Issue): Issue {
  return {
    category: issue.category,
    severity: issue.severity,
    description: issue.description,
    ...(issue.location !== undefined ? { location: issue.location } : {}),
  };
}

export function validateResponse(parsed: unknown): CriticResponse | null {
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { issues?: unknown }).issues) &&
    typeof (parsed as { summary?: unknown }).summary === "string" &&
    (parsed as { issues: unknown[] }).issues.every(isValidIssue)
  ) {
    const obj = parsed as { issues: Issue[]; summary: string };
    return {
      issues: obj.issues.map(normalizeIssue),
      summary: obj.summary,
    };
  }
  return null;
}

export function parseResponse(raw: string): CriticResponse | null {
  try {
    return validateResponse(JSON.parse(raw));
  } catch {
    return null;
  }
}

const ERROR_SNIPPET_LENGTH = 200;

export function snippet(content: string): string {
  if (content === "") return "(empty)";
  return content.length > ERROR_SNIPPET_LENGTH
    ? `${content.slice(0, ERROR_SNIPPET_LENGTH)}...`
    : content;
}
