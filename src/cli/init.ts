import { spawnSync } from "node:child_process";
import { PROVIDERS, type ProviderPreset } from "./providers.js";

export type Scope = "local" | "user";

/**
 * @clack/prompts itself requires Node >= 20.12 (it imports node:util's
 * styleText). The critic MCP server has no such requirement, so this is
 * checked lazily, only when the interactive wizard actually runs, rather
 * than raised as the whole package's engines floor.
 */
const MIN_NODE_MAJOR = 20;
const MIN_NODE_MINOR = 12;

export function nodeSupportsInit(nodeVersion: string): boolean {
  const [major, minor] = nodeVersion.split(".").map(Number);
  return major > MIN_NODE_MAJOR || (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR);
}

export const OTHER_MODEL_OPTION = "Other (type your own)";

export interface BuildAddCommandParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  scope: Scope;
}

export function buildAddCommand(params: BuildAddCommandParams): string[] {
  return [
    "mcp",
    "add",
    "critic",
    "-e",
    `CRITIC_BASE_URL=${params.baseUrl}`,
    "-e",
    `CRITIC_API_KEY=${params.apiKey}`,
    "-e",
    `CRITIC_MODEL=${params.model}`,
    "-s",
    params.scope,
    "--",
    "npx",
    "-y",
    "llm-critic-loop",
  ];
}

export interface Prompter {
  selectProvider(providers: ProviderPreset[]): Promise<ProviderPreset>;
  customBaseUrl(): Promise<string>;
  selectModel(models: string[]): Promise<string>;
  customModel(): Promise<string>;
  apiKey(): Promise<string>;
  scope(): Promise<Scope>;
}

export interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
}

export type RunCommand = (cmd: string, args: string[]) => CommandResult;

export interface InitDeps {
  prompter?: Prompter;
  runCommand?: RunCommand;
}

export interface InitResult {
  args: string[];
  ran: boolean;
  succeeded?: boolean;
  output?: string;
}

function defaultRunCommand(cmd: string, args: string[]): CommandResult {
  const result = spawnSync(cmd, args, { encoding: "utf-8" });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

export async function runInit(deps: InitDeps = {}): Promise<InitResult> {
  const prompter = deps.prompter ?? (await getDefaultPrompter());
  const runCommand = deps.runCommand ?? defaultRunCommand;

  const provider = await prompter.selectProvider(PROVIDERS);
  const baseUrl = provider.baseUrl ?? (await prompter.customBaseUrl());

  let model: string;
  if (provider.models.length === 0) {
    model = await prompter.customModel();
  } else {
    const choice = await prompter.selectModel([...provider.models, OTHER_MODEL_OPTION]);
    model = choice === OTHER_MODEL_OPTION ? await prompter.customModel() : choice;
  }

  const apiKey = await prompter.apiKey();
  const scope = await prompter.scope();
  const args = buildAddCommand({ baseUrl, apiKey, model, scope });

  const result = runCommand("claude", args);
  if (result.error?.code === "ENOENT") {
    return { args, ran: false };
  }

  return {
    args,
    ran: true,
    succeeded: result.status === 0,
    output: `${result.stdout}${result.stderr}`,
  };
}

export function formatInitResult(result: InitResult): string {
  const manualCommand = `claude ${result.args.join(" ")}`;

  if (!result.ran) {
    return [
      "Couldn't find the `claude` CLI on your PATH, so nothing was run automatically.",
      "Run this yourself to add the critic MCP server:",
      "",
      manualCommand,
    ].join("\n");
  }

  if (result.succeeded) {
    return [result.output ?? "", "", "critic added. Restart your MCP client to use it."].join("\n");
  }

  return [
    "`claude mcp add` did not succeed:",
    "",
    result.output ?? "",
    "",
    "You can try running it yourself:",
    "",
    manualCommand,
  ].join("\n");
}

async function getDefaultPrompter(): Promise<Prompter> {
  if (!nodeSupportsInit(process.versions.node)) {
    throw new Error(
      `llm-critic-loop init requires Node.js >= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.0 ` +
        `(you have ${process.versions.node}). The critic MCP server itself still runs on ` +
        "Node >= 18.17 -- see the README for manual setup instead.",
    );
  }

  const clack = await import("@clack/prompts");

  function unwrap<T>(value: T | symbol): T {
    if (clack.isCancel(value)) {
      clack.cancel("Setup cancelled.");
      process.exit(0);
    }
    return value as T;
  }

  return {
    async selectProvider(providers) {
      const id = unwrap(
        await clack.select({
          message: "Which provider should critique your code/docs?",
          options: providers.map((p) => ({ value: p.id, label: p.name })),
        }),
      );
      const provider = providers.find((p) => p.id === id);
      if (!provider) throw new Error(`Unknown provider id: ${String(id)}`);
      return provider;
    },
    async customBaseUrl() {
      return unwrap(
        await clack.text({
          message: "Base URL for the OpenAI-compatible chat completions endpoint",
          placeholder: "https://your-endpoint.example.com/v1",
          validate: (value) => ((value ?? "").trim() === "" ? "Base URL is required" : undefined),
        }),
      );
    },
    async selectModel(models) {
      return unwrap(
        await clack.select({
          message: "Which model?",
          options: models.map((model) => ({ value: model, label: model })),
        }),
      );
    },
    async customModel() {
      return unwrap(
        await clack.text({
          message: "Model id",
          validate: (value) => ((value ?? "").trim() === "" ? "Model id is required" : undefined),
        }),
      );
    },
    async apiKey() {
      return unwrap(
        await clack.password({
          message: "API key",
          validate: (value) => ((value ?? "").trim() === "" ? "API key is required" : undefined),
        }),
      );
    },
    async scope() {
      return unwrap(
        await clack.select({
          message: "Add critic for this project only, or for all your projects?",
          options: [
            { value: "local", label: "This project only" },
            { value: "user", label: "All my projects" },
          ],
        }),
      );
    },
  };
}
