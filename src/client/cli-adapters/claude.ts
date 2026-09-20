import { buildUserContent, withStrictJsonInstruction } from "../prompt-shaping.js";
import { parseResponse, validateResponse } from "../parse-response.js";
import { ISSUE_JSON_SCHEMA } from "./schema.js";
import type { RunCliCommand } from "../cli-run.js";
import type { CriticRequest } from "../types.js";

export interface CliAdapterOutcome {
  raw: string;
  parsed: import("../types.js").CriticResponse | null;
  notFound?: boolean;
  exitError?: string;
}

interface ClaudeResultEnvelope {
  structured_output?: unknown;
  result?: string;
}

export function runClaudeCli(
  request: CriticRequest,
  model: string | undefined,
  strict: boolean,
  cwd: string,
  timeoutMs: number,
  runCommand: RunCliCommand,
): CliAdapterOutcome {
  const args = [
    "-p",
    buildUserContent(request),
    "--system-prompt",
    withStrictJsonInstruction(request.systemPrompt, strict),
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(ISSUE_JSON_SCHEMA),
    "--allowedTools",
    "",
    "--strict-mcp-config",
  ];
  if (model) args.push("--model", model);

  const result = runCommand("claude", args, timeoutMs, cwd);

  if (result.error?.code === "ENOENT") {
    return { raw: "", parsed: null, notFound: true };
  }
  if (result.status !== 0) {
    return {
      raw: result.stdout,
      parsed: null,
      exitError: `claude exited ${result.status}: ${result.stderr || result.stdout}`,
    };
  }

  let envelope: ClaudeResultEnvelope;
  try {
    envelope = JSON.parse(result.stdout) as ClaudeResultEnvelope;
  } catch {
    return { raw: result.stdout, parsed: null };
  }

  if (envelope.structured_output !== undefined) {
    return { raw: result.stdout, parsed: validateResponse(envelope.structured_output) };
  }
  if (typeof envelope.result === "string") {
    return { raw: result.stdout, parsed: parseResponse(envelope.result) };
  }
  return { raw: result.stdout, parsed: null };
}
