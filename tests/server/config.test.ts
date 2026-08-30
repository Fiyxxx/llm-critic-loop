import { describe, expect, it } from "vitest";
import { ConfigError, loadCriticConfig } from "../../src/server/config.js";

describe("loadCriticConfig", () => {
  it("returns config when all three env vars are set", () => {
    const env = {
      CRITIC_BASE_URL: "https://example.test/v1",
      CRITIC_API_KEY: "secret",
      CRITIC_MODEL: "test-model",
    };
    expect(loadCriticConfig(env as NodeJS.ProcessEnv)).toEqual({
      baseUrl: "https://example.test/v1",
      apiKey: "secret",
      model: "test-model",
    });
  });

  it("throws ConfigError listing every missing var", () => {
    const env = { CRITIC_MODEL: "test-model" };
    expect(() => loadCriticConfig(env as NodeJS.ProcessEnv)).toThrow(ConfigError);
    try {
      loadCriticConfig(env as NodeJS.ProcessEnv);
    } catch (error) {
      expect((error as Error).message).toContain("CRITIC_BASE_URL");
      expect((error as Error).message).toContain("CRITIC_API_KEY");
      expect((error as Error).message).not.toContain("CRITIC_MODEL");
    }
  });
});
