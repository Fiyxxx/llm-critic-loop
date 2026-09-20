import { describe, expect, it } from "vitest";
import { CODE_CATEGORIES, CODE_SYSTEM_PROMPT } from "../../src/prompts/code.js";
import { DOCS_CATEGORIES, DOCS_SYSTEM_PROMPT } from "../../src/prompts/docs.js";
import { getPromptForMode } from "../../src/prompts/index.js";

describe("getPromptForMode", () => {
  it("returns the code prompt and categories for mode 'code'", () => {
    const result = getPromptForMode("code");
    expect(result.systemPrompt).toBe(CODE_SYSTEM_PROMPT);
    expect(result.categories).toEqual(CODE_CATEGORIES);
  });

  it("returns the docs prompt and categories for mode 'docs'", () => {
    const result = getPromptForMode("docs");
    expect(result.systemPrompt).toBe(DOCS_SYSTEM_PROMPT);
    expect(result.categories).toEqual(DOCS_CATEGORIES);
  });
});

describe("category taxonomy", () => {
  it("matches the spec's fixed code categories", () => {
    expect(CODE_CATEGORIES).toEqual([
      "bug",
      "security",
      "performance",
      "error-handling",
      "test-coverage",
      "architecture",
      "style",
    ]);
  });

  it("matches the spec's fixed docs categories", () => {
    expect(DOCS_CATEGORIES).toEqual([
      "factual-error",
      "clarity",
      "completeness",
      "consistency",
      "structure",
    ]);
  });
});
