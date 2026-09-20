import type { CriticConfig } from "../core/types.js";

export type CriticEnvConfig = CriticConfig;

export class ConfigError extends Error {}

const KNOWN_CLIS = ["claude", "codex"] as const;
type KnownCli = (typeof KNOWN_CLIS)[number];

function isKnownCli(value: string): value is KnownCli {
  return (KNOWN_CLIS as readonly string[]).includes(value);
}

export function loadCriticConfig(env: NodeJS.ProcessEnv = process.env): CriticEnvConfig {
  const cli = env.CRITIC_CLI;
  if (cli) {
    if (!isKnownCli(cli)) {
      throw new ConfigError(`CRITIC_CLI must be one of: ${KNOWN_CLIS.join(", ")} (got "${cli}")`);
    }
    return {
      mode: "cli",
      cli,
      ...(env.CRITIC_MODEL ? { model: env.CRITIC_MODEL } : {}),
    };
  }

  const baseUrl = env.CRITIC_BASE_URL;
  const apiKey = env.CRITIC_API_KEY;
  const model = env.CRITIC_MODEL;

  const missing: string[] = [];
  if (!baseUrl) missing.push("CRITIC_BASE_URL");
  if (!apiKey) missing.push("CRITIC_API_KEY");
  if (!model) missing.push("CRITIC_MODEL");

  if (missing.length > 0) {
    throw new ConfigError(`Missing required environment variable(s): ${missing.join(", ")}`);
  }

  return {
    mode: "http",
    baseUrl: baseUrl as string,
    apiKey: apiKey as string,
    model: model as string,
  };
}
