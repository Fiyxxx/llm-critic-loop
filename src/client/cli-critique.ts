import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultRunCliCommand, type RunCliCommand } from "./cli-run.js";
import { runClaudeCli } from "./cli-adapters/claude.js";
import { runCodexCli } from "./cli-adapters/codex.js";
import { snippet } from "./parse-response.js";
import { CriticError } from "./types.js";
import type { CriticRequest, CriticResponse } from "./types.js";

export interface CliCriticConfig {
  mode: "cli";
  cli: "claude" | "codex";
  model?: string;
}

const CLI_TIMEOUT_MS = 120_000;

export async function cliCritique(
  config: CliCriticConfig,
  request: CriticRequest,
  runCommand: RunCliCommand = defaultRunCliCommand,
): Promise<CriticResponse> {
  const scratchDir = mkdtempSync(join(tmpdir(), "llm-critic-loop-"));
  const adapter = config.cli === "claude" ? runClaudeCli : runCodexCli;

  try {
    let lastRaw = "";
    for (const strict of [false, true]) {
      const outcome = adapter(
        request,
        config.model,
        strict,
        scratchDir,
        CLI_TIMEOUT_MS,
        runCommand,
      );

      if (outcome.notFound) {
        throw new CriticError(
          `Critic request failed: "${config.cli}" was not found on PATH. Install it and make sure you're logged in, or switch back to an API key.`,
        );
      }
      if (outcome.exitError) {
        throw new CriticError(`Critic request failed: ${outcome.exitError}`);
      }

      lastRaw = outcome.raw;
      if (outcome.parsed) return outcome.parsed;
    }

    throw new CriticError(
      `Critic returned non-conforming output after retry. Last response content: ${snippet(lastRaw)}`,
    );
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}
