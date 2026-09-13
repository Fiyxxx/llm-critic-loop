import { describe, expect, it } from "vitest";
import { nodeSupportsInit } from "../../src/cli/init.js";

describe("nodeSupportsInit", () => {
  it("rejects Node 18, which @clack/prompts cannot run on", () => {
    expect(nodeSupportsInit("18.20.8")).toBe(false);
  });

  it("rejects Node 20 versions older than 20.12", () => {
    expect(nodeSupportsInit("20.11.0")).toBe(false);
  });

  it("accepts exactly 20.12.0", () => {
    expect(nodeSupportsInit("20.12.0")).toBe(true);
  });

  it("accepts newer Node 20 patch releases", () => {
    expect(nodeSupportsInit("20.19.0")).toBe(true);
  });

  it("accepts Node 22 and newer major versions", () => {
    expect(nodeSupportsInit("22.14.0")).toBe(true);
    expect(nodeSupportsInit("24.10.0")).toBe(true);
  });
});
