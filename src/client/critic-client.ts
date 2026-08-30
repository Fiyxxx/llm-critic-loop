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

function parseResponse(raw: string): CriticResponse | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.issues) && typeof parsed.summary === "string") {
      return parsed as CriticResponse;
    }
  } catch {
    // fall through
  }
  return null;
}

export async function critique(
  config: CriticClientConfig,
  request: CriticRequest,
  fetchImpl: FetchLike = fetch
): Promise<CriticResponse> {
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
    const parsed = parseResponse(content);
    if (parsed) return parsed;
  }

  throw new CriticError("Critic returned non-conforming output after retry");
}
