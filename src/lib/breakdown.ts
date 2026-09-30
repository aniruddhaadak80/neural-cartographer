import type { Codebase } from "./types";
import { type FileBreakdownResponse, type CodeFileResponse } from "./validation";

/**
 * Per-file metrics used by the atlas, the export, and the MCP tools.
 * Every number here is derived directly from the file's own lines, using the
 * same rules the engine applies per file (branch keywords, line length, docs).
 */

const BRANCH_MARKERS = [
  "if (",
  "else if",
  "switch",
  "case ",
  "for (",
  "while (",
  "catch",
  "?",
  "&&",
  "||",
] as const;

const COMMENT_PREFIXES = ["//", "/*", "*", "/**", "*/", "#", "///"] as const;

function isComment(trimmed: string): boolean {
  return COMMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function countBranches(trimmed: string): number {
  let count = 0;
  for (const marker of BRANCH_MARKERS) {
    if (trimmed.includes(marker)) count += 1;
  }
  return count;
}

export function breakdownFile(file: CodeFileResponse): FileBreakdownResponse {
  const lines = file.content.split("\n");
  const trimmedLines = lines.map((line) => line.trim());

  let commentLines = 0;
  let branchPoints = 0;
  let longLines = 0;
  let maxLineLength = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = trimmedLines[index];
    if (isComment(trimmed)) commentLines += 1;
    branchPoints += countBranches(trimmed);
    if (raw.length > 100) longLines += 1;
    if (raw.length > maxLineLength) maxLineLength = raw.length;
  }

  const codeLines = Math.max(lines.length - commentLines, 0);
  const docRatio = lines.length === 0 ? 0 : Math.round((commentLines / lines.length) * 100);

  // Same shape as the engine's complexity term, applied to a single file.
  let complexity = branchPoints;
  if (maxLineLength > 120) complexity += 3;
  else if (maxLineLength > 80) complexity += 2;
  const complexityScore = Math.min(100, Math.max(0, 100 - complexity * 5));

  const notes: string[] = [];
  if (lines.length > 300) notes.push(`${lines.length} lines — consider splitting this sheet`);
  if (branchPoints >= 12) notes.push(`${branchPoints} branch points — deeply nested control flow`);
  if (docRatio < 10) notes.push(`Only ${docRatio}% of lines are commented`);
  if (longLines > 0) notes.push(`${longLines} line(s) exceed 100 characters`);
  if (lines.length > 0 && commentLines === 0) notes.push("No comments at all");
  if (notes.length === 0) notes.push("No structural warnings");

  return {
    path: file.path,
    language: file.language,
    size: file.size,
    lines: lines.length,
    codeLines,
    commentLines,
    branchPoints,
    longLines,
    maxLineLength,
    docRatio,
    complexityScore,
    notes,
  };
}

export function breakdownCodebase(codebase: Codebase): FileBreakdownResponse[] {
  return codebase.files.map((file) => breakdownFile(file));
}

export function rollupTotals(breakdown: FileBreakdownResponse[]): {
  files: number;
  lines: number;
  codeLines: number;
  commentLines: number;
  branchPoints: number;
} {
  return breakdown.reduce(
    (acc, entry) => ({
      files: acc.files + 1,
      lines: acc.lines + entry.lines,
      codeLines: acc.codeLines + entry.codeLines,
      commentLines: acc.commentLines + entry.commentLines,
      branchPoints: acc.branchPoints + entry.branchPoints,
    }),
    { files: 0, lines: 0, codeLines: 0, commentLines: 0, branchPoints: 0 }
  );
}
