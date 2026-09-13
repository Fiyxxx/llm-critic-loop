import { describe, expect, it } from "vitest";
import { formatInitResult } from "../../src/cli/init.js";

describe("formatInitResult", () => {
  it("confirms success and tells the user to restart their MCP client", () => {
    const message = formatInitResult({
      args: ["mcp", "add", "critic"],
      ran: true,
      succeeded: true,
      output: "Added critic",
    });

    expect(message).toContain("Added critic");
    expect(message.toLowerCase()).toContain("restart");
  });

  it("surfaces claude's own error output and still offers the manual command on failure", () => {
    const message = formatInitResult({
      args: ["mcp", "add", "critic", "-s", "local"],
      ran: true,
      succeeded: false,
      output: "server already exists",
    });

    expect(message).toContain("server already exists");
    expect(message).toContain("claude mcp add critic -s local");
  });

  it("gives the manual command when the claude CLI isn't installed", () => {
    const message = formatInitResult({
      args: ["mcp", "add", "critic", "-s", "local"],
      ran: false,
    });

    expect(message.toLowerCase()).toContain("claude");
    expect(message).toContain("claude mcp add critic -s local");
  });
});
