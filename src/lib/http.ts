import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";

import { StoreError } from "./store";
import { flattenIssues } from "./validation";

export interface Issue {
  path: string;
  message: string;
}

export class HttpError extends Error {
  readonly status: number;
  readonly issues?: Issue[];

  constructor(status: number, message: string, issues?: Issue[]) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.issues = issues;
  }
}

export function jsonError(
  message: string,
  status: number,
  issues?: Issue[]
): NextResponse {
  return NextResponse.json(
    issues ? { error: message, issues } : { error: message },
    { status }
  );
}

/** Wraps a route body so every expected failure becomes a JSON error payload. */
export async function handleRoute(
  run: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.message, error.status, error.issues);
    }
    if (error instanceof StoreError) {
      return jsonError(error.message, error.status);
    }
    if (error instanceof ZodError) {
      return jsonError(
        "The request body failed validation",
        400,
        flattenIssues(error)
      );
    }
    return jsonError(
      `Unexpected server error: ${(error as Error).message}`,
      500
    );
  }
}

/** Parses a request body as JSON, rejecting malformed payloads with 400. */
export async function readJsonBody(request: Request): Promise<unknown> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new HttpError(400, "Could not read the request body");
  }
  if (text.trim().length === 0) {
    throw new HttpError(400, "A JSON request body is required");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "The request body is not valid JSON");
  }
}

/**
 * Parses and validates a request body in one step.
 *
 * Returns the schema's *output* type. This matters for schemas with
 * transforms (e.g. `codeFileSchema`, which derives `language` and `size`),
 * where the input and output shapes differ.
 */
export async function readValidatedBody<S extends ZodTypeAny>(
  request: Request,
  schema: S
): Promise<z.output<S>> {
  const body = await readJsonBody(request);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "The request body failed validation",
      flattenIssues(parsed.error)
    );
  }
  return parsed.data as z.output<S>;
}
