import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { analyzeCodebase } from "./engine";
import type { AnalysisResult, Codebase } from "./types";
import {
  analysisResultSchema,
  codebaseSchema,
  type CodeFileNormalized,
  type CodebaseSummaryResponse,
  type CreateCodebasePayload,
} from "./validation";

/** Raised for expected, user-facing failures (missing record, empty survey…). */
export class StoreError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StoreError";
    this.status = status;
  }
}

export interface CodebasePatch {
  name?: string;
  description?: string;
  files?: CodeFileNormalized[];
}

export interface Store {
  /** Human-readable description of where data lives, surfaced in the UI. */
  readonly location: string;
  readonly kind: "filesystem" | "memory";
  listCodebases(): Promise<Codebase[]>;
  getCodebase(id: string): Promise<Codebase | null>;
  createCodebase(payload: CreateCodebasePayload): Promise<Codebase>;
  updateCodebase(id: string, patch: CodebasePatch): Promise<Codebase>;
  deleteCodebase(id: string): Promise<boolean>;
  listAnalyses(codebaseId: string): Promise<AnalysisResult[]>;
  getAnalysis(id: string): Promise<AnalysisResult | null>;
  latestAnalysis(codebaseId: string): Promise<AnalysisResult | null>;
  /** Runs the deterministic engine and persists the result. */
  analyze(codebaseId: string): Promise<AnalysisResult>;
  summarize(): Promise<CodebaseSummaryResponse[]>;
}

interface Snapshot {
  version: 1;
  codebases: Codebase[];
  analyses: AnalysisResult[];
}

const CODEBASE_LIST_SCHEMA = z.array(codebaseSchema);
const ANALYSIS_LIST_SCHEMA = z.array(analysisResultSchema);

function emptySnapshot(): Snapshot {
  return { version: 1, codebases: [], analyses: [] };
}

function byNewest(a: Codebase, b: Codebase): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function byNewestAnalysis(a: AnalysisResult, b: AnalysisResult): number {
  return b.analyzedAt.localeCompare(a.analyzedAt);
}

function summarizeOne(
  codebase: Codebase,
  latest: AnalysisResult | null
): CodebaseSummaryResponse {
  const totalLines = codebase.files.reduce(
    (sum, file) => sum + file.content.split("\n").length,
    0
  );
  return {
    id: codebase.id,
    name: codebase.name,
    description: codebase.description,
    fileCount: codebase.files.length,
    totalLines,
    totalBytes: codebase.files.reduce((sum, file) => sum + file.size, 0),
    createdAt: codebase.createdAt,
    updatedAt: codebase.updatedAt,
    latestAnalysis: latest,
  };
}

function latestFor(
  codebaseId: string,
  analyses: AnalysisResult[]
): AnalysisResult | null {
  return (
    analyses
      .filter((analysis) => analysis.codebaseId === codebaseId)
      .sort(byNewestAnalysis)[0] ?? null
  );
}

/**
 * Runs the engine for a codebase and stores the result.
 * Shared by both adapters so behaviour is identical regardless of backend.
 */
function runAnalysis(codebase: Codebase, analyses: AnalysisResult[]): AnalysisResult {
  if (codebase.files.length === 0) {
    throw new StoreError(
      `Codebase "${codebase.name}" has no files to survey. Add at least one file before analyzing.`,
      422
    );
  }
  const result = analyzeCodebase(codebase);
  analyses.push(result);
  return result;
}

