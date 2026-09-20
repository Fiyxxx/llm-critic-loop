import { spawnSync } from "node:child_process";

export interface CliRunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
}

export type RunCliCommand = (
  cmd: string,
  args: string[],
  timeoutMs: number,
  cwd: string,
) => CliRunResult;

export const defaultRunCliCommand: RunCliCommand = (cmd, args, timeoutMs, cwd) => {
  const result = spawnSync(cmd, args, { encoding: "utf-8", timeout: timeoutMs, cwd });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
};

export interface SpawnFailure {
  notFound: boolean;
  exitError?: string;
}

/**
 * Classifies the outcome of a `RunCliCommand` call into a not-found /
 * exit-error / success verdict, so every CLI adapter reports spawn failures
 * (missing binary, timeout, or any other spawn errno) the same way instead
 * of each re-deriving its own ad-hoc checks.
 */
export function mapSpawnFailure(cli: string, result: CliRunResult, timeoutMs: number): SpawnFailure {
  if (result.error) {
    if (result.error.code === "ENOENT") {
      return { notFound: true };
    }
    if (result.error.code === "ETIMEDOUT") {
      return { notFound: false, exitError: `${cli} timed out after ${timeoutMs}ms` };
    }
    return { notFound: false, exitError: `${cli} failed to run: ${result.error.message}` };
  }
  if (result.status !== 0) {
    return { notFound: false, exitError: `${cli} exited ${result.status}: ${result.stderr || result.stdout}` };
  }
  return { notFound: false };
}
