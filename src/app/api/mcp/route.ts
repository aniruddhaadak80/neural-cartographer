import { NextResponse } from "next/server";

import { toJson, toMarkdown } from "@/lib/export";
import {
  createCodebaseSchema,
  jsonRpcErrorCode,
  jsonRpcRequestSchema,
  mcpToolSchemas,
  type McpToolName,
} from "@/lib/validation";
import { StoreError, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = {
  name: "neural-cartographer",
  version: "1.0.0",
  title: "Neural Cartographer",
} as const;

interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

function rpcError(id: string | number | null, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0" as const, id, error: { code, message, ...(data ? { data } : {}) } };
}

function rpcResult(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

/** Wraps a payload in the MCP content envelope. */
function toolText(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

const TOOL_DEFINITIONS = [
  {
    name: "analyze_codebase",
    description:
      "Run the deterministic six-factor survey engine. Pass `codebaseId` to analyze a stored survey, or pass inline `files` (with an optional `name`) to create and analyze a new survey in one call.",
    inputSchema: {
      type: "object",
      properties: {
        codebaseId: { type: "string", description: "Id of an existing stored survey" },
        name: { type: "string", description: "Name for a new survey when passing `files`" },
        description: { type: "string", description: "Description for a new survey" },
        files: {
          type: "array",
          description: "Files to survey inline; creates a stored survey",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" },
              language: { type: "string" },
            },
            required: ["path", "content"],
          },
        },
      },
    },
  },
  {
    name: "list_codebases",
    description:
      "List every stored survey with its file count, total lines and most recent analysis summary.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_analysis",
    description:
      "Fetch a full analysis by `analysisId`, or the most recent analysis for a survey via `codebaseId`. Includes the weighted factor breakdown and the arithmetic that produced the score.",
    inputSchema: {
      type: "object",
      properties: {
        analysisId: { type: "string" },
        codebaseId: { type: "string", description: "Resolve the most recent analysis" },
      },
    },
  },
  {
    name: "export_analysis",
    description:
      "Export an analysis as a human-readable Markdown survey or as raw JSON, including the per-file breakdown.",
    inputSchema: {
      type: "object",
      properties: {
        analysisId: { type: "string" },
        codebaseId: { type: "string" },
        format: { type: "string", enum: ["markdown", "json"], default: "markdown" },
      },
    },
  },
] as const;

async function resolveAnalysis(args: {
  analysisId?: string;
  codebaseId?: string;
}) {
  const store = getStore();
  if (args.analysisId) {
    const analysis = await store.getAnalysis(args.analysisId);
    if (!analysis) {
      throw new StoreError(`No analysis with id "${args.analysisId}"`, 404);
    }
    return { analysis, codebase: await store.getCodebase(analysis.codebaseId) };
  }
  const codebaseId = args.codebaseId as string;
  const analysis = await store.latestAnalysis(codebaseId);
  if (!analysis) {
    throw new StoreError(
      `No analysis yet for survey "${codebaseId}" — run analyze_codebase first`,
      404
    );
  }
  return { analysis, codebase: await store.getCodebase(codebaseId) };
}

async function callTool(name: McpToolName, rawArgs: unknown) {
  const schema = mcpToolSchemas[name];
  const parsed = schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.length ? issue.path.join(".") : "(root)"}: ${issue.message}`)
      .join("; ");
    return toolText(`Invalid arguments for ${name}: ${issues}`, true);
  }
  const args = parsed.data as Record<string, unknown>;
  const store = getStore();

  switch (name) {
    case "list_codebases": {
      const surveys = await store.summarize();
      if (surveys.length === 0) {
        return toolText("No surveys stored yet. Call analyze_codebase with inline `files` to create one.");
      }
      const rows = surveys.map((survey) => {
        const score = survey.latestAnalysis
          ? `${survey.latestAnalysis.overallScore}/100 (${survey.latestAnalysis.grade})`
          : "not analyzed";
        return `- ${survey.name} [${survey.id}] — ${survey.fileCount} files, ${survey.totalLines} lines — ${score}`;
      });
      return toolText(`${surveys.length} survey(s):\n${rows.join("\n")}`);
    }

    case "analyze_codebase": {
      const codebaseId = args.codebaseId;
      if (typeof codebaseId === "string") {
        const analysis = await store.analyze(codebaseId);
        return toolText(
          `Analyzed "${analysis.summary}"\n\n` +
            analysis.factors
              .map(
                (factor) =>
                  `- ${factor.name}: ${factor.score}/100 (weight ${factor.weight}, contribution ${(factor.score * factor.weight).toFixed(2)})`
              )
              .join("\n") +
            `\n\nOverall: ${analysis.overallScore}/100, grade ${analysis.grade}`
        );
      }
      const payload = createCodebaseSchema.parse({
        name: typeof args.name === "string" ? args.name : "Untitled survey",
        description: typeof args.description === "string" ? args.description : "",
        files: args.files,
      });
      const created = await store.createCodebase(payload);
      const analysis = await store.analyze(created.id);
      return toolText(
        `Created survey "${created.name}" [${created.id}] and analyzed it.\n` +
          `Overall: ${analysis.overallScore}/100, grade ${analysis.grade}\n` +
          analysis.recommendations.map((r) => `- ${r}`).join("\n")
      );
    }

    case "get_analysis": {
      const { analysis, codebase } = await resolveAnalysis(args as { analysisId?: string; codebaseId?: string });
      if (!codebase) {
        throw new StoreError("The survey backing this analysis no longer exists", 404);
      }
      return toolText(
        `# ${codebase.name}\n${analysis.summary}\n\n` +
          analysis.factors
            .map(
              (factor) =>
                `## ${factor.name} — ${factor.score}/100 (weight ${factor.weight})\n${factor.description}` +
                (factor.details.length ? `\n${factor.details.map((d) => `- ${d}`).join("\n")}` : "")
            )
            .join("\n\n") +
          `\n\n## Recommendations\n${analysis.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
      );
    }

    case "export_analysis": {
      const { analysis, codebase } = await resolveAnalysis(args as { analysisId?: string; codebaseId?: string });
      if (!codebase) {
        throw new StoreError("The survey backing this analysis no longer exists", 404);
      }
      const format = args.format === "json" ? "json" : "markdown";
      return toolText(format === "json" ? toJson(analysis, codebase) : toMarkdown(analysis, codebase));
    }
  }
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return NextResponse.json(
      rpcError(null, jsonRpcErrorCode.parseError, "Request body is not valid JSON"),
      { status: 400 }
    );
  }

  // Batch requests are part of JSON-RPC 2.0.
  const isBatch = Array.isArray(payload);
  const candidates: unknown[] = isBatch ? (payload as unknown[]) : [payload];
  if (candidates.length === 0) {
    return NextResponse.json(
      rpcError(null, jsonRpcErrorCode.invalidRequest, "Batch request must not be empty"),
      { status: 400 }
    );
  }

  const responses: unknown[] = [];
  for (const candidate of candidates) {
    const parsed = jsonRpcRequestSchema.safeParse(candidate);
    if (!parsed.success) {
      responses.push(
        rpcError(
          null,
          jsonRpcErrorCode.invalidRequest,
          "Invalid JSON-RPC request",
          parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          }))
        )
      );
      continue;
    }

    const { id = null, method, params } = parsed.data;
    const args = (params ?? {}) as Record<string, unknown>;

    try {
      switch (method) {
        case "initialize":
          responses.push(
            rpcResult(id, {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: { tools: { listChanged: false } },
              serverInfo: SERVER_INFO,
            })
          );
          break;

        case "notifications/initialized":
          // Notification: no response required.
          break;

        case "ping":
          responses.push(rpcResult(id, {}));
          break;

        case "tools/list":
          responses.push(rpcResult(id, { tools: TOOL_DEFINITIONS }));
          break;

        case "tools/call": {
          const name = args.name;
          if (typeof name !== "string" || !(name in mcpToolSchemas)) {
            responses.push(
              rpcResult(
                id,
                toolText(
                  `Unknown tool "${String(name)}". Available: ${Object.keys(mcpToolSchemas).join(", ")}`,
                  true
                )
              )
            );
            break;
          }
          const result = await callTool(name as McpToolName, args.arguments);
          responses.push(rpcResult(id, result));
          break;
        }

        default:
          responses.push(
            rpcError(
              id,
              jsonRpcErrorCode.methodNotFound,
              `Unknown method "${method}"`
            )
          );
      }
    } catch (error) {
      const status = error instanceof StoreError ? error.status : 500;
      const message =
        error instanceof StoreError
          ? error.message
          : `Tool execution failed: ${(error as Error).message}`;
      // Tool failures are reported in-band (isError) so the agent can recover.
      responses.push(
        rpcResult(id, toolText(message, true)) as unknown
      );
      void status;
    }
  }

  if (responses.length === 0) {
    return new NextResponse(null, { status: 202 });
  }
  return NextResponse.json(isBatch ? responses : responses[0]);
}

/** Convenience for GET probes: describe the endpoint. */
export async function GET() {
  return NextResponse.json({
    protocolVersion: PROTOCOL_VERSION,
    serverInfo: SERVER_INFO,
    transport: "POST JSON-RPC 2.0 to this URL",
    tools: TOOL_DEFINITIONS.map((tool) => tool.name),
  });
}
