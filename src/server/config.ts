export interface CriticEnvConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export class ConfigError extends Error {}

export function loadCriticConfig(env: NodeJS.ProcessEnv = process.env): CriticEnvConfig {
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

  return { baseUrl: baseUrl as string, apiKey: apiKey as string, model: model as string };
}
