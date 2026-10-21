import { describe, expect, it } from "vitest";

import { isMcpToolName, MCP_TOOL_NAMES, mcpToolSchemas } from "./validation";

describe("isMcpToolName", () => {
  it("accepts the four MCP tools", () => {
    expect(MCP_TOOL_NAMES).toEqual([
      "analyze_codebase",
      "list_codebases",
      "get_analysis",
      "export_analysis",
    ]);
    for (const name of MCP_TOOL_NAMES) {
      expect(isMcpToolName(name)).toBe(true);
    }
  });

  it("rejects names inherited from Object.prototype", () => {
    // `name in mcpToolSchemas` would accept every one of these, because the
    // `in` operator walks the prototype chain.
    for (const name of [
      "toString",
      "valueOf",
      "constructor",
      "hasOwnProperty",
      "isPrototypeOf",
      "propertyIsEnumerable",
      "toLocaleString",
      "__proto__",
    ]) {
      expect(name in mcpToolSchemas).toBe(true);
      expect(isMcpToolName(name)).toBe(false);
    }
  });

  it("rejects unknown names", () => {
    expect(isMcpToolName("nope")).toBe(false);
    expect(isMcpToolName("")).toBe(false);
  });
});