function applyPatch(codebase: Codebase, patch: CodebasePatch, now: string): Codebase {
  return {
    ...codebase,
    name: patch.name ?? codebase.name,
    description: patch.description ?? codebase.description,
    files: patch.files ?? codebase.files,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* In-memory adapter (default fallback — no env, no disk, no failure) */
/* ------------------------------------------------------------------ */

function createMemoryStore(): Store {
  let codebases: Codebase[] = [];
  let analyses: AnalysisResult[] = [];

  return {
    kind: "memory",
    location: "in-process memory (set NC_DATA_DIR to persist to disk)",
    async listCodebases() {
      return [...codebases].sort(byNewest);
    },
    async getCodebase(id) {
      return codebases.find((codebase) => codebase.id === id) ?? null;
    },
    async createCodebase(payload) {
      const now = new Date().toISOString();
      const codebase: Codebase = {
        id: crypto.randomUUID(),
        name: payload.name,
        description: payload.description,
        files: payload.files,
        createdAt: now,
        updatedAt: now,
      };
      codebases.push(codebase);
      return codebase;
    },
    async updateCodebase(id, patch) {
      const index = codebases.findIndex((codebase) => codebase.id === id);
      if (index < 0) throw new StoreError("Codebase not found", 404);
      const next = applyPatch(codebases[index], patch, new Date().toISOString());
      codebases[index] = next;
      return next;
    },
    async deleteCodebase(id) {
      const before = codebases.length;
      codebases = codebases.filter((codebase) => codebase.id !== id);
      const existed = codebases.length < before;
      analyses = analyses.filter((analysis) => analysis.codebaseId !== id);
      return existed;
    },
    async listAnalyses(codebaseId) {
      return analyses
        .filter((analysis) => analysis.codebaseId === codebaseId)
        .sort(byNewestAnalysis);
    },
    async getAnalysis(id) {
      return analyses.find((analysis) => analysis.id === id) ?? null;
    },
    async latestAnalysis(codebaseId) {
      return latestFor(codebaseId, analyses);
    },
    async analyze(codebaseId) {
      const codebase = codebases.find((entry) => entry.id === codebaseId);
      if (!codebase) throw new StoreError("Codebase not found", 404);
      return runAnalysis(codebase, analyses);
    },
    async summarize() {
      return [...codebases]
        .sort(byNewest)
        .map((codebase) =>
          summarizeOne(codebase, latestFor(codebase.id, analyses))
        );
    },
  };
}

/* ------------------------------------------------------------------ */
/* Filesystem adapter — a single JSON document, written atomically     */
/* ------------------------------------------------------------------ */

function createFilesystemStore(dataDir: string): Store {
  const file = path.join(dataDir, "data.json");
  let snapshot: Snapshot | null = null;
  let writeChain: Promise<void> = Promise.resolve();

  async function load(): Promise<Snapshot> {
    if (snapshot) return snapshot;
    try {
      const raw = await readFile(file, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) {
        throw new StoreError("The data file is not a JSON object", 500);
      }
      const record = parsed as Record<string, unknown>;
      snapshot = {
        version: 1,
        codebases: readList(record.codebases, CODEBASE_LIST_SCHEMA, "codebases"),
        analyses: readList(record.analyses, ANALYSIS_LIST_SCHEMA, "analyses"),
      };
    } catch (error) {
      if (error instanceof StoreError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        snapshot = emptySnapshot();
      } else {
        throw new StoreError(
          `Could not read the data file at ${file}: ${(error as Error).message}`,
          500
        );
      }
    }
    return snapshot;
  }

  function persist(): Promise<void> {
    const current = snapshot;
    writeChain = writeChain
      .then(async () => {
        if (!current) return;
        await mkdir(dataDir, { recursive: true });
        const temp = `${file}.${process.pid}.tmp`;
        await writeFile(temp, JSON.stringify(current, null, 2), "utf8");
        await rename(temp, file);
      })
      .catch((error: unknown) => {
        throw new StoreError(
          `Could not write the data file at ${file}: ${(error as Error).message}`,
          500
        );
      });
    return writeChain;
  }

  return {
    kind: "filesystem",
    location: file,
    async listCodebases() {
      return [...(await load()).codebases].sort(byNewest);
    },
    async getCodebase(id) {
      return (await load()).codebases.find((codebase) => codebase.id === id) ?? null;
    },
    async createCodebase(payload) {
      const state = await load();
      const now = new Date().toISOString();
      const codebase: Codebase = {
        id: crypto.randomUUID(),
        name: payload.name,
        description: payload.description,
        files: payload.files,
        createdAt: now,
        updatedAt: now,
      };
      state.codebases.push(codebase);
      await persist();
      return codebase;
    },
    async updateCodebase(id, patch) {
      const state = await load();
      const index = state.codebases.findIndex((codebase) => codebase.id === id);
      if (index < 0) throw new StoreError("Codebase not found", 404);
      const next = applyPatch(state.codebases[index], patch, new Date().toISOString());
      state.codebases[index] = next;
      await persist();
      return next;
    },
    async deleteCodebase(id) {
      const state = await load();
      const before = state.codebases.length;
      state.codebases = state.codebases.filter((codebase) => codebase.id !== id);
      const existed = state.codebases.length < before;
      state.analyses = state.analyses.filter(
        (analysis) => analysis.codebaseId !== id
      );
      if (existed) await persist();
      return existed;
    },
    async listAnalyses(codebaseId) {
      return (await load()).analyses
        .filter((analysis) => analysis.codebaseId === codebaseId)
        .sort(byNewestAnalysis);
    },
    async getAnalysis(id) {
      return (await load()).analyses.find((analysis) => analysis.id === id) ?? null;
    },
    async latestAnalysis(codebaseId) {
      return latestFor(codebaseId, (await load()).analyses);
    },
    async analyze(codebaseId) {
      const state = await load();
      const codebase = state.codebases.find((entry) => entry.id === codebaseId);
      if (!codebase) throw new StoreError("Codebase not found", 404);
      const result = runAnalysis(codebase, state.analyses);
      await persist();
      return result;
    },
    async summarize() {
      const state = await load();
      return [...state.codebases]
        .sort(byNewest)
        .map((codebase) =>
          summarizeOne(codebase, latestFor(codebase.id, state.analyses))
        );
    },
  };
}

function readList<T>(
  value: unknown,
  schema: z.ZodType<T[]>,
  key: "codebases" | "analyses"
): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new StoreError(`The data file has an invalid \`${key}\` array`, 500);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new StoreError(`The data file has an invalid \`${key}\` array`, 500);
  }
  return parsed.data;
}

/* ------------------------------------------------------------------ */
/* Resolution — never throws, never requires env vars                   */
/* ------------------------------------------------------------------ */

/**
 * `NC_DATA_DIR` wins when set. In development we fall back to `./.nc-data`
 * so edits survive a reload. In production without the env var we use the
 * in-memory adapter, which is why builds and fresh clones need no setup.
 */
function resolveDataDir(): string | null {
  const configured = process.env.NC_DATA_DIR?.trim();
  if (configured) return path.resolve(configured);
  if (process.env.NODE_ENV && process.env.NODE_ENV !== "production") {
    return path.join(process.cwd(), ".nc-data");
  }
  return null;
}

type StoreGlobal = typeof globalThis & {
  __neuralCartographerStore?: Store;
};

const storeGlobal = globalThis as StoreGlobal;

export function getStore(): Store {
  const existing = storeGlobal.__neuralCartographerStore;
  if (existing) return existing;
  const dataDir = resolveDataDir();
  const store = dataDir ? createFilesystemStore(dataDir) : createMemoryStore();
  storeGlobal.__neuralCartographerStore = store;
  return store;
}

export function describeStore(store: Store): {
  kind: Store["kind"];
  location: string;
} {
  return { kind: store.kind, location: store.location };
}
