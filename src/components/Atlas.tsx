"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Plus, RefreshCw, Download, FileCode2, AlertTriangle } from "lucide-react";

import { Compass as CompassRose } from "./Compass";
import { ScoreGauge, FactorBar } from "./ScoreGauge";

/* ---------------- types mirroring the API ---------------- */

interface AnalysisFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
  details: string[];
}

interface Analysis {
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

interface SurveySummary {
  id: string;
  name: string;
  description: string;
  fileCount: number;
  totalLines: number;
  createdAt: string;
  updatedAt: string;
  latestAnalysis: Analysis | null;
}

interface DraftFile {
  path: string;
  content: string;
}

const SAMPLE_FILES: DraftFile[] = [
  {
    path: "src/tides.ts",
    content: [
      "// Harmonic constants for a semi-diurnal tide.",
      "const MAIN = 12.42;",
      "",
      "/** Build tide events for a station over a window of hours. */",
      "export function computeTides(latitude: number, hours: number): number[] {",
      "  if (hours <= 0) return [];",
      "  const events: number[] = [];",
      "  for (let hour = 0; hour < hours; hour += 1) {",
      "    const main = Math.sin((2 * Math.PI * hour) / MAIN);",
      "    events.push(main);",
      "  }",
      "  return events;",
      "}",
    ].join("\n"),
  },
  {
    path: "README.md",
    content: "# Tide Table\n\nA small library for computing tide events.\n\n## Usage\n\n    import { computeTides } from 'tide-table';",
  },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Server returned a non-JSON response (${response.status})`);
  }
  if (!response.ok) {
    const record = data as { error?: string; issues?: { path: string; message: string }[] } | null;
    const detail = record?.issues?.map((i) => `${i.path}: ${i.message}`).join("; ");
    throw new Error(detail ? `${record?.error} — ${detail}` : (record?.error ?? `Request failed (${response.status})`));
  }
  return data as T;
}

/* ---------------- component ---------------- */

export function Atlas({
  initialSurveys,
  storage,
  storageKind,
}: {
  initialSurveys: SurveySummary[];
  storage: string;
  storageKind: "filesystem" | "memory";
}) {
  const [surveys, setSurveys] = useState<SurveySummary[]>(initialSurveys);
  const [selectedId, setSelectedId] = useState<string | null>(initialSurveys[0]?.id ?? null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [activeFile, setActiveFile] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await api<{ surveys: SurveySummary[] }>("/api/codebases");
    setSurveys(data.surveys);
    setSelectedId((current) =>
      current && data.surveys.some((s) => s.id === current) ? current : (data.surveys[0]?.id ?? null)
    );
  }, []);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const selected = useMemo(
    () => surveys.find((s) => s.id === selectedId) ?? null,
    [surveys, selectedId]
  );

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await task();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  const createSurvey = () =>
    run("create", async () => {
      if (files.length === 0) {
        setError("Add at least one file before creating a survey.");
        return;
      }
      const created = await api<{ survey: { id: string } }>("/api/codebases", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || "Untitled survey",
          description: description.trim(),
          files: files.map((file) => ({ path: file.path, content: file.content })),
        }),
      });
      setName("");
      setDescription("");
      setFiles([]);
      setActiveFile(0);
      await refresh();
      setSelectedId(created.survey.id);
      setNotice("Survey stored. Run the survey engine to score it.");
    });

  const loadSample = () => {
    setName("Tide Table (sample)");
    setDescription("A small harbour tide-table library, provided as a starting point.");
    setFiles(SAMPLE_FILES);
    setActiveFile(0);
    setNotice("Sample loaded into the editor — create the survey to store it.");
  };

  const analyzeSelected = () =>
    run("analyze", async () => {
      if (!selected) return;
      await api(`/api/codebases/${selected.id}/analyze`, { method: "POST" });
      await refresh();
      setNotice(`Survey engine finished for "${selected.name}".`);
    });

  const deleteSelected = () =>
    run("delete", async () => {
      if (!selected) return;
      await api(`/api/codebases/${selected.id}`, { method: "DELETE" });
      await refresh();
      setNotice(`Deleted "${selected.name}".`);
    });

  const current = files[activeFile];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      {/* Masthead */}
      <header className="mb-8 flex flex-wrap items-center gap-6 border-b-4 border-ink pb-6">
        <CompassRose className="h-20 w-20 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-brutalist text-3xl leading-none sm:text-4xl">
            Neural Cartographer
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/80">
            A deterministic code-intelligence atlas. Every score is a weighted sum of six
            measured factors — no model, no guesswork. Point it at a survey of files and read
            the arithmetic.
          </p>
        </div>
        <div className="text-right text-[11px] leading-tight text-ink/70">
          <p className="font-black uppercase">Storage</p>
          <p className="font-mono break-all">{storage}</p>
          <p className="mt-1 font-black uppercase text-clayDark">{storageKind} adapter</p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* ---- Survey list ---- */}
        <aside className="space-y-4">
          <section className="card-paper p-4">
            <h2 className="text-brutalist mb-3 text-lg">Surveys</h2>
            {surveys.length === 0 ? (
              <p className="text-sm text-ink/70">
                No surveys yet. Load the sample or paste your own files.
              </p>
            ) : (
              <ul className="space-y-2">
                {surveys.map((survey) => (
                  <li key={survey.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(survey.id)}
                      aria-pressed={survey.id === selectedId}
                      className={`w-full border-2 border-ink p-2 text-left transition ${
                        survey.id === selectedId
                          ? "bg-clay text-paper"
                          : "bg-cream hover:bg-paper"
                      }`}
                    >
                      <span className="block truncate text-sm font-bold">{survey.name}</span>
                      <span className="block text-[11px] opacity-80">
                        {survey.fileCount} files · {survey.totalLines} lines ·{" "}
                        {survey.latestAnalysis
                          ? `${survey.latestAnalysis.overallScore}/100 (${survey.latestAnalysis.grade})`
                          : "not surveyed"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card-paper p-4">
            <h2 className="text-brutalist mb-3 text-lg">New survey</h2>
            <label className="mb-2 block text-xs font-bold uppercase" htmlFor="survey-name">
              Name
            </label>
            <input
              id="survey-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Payments service"
              className="mb-3 w-full border-2 border-ink bg-cream px-2 py-1 text-sm"
            />
            <label className="mb-2 block text-xs font-bold uppercase" htmlFor="survey-desc">
              Description
            </label>
            <textarea
              id="survey-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="What does this survey cover?"
              className="mb-3 w-full border-2 border-ink bg-cream px-2 py-1 text-sm"
            />

            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase">Files ({files.length})</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={loadSample}
                  className="border-2 border-ink bg-cream px-2 py-0.5 text-[11px] font-bold hover:bg-paper"
                >
                  Sample
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFiles((prev) => [...prev, { path: `src/file${prev.length + 1}.ts`, content: "" }]);
                    setActiveFile(files.length);
                  }}
                  className="flex items-center gap-1 border-2 border-ink bg-cream px-2 py-0.5 text-[11px] font-bold hover:bg-paper"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
            </div>

            {files.length > 0 && (
              <ul className="mb-3 max-h-40 space-y-1 overflow-y-auto">
                {files.map((file, index) => (
                  <li key={`${file.path}-${index}`} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setActiveFile(index)}
                      className={`flex-1 truncate border-2 border-ink px-2 py-1 text-left font-mono text-[11px] ${
                        index === activeFile ? "bg-ink text-paper" : "bg-cream hover:bg-paper"
                      }`}
                    >
                      {file.path || "(unnamed)"}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${file.path || "file"}`}
                      onClick={() => {
                        setFiles((prev) => prev.filter((_, i) => i !== index));
                        setActiveFile(0);
                      }}
                      className="border-2 border-ink bg-cream p-1 hover:bg-clay"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {current && (
              <div className="mb-3">
                <label className="mb-1 block text-[11px] font-bold uppercase" htmlFor="file-path">
                  Path
                </label>
                <input
                  id="file-path"
                  value={current.path}
                  onChange={(event) =>
                    setFiles((prev) =>
                      prev.map((file, i) => (i === activeFile ? { ...file, path: event.target.value } : file))
                    )
                  }
                  className="mb-2 w-full border-2 border-ink bg-cream px-2 py-1 font-mono text-xs"
                />
                <label className="mb-1 block text-[11px] font-bold uppercase" htmlFor="file-content">
                  Content
                </label>
                <textarea
                  id="file-content"
                  value={current.content}
                  onChange={(event) =>
                    setFiles((prev) =>
                      prev.map((file, i) => (i === activeFile ? { ...file, content: event.target.value } : file))
                    )
                  }
                  rows={6}
                  spellCheck={false}
                  className="w-full border-2 border-ink bg-cream px-2 py-1 font-mono text-[11px]"
                />
              </div>
            )}

