import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildUserContent, withStrictJsonInstruction } from "../prompt-shaping.js";
import { parseResponse } from "../parse-response.js";
import { ISSUE_JSON_SCHEMA } from "./schema.js";
import { mapSpawnFailure } from "../cli-run.js";
import type { CliAdapterOutcome } from "./claude.js";
import type { RunCliCommand } from "../cli-run.js";
import type { CriticRequest } from "../types.js";

export function runCodexCli(
  request: CriticRequest,
  model: string | undefined,
  strict: boolean,
  cwd: string,
  timeoutMs: number,
  runCommand: RunCliCommand,
): CliAdapterOutcome {
  const schemaPath = join(cwd, "schema.json");
  const outputPath = join(cwd, "output.json");
  try {
    writeFileSync(schemaPath, JSON.stringify(ISSUE_JSON_SCHEMA));
  } catch (error) {
    return {
      raw: "",
      parsed: null,
      exitError: `failed to write codex schema file: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // A previous retry attempt may have left its own output.json in this same
  // scratch dir (cliCritique reuses one scratch dir across the non-strict and
  // strict attempts). Remove it before invoking codex so that if this attempt
  // exits 0 without writing a new file, the read below fails instead of
  // silently returning the prior attempt's stale content.
  rmSync(outputPath, { force: true });

  const prompt = [
    withStrictJsonInstruction(request.systemPrompt, strict),
    "",
    buildUserContent(request),
    "",
    "Answer directly. Do not use tools, run shell commands, or write files.",
  ].join("\n");

  const args = [
    "exec",
    prompt,
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "--output-schema",
    schemaPath,
    "-o",
    outputPath,
  ];
  if (model) args.push("--model", model);

  const result = runCommand("codex", args, timeoutMs, cwd);

  const failure = mapSpawnFailure("codex", result, timeoutMs);
  if (failure.notFound) {
    return { raw: "", parsed: null, notFound: true };
  }
  if (failure.exitError) {
    return { raw: result.stdout, parsed: null, exitError: failure.exitError };
  }

  let fileContents: string;
  try {
    fileContents = readFileSync(outputPath, "utf-8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const exitError =
      code === "ENOENT"
        ? "codex exited successfully but did not write an output file"
        : `codex exited successfully but the output file could not be read: ${
            error instanceof Error ? error.message : String(error)
          }`;
    return { raw: "", parsed: null, exitError };
  }

  return { raw: fileContents, parsed: parseResponse(fileContents) };
}
