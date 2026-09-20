import { describe, expect, it } from "vitest";
import { ConfigError, loadCriticConfig } from "../../src/server/config.js";

describe("loadCriticConfig", () => {
  it("returns http-mode config when all three env vars are set", () => {
    const env = {
      CRITIC_BASE_URL: "https://example.test/v1",
      CRITIC_API_KEY: "secret",
      CRITIC_MODEL: "test-model",
    };
    expect(loadCriticConfig(env as NodeJS.ProcessEnv)).toEqual({
      mode: "http",
      baseUrl: "https://example.test/v1",
      apiKey: "secret",
      model: "test-model",
    });
  });

  it("throws ConfigError listing every missing http-mode var", () => {
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

  it("returns cli-mode config when CRITIC_CLI is claude, with a model", () => {
    const env = { CRITIC_CLI: "claude", CRITIC_MODEL: "claude-opus-5" };
    expect(loadCriticConfig(env as NodeJS.ProcessEnv)).toEqual({
      mode: "cli",
      cli: "claude",
      model: "claude-opus-5",
    });
  });

  it("returns cli-mode config when CRITIC_CLI is codex, with no model set", () => {
    const env = { CRITIC_CLI: "codex" };
    expect(loadCriticConfig(env as NodeJS.ProcessEnv)).toEqual({
      mode: "cli",
      cli: "codex",
    });
  });

  it("throws ConfigError when CRITIC_CLI is set to an unknown value", () => {
    const env = { CRITIC_CLI: "gemini" };
    expect(() => loadCriticConfig(env as NodeJS.ProcessEnv)).toThrow(ConfigError);
  });

  it("falls through to http-mode validation when CRITIC_CLI is an empty string", () => {
    const env = {
      CRITIC_CLI: "",
      CRITIC_BASE_URL: "https://example.test/v1",
      CRITIC_API_KEY: "secret",
      CRITIC_MODEL: "test-model",
    };
    expect(loadCriticConfig(env as NodeJS.ProcessEnv)).toEqual({
      mode: "http",
      baseUrl: "https://example.test/v1",
      apiKey: "secret",
      model: "test-model",
    });
  });

  it("ignores CRITIC_BASE_URL/CRITIC_API_KEY when CRITIC_CLI is set", () => {
    const env = { CRITIC_CLI: "claude", CRITIC_BASE_URL: "should-be-ignored" };
    const config = loadCriticConfig(env as NodeJS.ProcessEnv);
    expect(config).not.toHaveProperty("baseUrl");
  });
});
