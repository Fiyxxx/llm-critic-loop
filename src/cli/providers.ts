export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string | null;
  models: string[];
  cliAdapter?: "claude" | "codex";
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"],
    cliAdapter: "codex",
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude, via its OpenAI-compatible endpoint)",
    baseUrl: "https://api.anthropic.com/v1",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5-20251001"],
    cliAdapter: "claude",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-3.8-flash", "gemini-2.5-pro", "gemini-2.5-flash"],
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    models: ["grok-4.6", "grok-4.3"],
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    models: ["mistral-large-latest", "mistral-small-latest"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "local",
    name: "Local (Ollama, LM Studio, etc.)",
    baseUrl: "http://localhost:11434/v1",
    models: ["llama3.3", "qwen2.5-coder"],
  },
  {
    id: "custom",
    name: "Custom (enter your own base URL)",
    baseUrl: null,
    models: [],
  },
];
