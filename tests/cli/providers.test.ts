import { describe, expect, it } from "vitest";
import { PROVIDERS } from "../../src/cli/providers.js";

describe("PROVIDERS", () => {
  it("includes a custom entry with no base URL and no curated models", () => {
    const custom = PROVIDERS.find((p) => p.id === "custom");
    expect(custom).toBeDefined();
    expect(custom?.baseUrl).toBeNull();
    expect(custom?.models).toEqual([]);
  });

  it("gives every non-custom preset a non-empty https(s) base URL", () => {
    for (const provider of PROVIDERS) {
      if (provider.id === "custom") continue;
      expect(provider.baseUrl).toMatch(/^https?:\/\/.+/);
    }
  });

  it("gives every non-custom preset at least one curated model", () => {
    for (const provider of PROVIDERS) {
      if (provider.id === "custom") continue;
      expect(provider.models.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate provider ids", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
