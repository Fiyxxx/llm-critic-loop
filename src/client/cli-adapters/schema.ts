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
          description: { type: "string" },
          location: { type: "string" },
        },
        required: ["category", "severity", "description"],
      },
    },
    summary: { type: "string" },
  },
  required: ["issues", "summary"],
} as const;
