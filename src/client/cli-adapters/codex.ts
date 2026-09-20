import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildUserContent, withStrictJsonInstruction } from "../prompt-shaping.js";
import { parseResponse } from "../parse-response.js";
import { ISSUE_JSON_SCHEMA } from "./schema.js";
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
  writeFileSync(schemaPath, JSON.stringify(ISSUE_JSON_SCHEMA));

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

  if (result.error?.code === "ENOENT") {
    return { raw: "", parsed: null, notFound: true };
  }
  if (result.status !== 0) {
    return {
      raw: result.stdout,
      parsed: null,
      exitError: `codex exited ${result.status}: ${result.stderr || result.stdout}`,
    };
  }

  let fileContents: string;
  try {
    fileContents = readFileSync(outputPath, "utf-8");
  } catch {
    return { raw: "", parsed: null, exitError: "codex exited successfully but did not write an output file" };
  }

  return { raw: fileContents, parsed: parseResponse(fileContents) };
}
