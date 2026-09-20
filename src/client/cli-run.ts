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
