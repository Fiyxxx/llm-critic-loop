import type { Issue } from "../core/types.js";

export interface CriticClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface CriticRequest {
  systemPrompt: string;
  artifact: string;
  context?: string;
}

export interface CriticResponse {
  issues: Issue[];
  summary: string;
}

export class CriticError extends Error {}

type FetchLike = typeof fetch;

function buildMessages(request: CriticRequest, strict: boolean) {
  const systemPrompt = strict
    ? `${request.systemPrompt}\n\nRespond with ONLY valid JSON matching this shape, no prose, no markdown fences: {"issues":[{"category":string,"severity":"minor"|"major"|"critical","description":string,"location"?:string}],"summary":string}`
    : request.systemPrompt;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: request.context
        ? `Context:\n${request.context}\n\nArtifact:\n${request.artifact}`
        : `Artifact:\n${request.artifact}`,
    },
  ];
}

const SEVERITIES: readonly string[] = ["minor", "major", "critical"];

/**
 * Every issue element must be fully shaped before we hand it to `core` —
 * downstream dedup calls `.toLowerCase()` on `description`, so an element
 * missing that field would throw a raw TypeError outside the handler's
 * catch and destroy the returned history blob.
 */
function isValidIssue(value: unknown): value is Issue {
  if (typeof value !== "object" || value === null) return false;
  const issue = value as Record<string, unknown>;
  if (typeof issue.category !== "string" || issue.category.trim() === "") return false;
  if (typeof issue.severity !== "string" || !SEVERITIES.includes(issue.severity)) return false;
  if (typeof issue.description !== "string" || issue.description.trim() === "") return false;
  if (issue.location !== undefined && typeof issue.location !== "string") return false;
  return true;
}

function parseResponse(raw: string): CriticResponse | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.issues) &&
      typeof parsed.summary === "string" &&
      parsed.issues.every(isValidIssue)
    ) {
      return parsed as CriticResponse;
    }
  } catch {
    // fall through
  }
  return null;
}

const ERROR_SNIPPET_LENGTH = 200;

function snippet(content: string): string {
  if (content === "") return "(empty)";
  return content.length > ERROR_SNIPPET_LENGTH
    ? `${content.slice(0, ERROR_SNIPPET_LENGTH)}...`
    : content;
}

export async function critique(
  config: CriticClientConfig,
  request: CriticRequest,
  fetchImpl: FetchLike = fetch
): Promise<CriticResponse> {
  let lastContent = "";

  for (const strict of [false, true]) {
    let res: Response;
    try {
      res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: buildMessages(request, strict),
          response_format: { type: "json_object" },
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CriticError(`Critic request failed: ${message}`);
    }

    if (!res.ok) {
      throw new CriticError(`Critic request failed: ${res.status} ${res.statusText}`);
    }

    let body: { choices: Array<{ message: { content: string } }> };
    try {
      body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    } catch {
      throw new CriticError("Critic response body was not valid JSON");
    }

    const content = body.choices?.[0]?.message?.content ?? "";
    lastContent = content;
    const parsed = parseResponse(content);
    if (parsed) return parsed;
  }

  throw new CriticError(
    `Critic returned non-conforming output after retry. Last response content: ${snippet(lastContent)}`
  );
}
