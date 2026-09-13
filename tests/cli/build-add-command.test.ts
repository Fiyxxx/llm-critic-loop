import { describe, expect, it } from "vitest";
import { buildAddCommand } from "../../src/cli/init.js";

describe("buildAddCommand", () => {
  it("builds the full claude mcp add argv in the documented order", () => {
    const args = buildAddCommand({
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
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-5.6-terra",
      scope: "user",
    });

    expect(args).toContain("-s");
    expect(args[args.indexOf("-s") + 1]).toBe("user");
  });
});
