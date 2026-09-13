#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadCriticConfig } from "./config.js";
import { CriticInputSchema, CriticOutputSchema } from "./tool-schema.js";
import { handleCritic } from "./handler.js";
import { getPackageVersion } from "./version.js";

if (process.argv[2] === "init") {
  const { runInit, formatInitResult } = await import("../cli/init.js");
  const clack = await import("@clack/prompts");
  clack.intro("llm-critic-loop setup");
  const result = await runInit();
  console.log(formatInitResult(result));
  process.exit(result.ran && !result.succeeded ? 1 : 0);
}

const criticConfig = loadCriticConfig();

const server = new McpServer({
  name: "llm-critic-loop",
  version: getPackageVersion(),
});

server.registerTool(
  "critic",
  {
    description:
      "Get an independent, fresh-session adversarial critique of a code or docs artifact, with built-in convergence (approve / minor-only / stale-loop / round-cap) so you know when to stop revising. Call again each round, passing back the returned history blob, until the result's done field is true.",
    inputSchema: CriticInputSchema.shape,
    outputSchema: CriticOutputSchema.shape,
  },
  async (input) => handleCritic(input, { criticConfig }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
