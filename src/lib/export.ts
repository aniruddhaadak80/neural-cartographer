import { breakdownCodebase, rollupTotals } from "./breakdown";
import type { AnalysisResult, Codebase } from "./types";
import type { FileBreakdownResponse } from "./validation";

export type ExportFormat = "json" | "markdown";

export interface AnalysisExport {
  analysis: AnalysisResult;
  codebase: Pick<Codebase, "id" | "name" | "description">;
  files: FileBreakdownResponse[];
  exportedAt: string;
}

export function buildExport(
  analysis: AnalysisResult,
  codebase: Codebase
): AnalysisExport {
  return {
    analysis,
    codebase: {
      id: codebase.id,
      name: codebase.name,
      description: codebase.description,
    },
    files: breakdownCodebase(codebase),
    exportedAt: new Date().toISOString(),
  };
}

function contribution(factor: AnalysisResult["factors"][number]): number {
  return factor.score * factor.weight;
}

function bar(value: number, width = 20): string {
  const filled = Math.round((Math.min(100, Math.max(0, value)) / 100) * width);
  return "#".repeat(filled) + ".".repeat(width - filled);
}

export function toMarkdown(
  analysis: AnalysisResult,
  codebase: Codebase
): string {
  const data = buildExport(analysis, codebase);
  const totals = rollupTotals(data.files);
  const lines: string[] = [];

  lines.push(`# Survey: ${codebase.name}`);
  lines.push("");
  if (codebase.description) {
    lines.push(`> ${codebase.description}`);
    lines.push("");
  }
  lines.push(
    `**Grade ${analysis.grade} — ${analysis.overallScore}/100** ` +
      `(engine ${analysis.engineVersion}, analyzed ${analysis.analyzedAt})`
  );
  lines.push("");
  lines.push(
    `${totals.files} files · ${totals.lines} lines · ${totals.codeLines} code lines · ` +
      `${totals.commentLines} comment lines · ${totals.branchPoints} branch points`
  );
  lines.push("");

  lines.push("## Factor breakdown");
  lines.push("");
  lines.push("| Factor | Score | Weight | Contribution | Gauge |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const factor of analysis.factors) {
    lines.push(
      `| ${factor.name} | ${factor.score} | ${factor.weight.toFixed(2)} | ` +
        `${contribution(factor).toFixed(2)} | \`${bar(factor.score, 10)}\` |`
    );
  }
  const weightTotal = analysis.factors.reduce((sum, f) => sum + f.weight, 0);
  const scoreTotal = analysis.factors.reduce((sum, f) => sum + contribution(f), 0);
  lines.push(
    `| **Total** | — | **${weightTotal.toFixed(2)}** | **${scoreTotal.toFixed(2)}** | — |`
  );
  lines.push("");

  lines.push("## Factor detail");
  lines.push("");
  for (const factor of analysis.factors) {
    lines.push(`### ${factor.name} — ${factor.score}/100 (weight ${factor.weight})`);
    lines.push("");
    lines.push(factor.description);
    if (factor.details.length > 0) {
      lines.push("");
      for (const detail of factor.details) lines.push(`- ${detail}`);
    }
    lines.push("");
  }

  lines.push("## Recommendations");
  lines.push("");
  analysis.recommendations.forEach((recommendation, index) => {
    lines.push(`${index + 1}. ${recommendation}`);
  });
  lines.push("");

  lines.push("## File breakdown");
  lines.push("");
  lines.push("| File | Language | Lines | Comments | Branches | Complexity |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const file of data.files) {
    lines.push(
      `| \`${file.path}\` | ${file.language} | ${file.lines} | ${file.commentLines} (${file.docRatio}%) | ` +
        `${file.branchPoints} | ${file.complexityScore} |`
    );
  }
  lines.push("");

  lines.push("## How the overall score was reached");
  lines.push("");
  const terms = analysis.factors
    .map((factor) => `\`${factor.score} x ${factor.weight}\``)
    .join(" + ");
  lines.push(`${terms} = ${scoreTotal.toFixed(2)} -> rounded to ${analysis.overallScore}/100.`);
  lines.push("");
  lines.push(`A grade of **${analysis.grade}** is assigned to a score of ${analysis.overallScore}.`);
  lines.push("");

  return lines.join("\n");
}

export function toJson(analysis: AnalysisResult, codebase: Codebase): string {
  return JSON.stringify(buildExport(analysis, codebase), null, 2);
}
