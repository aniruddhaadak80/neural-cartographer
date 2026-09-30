import { z } from "zod";

/** Languages the cartographer can label a sheet of code with. */
export const KNOWN_LANGUAGES = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "python",
  "go",
  "rust",
  "java",
  "kotlin",
  "swift",
  "c",
  "cpp",
  "csharp",
  "ruby",
  "php",
  "sql",
  "shell",
  "json",
  "yaml",
  "markdown",
  "css",
  "html",
  "text",
] as const;

export type LanguageLabel = (typeof KNOWN_LANGUAGES)[number];

const EXTENSION_LANGUAGE: Record<string, LanguageLabel> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  markdown: "markdown",
  css: "css",
  html: "html",
};

/** Best-effort language label for a path; always returns something usable. */
export function inferLanguage(path: string): LanguageLabel {
  const file = path.split("/").pop() ?? path;
  const dot = file.lastIndexOf(".");
  if (dot < 0) return "text";
  return EXTENSION_LANGUAGE[file.slice(dot + 1).toLowerCase()] ?? "text";
}

/** Byte size, measured the way the store records it. */
export function byteLength(content: string): number {
  return Buffer.byteLength(content, "utf8");
}

export const codeFileSchema = z
  .object({
    path: z
      .string()
      .trim()
      .min(1, "path is required")
      .max(240, "path must be 240 characters or fewer"),
    content: z
      .string()
      .max(400_000, "a single file may not exceed 400,000 characters"),
    language: z
      .enum(KNOWN_LANGUAGES)
      .optional()
      .describe("Derived from the file extension when omitted"),
    size: z.number().int().nonnegative().optional(),
  })
  .strict()
  .transform((file) => ({
    path: file.path.replace(/\\/g, "/").replace(/^\.\//, ""),
    content: file.content,
    language: file.language ?? inferLanguage(file.path),
    size: byteLength(file.content),
  }));

export type CodeFileInput = z.input<typeof codeFileSchema>;
export type CodeFileNormalized = z.output<typeof codeFileSchema>;

const codebaseFields = {
  name: z
    .string()
    .trim()
    .min(1, "name is required")
    .max(80, "name must be 80 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(600, "description must be 600 characters or fewer")
    .default(""),
  files: z
    .array(codeFileSchema)
    .min(1, "a codebase needs at least one file")
    .max(60, "a codebase may not exceed 60 files")
    .refine(
      (files) => new Set(files.map((file) => file.path)).size === files.length,
      "file paths must be unique"
    ),
};

export const createCodebaseSchema = z.object(codebaseFields).strict();

export const updateCodebaseSchema = z
  .object({
    name: codebaseFields.name.optional(),
    description: codebaseFields.description.optional(),
    files: codebaseFields.files.optional(),
  })
  .strict()
  .refine(
    (patch) =>
      patch.name !== undefined ||
      patch.description !== undefined ||
      patch.files !== undefined,
    "provide at least one field to update"
  );

export type CreateCodebaseInput = z.input<typeof createCodebaseSchema>;
export type CreateCodebasePayload = z.output<typeof createCodebaseSchema>;
export type UpdateCodebaseInput = z.input<typeof updateCodebaseSchema>;
export type UpdateCodebasePayload = z.output<typeof updateCodebaseSchema>;

export const idSchema = z.string().trim().min(1, "an id is required").max(120);

/* ------------------------------------------------------------------ */
/* Response schemas — also used by the browser to parse API replies.  */
/* ------------------------------------------------------------------ */

export const codeFileSchemaOut = z.object({
  path: z.string(),
  content: z.string(),
  language: z.string(),
  size: z.number(),
});

export const codebaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  files: z.array(codeFileSchemaOut),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const analysisFactorSchema = z.object({
  name: z.string(),
  score: z.number(),
  weight: z.number(),
  description: z.string(),
  details: z.array(z.string()),
});

export const analysisResultSchema = z.object({
  id: z.string(),
  codebaseId: z.string(),
  overallScore: z.number(),
  grade: z.string(),
  factors: z.array(analysisFactorSchema),
  recommendations: z.array(z.string()),
  summary: z.string(),
  analyzedAt: z.string(),
  engineVersion: z.string(),
});

export const fileBreakdownSchema = z.object({
  path: z.string(),
  language: z.string(),
  size: z.number(),
  lines: z.number(),
  codeLines: z.number(),
  commentLines: z.number(),
  branchPoints: z.number(),
  longLines: z.number(),
  maxLineLength: z.number(),
  docRatio: z.number(),
  complexityScore: z.number(),
  notes: z.array(z.string()),
});

export const codebaseSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  fileCount: z.number(),
  totalLines: z.number(),
  totalBytes: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  latestAnalysis: analysisResultSchema.nullable(),
});

export type CodeFileResponse = z.infer<typeof codeFileSchemaOut>;
export type CodebaseResponse = z.infer<typeof codebaseSchema>;
export type AnalysisResultResponse = z.infer<typeof analysisResultSchema>;
export type FileBreakdownResponse = z.infer<typeof fileBreakdownSchema>;
export type CodebaseSummaryResponse = z.infer<typeof codebaseSummarySchema>;

export const errorResponseSchema = z.object({
  error: z.string(),
  issues: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
});

/* ------------------------------------------------------------------ */
/* MCP / JSON-RPC                                                       */
/* ------------------------------------------------------------------ */

export const jsonRpcRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string().min(1),
    params: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const jsonRpcErrorCode = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

export type JsonRpcErrorCode =
  (typeof jsonRpcErrorCode)[keyof typeof jsonRpcErrorCode];

/** Tool argument schemas, keyed by MCP tool name. */
export const mcpToolSchemas = {
  analyze_codebase: z
    .object({
      codebaseId: idSchema
        .optional()
        .describe("Analyze a codebase that already exists in the store"),
      name: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .optional()
        .describe("Name for a new survey when passing `files`"),
      description: z.string().trim().max(600).optional(),
      files: z
        .array(codeFileSchema)
        .min(1, "pass at least one file")
        .max(60)
        .optional()
        .describe("Files to survey inline; creates a stored codebase"),
    })
    .strict()
    .refine(
      (args) => typeof args.codebaseId === "string" || Array.isArray(args.files),
      "provide `codebaseId` or inline `files`"
    ),
  list_codebases: z.object({}).strict(),
  get_analysis: z
    .object({
      analysisId: idSchema.optional(),
      codebaseId: idSchema
        .optional()
        .describe("Resolve the most recent analysis for this codebase"),
    })
    .strict()
    .refine(
      (args) => typeof args.analysisId === "string" || typeof args.codebaseId === "string",
      "provide `analysisId` or `codebaseId`"
    ),
  export_analysis: z
    .object({
      analysisId: idSchema.optional(),
      codebaseId: idSchema.optional(),
      format: z.enum(["json", "markdown"]).default("markdown"),
    })
    .strict()
    .refine(
      (args) => typeof args.analysisId === "string" || typeof args.codebaseId === "string",
      "provide `analysisId` or `codebaseId`"
    ),
} as const;

export type McpToolName = keyof typeof mcpToolSchemas;

export const MCP_TOOL_NAMES = Object.keys(
  mcpToolSchemas
) as McpToolName[];

export function isMcpToolName(value: string): value is McpToolName {
  return Object.prototype.hasOwnProperty.call(mcpToolSchemas, value);
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

export function flattenIssues(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
  }));
}
