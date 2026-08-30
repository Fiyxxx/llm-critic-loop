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

  it("rejects a response whose issue elements are missing required fields", async () => {
    const body = JSON.stringify({
      issues: [{ issue: "missing null check", level: "high" }],
      summary: "found something",
    });
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(body));

    await expect(critique(config, request, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      CriticError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects a response whose issue severity is not a valid severity value", async () => {
    const body = JSON.stringify({
      issues: [{ category: "bug", severity: "high", description: "off by one" }],
      summary: "found something",
    });
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(body));

    await expect(critique(config, request, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      CriticError
    );
  });

  it("rejects a response whose issue location is present but not a string", async () => {
    const body = JSON.stringify({
      issues: [
        { category: "bug", severity: "minor", description: "off by one", location: { line: 3 } },
      ],
      summary: "found something",
    });
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(body));

    await expect(critique(config, request, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      CriticError
    );
  });

  it("includes a snippet of the last malformed content in the final error message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse("<html>gateway error</html>"));

    await expect(critique(config, request, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /<html>gateway error<\/html>/
    );
  });

  it("truncates a very long malformed content snippet in the error message", async () => {
    const long = "x".repeat(5000);
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(long));

    await expect(
      critique(config, request, fetchImpl as unknown as typeof fetch)
    ).rejects.toThrow(/x{200}\.\.\.$/);
  });

  it("throws CriticError immediately on an HTTP failure, without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse("", false, 500));

    await expect(critique(config, request, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      CriticError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws CriticError immediately when fetchImpl itself rejects (network/timeout), without retrying", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network timeout"));

    await expect(critique(config, request, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      CriticError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("passes an abort signal on the request so a hanging endpoint times out", async () => {
    const body = JSON.stringify({ issues: [], summary: "Looks good." });
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(body));

    await critique(config, request, fetchImpl as unknown as typeof fetch);

    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it("throws CriticError when the request aborts on timeout, without retrying", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

    await expect(critique(config, request, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      CriticError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws CriticError immediately when the response body is not valid JSON, without retrying", async () => {
    const badJsonResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        throw new SyntaxError("Unexpected token in JSON");
      },
    } as unknown as Response;
    const fetchImpl = vi.fn().mockResolvedValue(badJsonResponse);

    await expect(critique(config, request, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      CriticError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
