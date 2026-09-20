export const ISSUE_JSON_SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string" },
          severity: { type: "string", enum: ["minor", "major", "critical"] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          description: { type: "string" },
          suggestion: { type: "string" },
          location: { type: "string" },
        },
        required: ["category", "severity", "confidence", "description"],
      },
    },
    summary: { type: "string" },
  },
  required: ["issues", "summary"],
} as const;
