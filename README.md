# Neural Cartographer

An explainable code-intelligence atlas. Give it a survey of source files and it produces a
deterministic, weighted quality score — then shows you the arithmetic behind every number.

No LLM is involved in scoring. There is no black box: the overall grade is a plain weighted
sum of six measured factors, and the UI and exports print the formula that produced it.

## Why this exists

Most "AI code review" tools give you a score and no provenance. Neural Cartographer is the
opposite: a boring, reproducible, inspectable engine. Same files in, same score out, every
time. The interesting part is not the number — it's that you can open the box and check
the number's work.

## The engine

Six factors, weights summing to exactly `1.00`:

| Factor | Weight | What it measures |
| --- | --- | --- |
| Complexity | 0.20 | Branch keywords, nesting, average and max line length |
| Structure | 0.25 | Presence of entry points, config, tests, README, types, real directories |
| Documentation | 0.15 | Ratio of comment lines to total lines |
| Naming | 0.15 | Identifier shape and length across functions/classes/types |
| Consistency | 0.15 | Indentation, quote style and semicolon agreement |
| Modularity | 0.10 | File sizes, outliers, directory spread |

`overallScore = round(Σ scoreᵢ × weightᵢ)`, then mapped to a letter grade.

## Features

- **Surveys** — create, rename, edit and delete codebases. Nothing is pre-seeded.
- **Per-file breakdown** — lines, code lines, comments, branch points, long lines,
  complexity and structural warnings for every file.
- **Explainable scoring** — every factor shows its score, weight, weighted contribution
  and the measured details behind it.
- **Export** — Markdown (human-readable survey report) or JSON (full breakdown).
- **MCP tool server** — the same engine over JSON-RPC 2.0, so an agent gets identical results.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. **No environment variables are required.** Without
`NC_DATA_DIR`, development writes to `./.nc-data`; production falls back to an in-memory
adapter so a fresh clone or a build never fails on missing config.

To pin storage to a specific directory:

```bash
NC_DATA_DIR=/var/lib/neural-cartographer npm start
```

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/codebases` | List surveys with latest analysis |
| `POST` | `/api/codebases` | Create a survey |
| `GET` | `/api/codebases/:id` | Survey + file breakdown + history |
| `PATCH` | `/api/codebases/:id` | Update name, description or files |
| `DELETE` | `/api/codebases/:id` | Delete a survey and its analyses |
| `POST` | `/api/codebases/:id/analyze` | Run the engine, persist the result |
| `GET` | `/api/codebases/:id/export?format=markdown\|json` | Export the latest analysis |
| `POST` | `/api/mcp` | JSON-RPC 2.0 MCP endpoint |
| `GET` | `/api/mcp` | Endpoint description and tool names |

All inputs are validated with zod; errors return `{ "error": string, "issues"?: [...] }`.

### MCP

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Tools:

- `analyze_codebase` — pass `codebaseId` to score a stored survey, or inline `files` to
  create and score one in a single call.
- `list_codebases` — every survey with its current score.
- `get_analysis` — full factor breakdown by `analysisId` or latest-for-`codebaseId`.
- `export_analysis` — Markdown or JSON.

Supports JSON-RPC batches; `notifications/*` produce no response, per spec.

## Storage

`src/lib/store.ts` exposes one `Store` interface with two adapters:

- **filesystem** — a single JSON document written atomically via temp file + rename.
  Active in development, or whenever `NC_DATA_DIR` is set.
- **memory** — in-process, used in production when `NC_DATA_DIR` is unset. Never throws.

Both are validated on read, so a corrupted data file fails loudly instead of silently
returning junk.

## Scripts

```bash
npm run dev         # dev server
npm run typecheck   # tsc --noEmit
npm run build       # production build
npm start           # serve the production build
npm run lint        # eslint
```

## Layout

```
src/
  app/
    layout.tsx          metadata + shell
    page.tsx            server component, loads survey summaries
    api/                codebases CRUD, analyze, export, mcp
  components/
    Atlas.tsx           client workspace (CRUD, editor, results)
    ScoreGauge.tsx      SVG gauge + factor bars
    Compass.tsx         cartographic motif
  lib/
    engine.ts           the deterministic scorer
    store.ts            storage adapters
    validation.ts       zod schemas, response schemas, MCP tool schemas
    breakdown.ts        per-file metrics
    export.ts           Markdown / JSON rendering
    sample.ts           sample survey payload
    http.ts             error handling + validated body parsing
```

## License

MIT
