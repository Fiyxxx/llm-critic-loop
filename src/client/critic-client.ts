import { buildUserContent, withStrictJsonInstruction } from "./prompt-shaping.js";
import { parseResponse, snippet } from "./parse-response.js";
import { CriticError } from "./types.js";
import type { CriticRequest, CriticResponse } from "./types.js";
import type { CriticConfig } from "../core/types.js";
import { cliCritique } from "./cli-critique.js";
import { defaultRunCliCommand, type RunCliCommand } from "./cli-run.js";

export { CriticError } from "./types.js";
export type { CriticRequest, CriticResponse } from "./types.js";

export type CriticClientConfig = CriticConfig;

type FetchLike = typeof fetch;

/**
 * CRITIC_BASE_URL is arbitrary user config, so a hanging endpoint is a real
 * failure mode. Without this, the request rides the HTTP stack's multi-minute
 * default instead of the tool's own error handling. Deliberately hardcoded —
 * the spec's BYOC config surface is exactly the three CRITIC_* vars.
 */
const REQUEST_TIMEOUT_MS = 60_000;

function buildMessages(request: CriticRequest, strict: boolean) {
  const systemPrompt = withStrictJsonInstruction(request.systemPrompt, strict);
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: buildUserContent(request) },
  ];
}

async function httpCritique(
  config: { baseUrl: string; apiKey: string; model: string },
  request: CriticRequest,
  fetchImpl: FetchLike = fetch,
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
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    `Critic returned non-conforming output after retry. Last response content: ${snippet(lastContent)}`,
  );
}

export async function critique(
  config: CriticClientConfig,
  request: CriticRequest,
  fetchImpl: FetchLike = fetch,
  runCliCommand: RunCliCommand = defaultRunCliCommand,
): Promise<CriticResponse> {
  if (config.mode === "cli") {
    return cliCritique(config, request, runCliCommand);
  }
  return httpCritique(config, request, fetchImpl);
}
