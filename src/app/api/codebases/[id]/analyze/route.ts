import { NextResponse } from "next/server";

import { handleRoute } from "@/lib/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Runs the deterministic engine for a survey and stores the result. */
export async function POST(_request: Request, { params }: Context) {
  return handleRoute(async () => {
    const { id } = await params;
    const store = getStore();
    const analysis = await store.analyze(id);
    return NextResponse.json({ analysis }, { status: 201 });
  });
}
