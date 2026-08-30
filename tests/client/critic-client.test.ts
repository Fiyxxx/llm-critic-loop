import { describe, expect, it, vi } from "vitest";
import { CriticError, critique } from "../../src/client/critic-client.js";

const config = { baseUrl: "https://example.test/v1", apiKey: "key", model: "test-model" };
const request = { systemPrompt: "You are a critic.", artifact: "const x = 1", context: "a test file" };

function fakeResponse(content: string, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Server Error",
    json: async () => ({ choices: [{ message: { content } }] }),
  } as Response;
}

describe("critique", () => {
  it("returns parsed issues and summary on a well-formed response", async () => {
    const body = JSON.stringify({
      issues: [{ category: "bug", severity: "major", description: "off by one" }],
      summary: "One major bug found.",
    });
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(body));

    const result = await critique(config, request, fetchImpl as unknown as typeof fetch);

    expect(result.summary).toBe("One major bug found.");
    expect(result.issues).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries once with a stricter prompt when the first response is malformed, then succeeds", async () => {
    const goodBody = JSON.stringify({ issues: [], summary: "Looks good." });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse("not json at all"))
      .mockResolvedValueOnce(fakeResponse(goodBody));

    const result = await critique(config, request, fetchImpl as unknown as typeof fetch);

    expect(result.summary).toBe("Looks good.");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws CriticError when both attempts return malformed output", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse("still not json"));

    await expect(critique(config, request, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      CriticError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws CriticError immediately on an HTTP failure, without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse("", false, 500));

    await expect(critique(config, request, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      CriticError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
