import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let dataDir = "";

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "neural-cartographer-"));
  process.env.NC_DATA_DIR = dataDir;
});

afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function callTool(name: string) {
  const { POST } = await import("./route");
  const response = await POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: {} },
      }),
    })
  );
  return (await response.json()) as {
    result?: { content: Array<{ text: string }>; isError?: boolean };
  };
}

describe("POST /api/mcp tools/call", () => {
  it("rejects Object.prototype members as tool names", async () => {
    // `name in mcpToolSchemas` used to accept these, and the call then blew up
    // with "schema.safeParse is not a function".
    for (const name of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      const body = await callTool(name);
      expect(body.result?.content[0].text).toContain(`Unknown tool "${name}"`);
    }
  });

  it("still dispatches a known tool", async () => {
    const body = await callTool("list_codebases");
    expect(body.result?.content[0].text).toContain("No surveys stored yet");
  });
});
