import { NextResponse } from "next/server";

import { toJson, toMarkdown, type ExportFormat } from "@/lib/export";
import { HttpError, handleRoute } from "@/lib/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function parseFormat(value: string | null): ExportFormat {
  return value === "json" ? "json" : "markdown";
}

export async function GET(request: Request, { params }: Context) {
  return handleRoute(async () => {
    const { id } = await params;
    const format = parseFormat(new URL(request.url).searchParams.get("format"));

    const store = getStore();
    const codebase = await store.getCodebase(id);
    if (!codebase) {
      throw new HttpError(404, `No survey with id "${id}"`);
    }
    const analysis = await store.latestAnalysis(id);
    if (!analysis) {
      throw new HttpError(
        409,
        "This survey has not been analyzed yet — run a survey before exporting"
      );
    }

    if (format === "json") {
      return new NextResponse(toJson(analysis, codebase), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${slug(codebase.name)}.json"`,
        },
      });
    }

    return new NextResponse(toMarkdown(analysis, codebase), {
      status: 200,
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${slug(codebase.name)}.md"`,
      },
    });
  });
}

function slug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "survey";
}
