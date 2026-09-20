import type { Issue } from "../core/types.js";

export interface CriticRequest {
  systemPrompt: string;
  artifact: string;
  context?: string;
}

export interface CriticResponse {
  issues: Issue[];
  summary: string;
}

export class CriticError extends Error {}
