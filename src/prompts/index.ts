import { CODE_CATEGORIES, CODE_SYSTEM_PROMPT } from "./code.js";
import { DOCS_CATEGORIES, DOCS_SYSTEM_PROMPT } from "./docs.js";

export interface ModePrompt {
  systemPrompt: string;
  categories: readonly string[];
}

export function getPromptForMode(mode: "code" | "docs"): ModePrompt {
  if (mode === "code") {
    return { systemPrompt: CODE_SYSTEM_PROMPT, categories: CODE_CATEGORIES };
  }
  return { systemPrompt: DOCS_SYSTEM_PROMPT, categories: DOCS_CATEGORIES };
}
