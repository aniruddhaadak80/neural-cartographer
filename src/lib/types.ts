export interface CodeFile {
  path: string;
  content: string;
  language: string;
  size: number;
}

export interface Codebase {
  id: string;
  name: string;
  description: string;
  files: CodeFile[];
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
  details: string[];
}

export interface AnalysisResult {
  id: string;
  codebaseId: string;
  overallScore: number;
  grade: string;
  factors: AnalysisFactor[];
  recommendations: string[];
  summary: string;
  analyzedAt: string;
  engineVersion: string;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AgentToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface AgentToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}
