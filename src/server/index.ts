#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadCriticConfig } from "./config.js";
import { AdversarialCritiqueInputSchema, AdversarialCritiqueOutputSchema } from "./tool-schema.js";
import { handleAdversarialCritique } from "./handler.js";
import { getPackageVersion } from "./version.js";

const criticConfig = loadCriticConfig();

const server = new McpServer({
  name: "llm-critic-loop",
  version: getPackageVersion(),
});

server.registerTool(
  "adversarial_critique",
  {
    description:
      "Get an independent, fresh-session adversarial critique of a code or docs artifact, with built-in convergence (approve / minor-only / stale-loop / round-cap) so you know when to stop revising. Call again each round, passing back the returned history blob, until the result's done field is true.",
    inputSchema: AdversarialCritiqueInputSchema.shape,
    outputSchema: AdversarialCritiqueOutputSchema.shape,
  },
  async (input) => handleAdversarialCritique(input, { criticConfig }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
