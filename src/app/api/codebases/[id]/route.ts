import { NextResponse } from "next/server";

import { breakdownCodebase, rollupTotals } from "@/lib/breakdown";
import { HttpError, handleRoute, readValidatedBody } from "@/lib/http";
import { getStore } from "@/lib/store";
import { updateCodebaseSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return handleRoute(async () => {
    const { id } = await params;
    const store = getStore();
    const codebase = await store.getCodebase(id);
    if (!codebase) {
      throw new HttpError(404, `No survey with id "${id}"`);
    }
    const files = breakdownCodebase(codebase);
    return NextResponse.json({
      survey: codebase,
      breakdown: files,
      totals: rollupTotals(files),
      analyses: await store.listAnalyses(id),
    });
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return handleRoute(async () => {
    const { id } = await params;
    const store = getStore();
    const patch = await readValidatedBody(request, updateCodebaseSchema);
    const codebase = await store.updateCodebase(id, patch);
    return NextResponse.json({ survey: codebase });
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  return handleRoute(async () => {
    const { id } = await params;
    const store = getStore();
    const removed = await store.deleteCodebase(id);
    if (!removed) {
      throw new HttpError(404, `No survey with id "${id}"`);
    }
    return NextResponse.json({ deleted: id });
  });
}
