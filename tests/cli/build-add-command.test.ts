import { describe, expect, it } from "vitest";
import { buildAddCommand } from "../../src/cli/init.js";

describe("buildAddCommand", () => {
  it("builds the full claude mcp add argv for http auth in the documented order", () => {
    const args = buildAddCommand({
      authMode: "http",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-5.6-terra",
      scope: "local",
    });

    expect(args).toEqual([
      "mcp",
      "add",
      "critic",
      "-e",
      "CRITIC_BASE_URL=https://api.openai.com/v1",
      "-e",
      "CRITIC_API_KEY=sk-test",
      "-e",
      "CRITIC_MODEL=gpt-5.6-terra",
      "-s",
      "local",
      "--",
      "npx",
      "-y",
      "llm-critic-loop",
    ]);
  });

  it("passes through the user scope instead of local when requested", () => {
    const args = buildAddCommand({
      authMode: "http",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-5.6-terra",
      scope: "user",
    });

    expect(args).toContain("-s");
    expect(args[args.indexOf("-s") + 1]).toBe("user");
  });

  it("builds CRITIC_CLI argv for cli auth, with a model", () => {
    const args = buildAddCommand({
      authMode: "cli",
      cli: "claude",
      model: "claude-opus-5",
      scope: "local",
    });

    expect(args).toEqual([
      "mcp",
      "add",
      "critic",
      "-e",
      "CRITIC_CLI=claude",
      "-e",
      "CRITIC_MODEL=claude-opus-5",
      "-s",
      "local",
      "--",
      "npx",
      "-y",
      "llm-critic-loop",
    ]);
  });

  it("omits CRITIC_MODEL for cli auth when no model is given", () => {
    const args = buildAddCommand({ authMode: "cli", cli: "codex", scope: "user" });

    expect(args).not.toContain("CRITIC_MODEL");
    expect(args).toContain("CRITIC_CLI=codex");
  });
});
