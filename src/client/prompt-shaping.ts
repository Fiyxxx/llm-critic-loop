import type { CriticRequest } from "./types.js";

export function buildUserContent(request: CriticRequest): string {
  return request.context
    ? `Context:\n${request.context}\n\nArtifact:\n${request.artifact}`
    : `Artifact:\n${request.artifact}`;
}

const STRICT_JSON_INSTRUCTION =
  '\n\nRespond with ONLY valid JSON matching this shape, no prose, no markdown fences: {"issues":[{"category":string,"severity":"minor"|"major"|"critical","confidence":"low"|"medium"|"high","description":string,"suggestion"?:string,"location"?:string}],"summary":string}';

export function withStrictJsonInstruction(systemPrompt: string, strict: boolean): string {
  return strict ? `${systemPrompt}${STRICT_JSON_INSTRUCTION}` : systemPrompt;
}
