import {
  CriticClientConfig,
  CriticError,
  CriticRequest,
  CriticResponse,
  critique as defaultCritique,
} from "../client/critic-client.js";
import { decodeHistory, encodeHistory } from "../core/history.js";
import { evaluateConvergence } from "../core/convergence.js";
import {
  DEFAULT_CONVERGENCE_CONFIG,
  type ConvergenceConfig,
  type Issue,
  type Verdict,
} from "../core/types.js";
import { getPromptForMode } from "../prompts/index.js";
import type { AdversarialCritiqueInput } from "./tool-schema.js";

export interface HandlerDeps {
  criticConfig: CriticClientConfig;
  criticFn?: (config: CriticClientConfig, request: CriticRequest) => Promise<CriticResponse>;
}

/**
 * Declared as a type alias rather than an interface on purpose: the SDK's
 * CallToolResult carries an `[x: string]: unknown` index signature, and only
 * type aliases get TypeScript's implicit index signature. As an interface this
 * would need an `as unknown as CallToolResult` cast at the registerTool call —
 * which would then hide any real drift from the declared outputSchema.
 */
export type ToolResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent: {
    verdict: Verdict;
    issues: Issue[];
    summary: string;
    round: number;
    done: boolean;
    history: string;
  };
};

export async function handleAdversarialCritique(
  input: AdversarialCritiqueInput,
  deps: HandlerDeps
): Promise<ToolResult> {
  const criticFn = deps.criticFn ?? defaultCritique;
  const round = input.round ?? 1;
  const history = decodeHistory(input.history);
  const { systemPrompt } = getPromptForMode(input.mode);
  const config: ConvergenceConfig = {
    maxRounds: input.config?.maxRounds ?? DEFAULT_CONVERGENCE_CONFIG.maxRounds,
    staleThreshold: input.config?.staleThreshold ?? DEFAULT_CONVERGENCE_CONFIG.staleThreshold,
  };

  let response: CriticResponse;
  try {
    response = await criticFn(deps.criticConfig, {
      systemPrompt,
      artifact: input.artifact,
      context: input.context,
    });
  } catch (error) {
    const message = error instanceof CriticError ? error.message : String(error);
    return {
      isError: true,
      content: [{ type: "text", text: `Critic call failed: ${message}` }],
      structuredContent: {
        verdict: "error",
        issues: [],
        summary: message,
        round,
        done: false,
        history: input.history ?? encodeHistory({ round: 0, issueDigests: [] }),
      },
    };
  }

  const { verdict, done } = evaluateConvergence(response.issues, round, history, config);
  const newHistory = encodeHistory({
    round,
    issueDigests: [...history.issueDigests, ...response.issues.map((i) => i.description)],
  });

  return {
    content: [{ type: "text", text: response.summary }],
    structuredContent: {
      verdict,
      issues: response.issues,
      summary: response.summary,
      round,
      done,
      history: newHistory,
    },
  };
}
