import { NextResponse } from "next/server";

import { handleRoute, readValidatedBody } from "@/lib/http";
import { describeStore, getStore } from "@/lib/store";
import { createCodebaseSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => {
    const store = getStore();
    const surveys = await store.summarize();
    return NextResponse.json({
      surveys,
      storage: describeStore(store),
    });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const store = getStore();
    const payload = await readValidatedBody(request, createCodebaseSchema);
    const codebase = await store.createCodebase(payload);
    return NextResponse.json({ survey: codebase }, { status: 201 });
  });
}