            <button
              type="button"
              onClick={createSurvey}
              disabled={busy !== null}
              className="btn-ink w-full disabled:opacity-50"
            >
              {busy === "create" ? "Storing…" : "Create survey"}
            </button>
          </section>
        </aside>

        {/* ---- Atlas ---- */}
        <section className="space-y-6">
          {selected ? (
            <>
              <div className="card-paper flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h2 className="text-brutalist truncate text-xl">{selected.name}</h2>
                  <p className="truncate text-xs text-ink/70">
                    {selected.description || "No description"} · {selected.fileCount} files ·{" "}
                    {selected.totalLines} lines
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={analyzeSelected}
                    disabled={busy !== null}
                    className="btn-clay flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={busy === "analyze" ? "animate-spin" : ""} />
                    {busy === "analyze" ? "Surveying…" : "Run survey"}
                  </button>
                  <a
                    href={`/api/codebases/${selected.id}/export?format=markdown`}
                    className="btn-ink flex items-center gap-2"
                  >
                    <Download size={14} /> .md
                  </a>
                  <a
                    href={`/api/codebases/${selected.id}/export?format=json`}
                    className="btn-ink flex items-center gap-2"
                  >
                    <Download size={14} /> .json
                  </a>
                  <button
                    type="button"
                    onClick={deleteSelected}
                    disabled={busy !== null}
                    className="flex items-center gap-2 border-2 border-ink bg-cream px-3 py-2 text-sm font-bold hover:bg-clay disabled:opacity-50"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </div>

              {selected.latestAnalysis ? (
                <AnalysisView analysis={selected.latestAnalysis} />
              ) : (
                <div className="card-paper p-8 text-center">
                  <FileCode2 className="mx-auto mb-3 opacity-40" size={40} />
                  <p className="text-sm text-ink/80">
                    This survey has not been scored yet. Press <strong>Run survey</strong> to
                    execute the engine.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="card-paper p-10 text-center">
              <CompassRose className="mx-auto mb-4 h-24 w-24 opacity-50" />
              <h2 className="text-brutalist text-xl">Uncharted</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-ink/75">
                Create a survey on the left, or load the sample to see the engine work.
                Nothing here is pre-seeded — every result is computed from files you supply.
              </p>
            </div>
          )}

          <McpPanel />
        </section>
      </div>

      {/* Status messages */}
      <div className="mt-6 space-y-2">
        <AnimatePresence>
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="alert"
              className="flex items-start gap-2 border-2 border-ink bg-crimson px-3 py-2 text-sm text-paper"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {notice && (
            <motion.div
              key="notice"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="border-2 border-ink bg-emerald px-3 py-2 text-sm text-ink"
            >
              {notice}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

/* ---------------- analysis view ---------------- */

function AnalysisView({ analysis }: { analysis: Analysis }) {
  const weightTotal = analysis.factors.reduce((sum, factor) => sum + factor.weight, 0);
  const contributionTotal = analysis.factors.reduce(
    (sum, factor) => sum + factor.score * factor.weight,
    0
  );

  return (
    <div className="space-y-4">
      <div className="card-paper grid gap-4 p-4 sm:grid-cols-[240px_1fr]">
        <ScoreGauge score={analysis.overallScore} grade={analysis.grade} />
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">{analysis.summary}</p>
          <div className="border-2 border-ink bg-paper p-3">
            <h3 className="text-brutalist mb-1 text-sm">How this score was reached</h3>
            <p className="font-mono text-[11px] leading-relaxed break-words">
              {analysis.factors
                .map((factor) => `${factor.score}×${factor.weight}`)
                .join(" + ")}{" "}
              = {contributionTotal.toFixed(2)}
            </p>
            <p className="mt-1 text-[11px] text-ink/70">
              Weights total {weightTotal.toFixed(2)}; the sum is rounded to{" "}
              {analysis.overallScore}/100, which maps to grade {analysis.grade}. Engine{" "}
              {analysis.engineVersion} · {new Date(analysis.analyzedAt).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="card-paper p-4">
        <h3 className="text-brutalist mb-3 text-lg">Factor breakdown</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {analysis.factors.map((factor) => (
            <FactorBar
              key={factor.name}
              name={factor.name}
              score={factor.score}
              weight={factor.weight}
              description={factor.description}
              details={factor.details}
            />
          ))}
        </div>
      </div>

      <div className="card-paper p-4">
        <h3 className="text-brutalist mb-3 text-lg">Recommendations</h3>
        {analysis.recommendations.length === 0 ? (
          <p className="text-sm text-ink/70">Nothing to flag — the survey found no weak factors.</p>
        ) : (
          <ol className="space-y-2">
            {analysis.recommendations.map((recommendation) => (
              <li key={recommendation} className="flex gap-2 text-sm leading-relaxed">
                <span className="font-mono font-bold text-clayDark">→</span>
                <span>{recommendation}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/* ---------------- MCP panel ---------------- */

const MCP_EXAMPLE = `curl -X POST ${typeof window !== "undefined" ? window.location.origin : ""}/api/mcp \\
  -H "content-type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

function McpPanel() {
  return (
    <div className="card-paper p-4">
      <h3 className="text-brutalist mb-2 text-lg">MCP tool server</h3>
      <p className="mb-3 text-sm text-ink/80">
        The same engine is exposed over JSON-RPC 2.0 at <code className="font-mono">/api/mcp</code>,
        so an agent can survey code with the identical logic this page uses. Tools:{" "}
        <code className="font-mono text-xs">analyze_codebase</code>,{" "}
        <code className="font-mono text-xs">list_codebases</code>,{" "}
        <code className="font-mono text-xs">get_analysis</code>,{" "}
        <code className="font-mono text-xs">export_analysis</code>.
      </p>
      <pre className="overflow-x-auto border-2 border-ink bg-paper p-3 font-mono text-[11px] leading-relaxed">
        {MCP_EXAMPLE}
      </pre>
    </div>
  );
}
