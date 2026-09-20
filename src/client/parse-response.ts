import type { Confidence, Issue } from "../core/types.js";
import type { CriticResponse } from "./types.js";

const SEVERITIES: readonly string[] = ["minor", "major", "critical"];
const CONFIDENCES: readonly string[] = ["low", "medium", "high"];

/**
 * Every issue element must be fully shaped before we hand it to `core` —
 * downstream dedup calls `.toLowerCase()` on `description`, so an element
 * missing that field would throw a raw TypeError outside the handler's
 * catch and destroy the returned history blob.
 *
 * `confidence` is deliberately not checked here at all — missing OR garbled,
 * either way normalizeIssue defaults it to "medium". Rejecting the whole
 * issue over one field the model may mishandle would silently hide a real
 * finding, which is worse than a wrong default.
 */
function isValidIssue(value: unknown): value is Issue {
  if (typeof value !== "object" || value === null) return false;
  const issue = value as Record<string, unknown>;
  if (typeof issue.category !== "string" || issue.category.trim() === "") return false;
  if (typeof issue.severity !== "string" || !SEVERITIES.includes(issue.severity)) return false;
  if (typeof issue.description !== "string" || issue.description.trim() === "") return false;
  if (issue.location !== undefined && typeof issue.location !== "string") return false;
  if (issue.suggestion !== undefined && typeof issue.suggestion !== "string") return false;
  return true;
}

/**
 * Rebuild the issue from only the fields we declare, dropping anything extra
 * the critic invented. The tool's MCP outputSchema is generated with
 * `additionalProperties: false`, and MCP clients validate structuredContent
 * against it strictly — so passing a stray field straight through from model
 * output would fail the call on the client side.
 */
function normalizeIssue(issue: Issue): Issue {
  const rawConfidence = (issue as { confidence?: unknown }).confidence;
  const confidence: Confidence = CONFIDENCES.includes(rawConfidence as string)
    ? (rawConfidence as Confidence)
    : "medium";

  return {
    category: issue.category,
    severity: issue.severity,
    confidence,
    description: issue.description,
    ...(issue.location !== undefined ? { location: issue.location } : {}),
    ...(issue.suggestion !== undefined ? { suggestion: issue.suggestion } : {}),
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
