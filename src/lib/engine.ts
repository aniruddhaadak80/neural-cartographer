import { AnalysisFactor, AnalysisResult, Codebase } from "./types";

const ENGINE_VERSION = "1.0.0";

function calculateComplexity(files: { content: string; language: string }[]): number {
  let totalComplexity = 0;
  let fileCount = 0;

  for (const file of files) {
    const content = file.content;
    const lines = content.split("\n");
    let fileComplexity = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.includes("if (") ||
        trimmed.includes("else if") ||
        trimmed.includes("switch") ||
        trimmed.includes("case ") ||
        trimmed.includes("for (") ||
        trimmed.includes("while (") ||
        trimmed.includes("catch") ||
        trimmed.includes("?") ||
        trimmed.includes("&&") ||
        trimmed.includes("||")
      ) {
        fileComplexity++;
      }
    }

    const avgLineLength = lines.reduce((sum, l) => sum + l.length, 0) / Math.max(lines.length, 1);
    if (avgLineLength > 80) fileComplexity += 2;
    if (avgLineLength > 120) fileComplexity += 3;

    totalComplexity += fileComplexity;
    fileCount++;
  }

  if (fileCount === 0) return 0;
  const avgComplexity = totalComplexity / fileCount;
  return Math.min(100, Math.max(0, 100 - avgComplexity * 5));
}

function calculateStructure(files: { path: string; content: string }[]): number {
  const paths = files.map((f) => f.path);
  const hasIndex = paths.some((p) => p.includes("index") || p.includes("main") || p.includes("app"));
  const hasConfig = paths.some((p) => p.includes("config") || p.includes("package.json") || p.includes("tsconfig"));
  const hasTests = paths.some((p) => p.includes("test") || p.includes("spec") || p.includes("__tests__"));
  const hasReadme = paths.some((p) => p.toLowerCase().includes("readme"));
  const hasTypes = paths.some((p) => p.includes("types") || p.includes("interfaces") || p.endsWith(".d.ts"));

  const dirs = new Set(paths.map((p) => p.split("/").slice(0, -1).join("/")));
  const hasGoodDirStructure = dirs.size > 1;

  let score = 0;
  if (hasIndex) score += 20;
  if (hasConfig) score += 15;
  if (hasTests) score += 25;
  if (hasReadme) score += 15;
  if (hasTypes) score += 15;
  if (hasGoodDirStructure) score += 10;

  return Math.min(100, score);
}

function calculateDocumentation(files: { content: string; language: string }[]): number {
  let docLines = 0;
  let totalLines = 0;

  for (const file of files) {
    const lines = file.content.split("\n");
    totalLines += lines.length;

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/**") ||
        trimmed.startsWith("*/") ||
        trimmed.startsWith("#") ||
        trimmed.startsWith("///")
      ) {
        docLines++;
      }
    }
  }

  if (totalLines === 0) return 0;
  const ratio = docLines / totalLines;
  return Math.min(100, Math.round(ratio * 200));
}

function calculateNaming(files: { content: string; language: string }[]): number {
  let goodNames = 0;
  let totalNames = 0;

  for (const file of files) {
    const content = file.content;
    const functionMatches = content.match(/(?:function|const|let|var|class|interface|type|enum)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
    if (functionMatches) {
      for (const match of functionMatches) {
        const name = match.split(/\s+/)[1];
        totalNames++;
        if (name.length > 2 && name.length < 30) {
          if (/^[a-z][a-zA-Z0-9]*$/.test(name) || /^[A-Z][a-zA-Z0-9]*$/.test(name) || /^[a-z][a-zA-Z0-9]*_[a-zA-Z0-9]*$/.test(name)) {
            goodNames++;
          }
        }
      }
    }
  }

  if (totalNames === 0) return 50;
  return Math.round((goodNames / totalNames) * 100);
}

function calculateConsistency(files: { content: string; language: string }[]): number {
  if (files.length === 0) return 50;

  const indentations = new Set();
  const quoteStyles = new Set();
  const semicolonUsage = { with: 0, without: 0 };

  for (const file of files) {
    const lines = file.content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      const indent = line.length - line.trimStart().length;
      if (indent > 0) indentations.add(indent);

      if (trimmed.includes('"')) quoteStyles.add("double");
      if (trimmed.includes("'")) quoteStyles.add("single");

      if (trimmed.endsWith(";")) semicolonUsage.with++;
      else if (trimmed.length > 0 && !trimmed.endsWith("{") && !trimmed.endsWith("}") && !trimmed.endsWith(",")) {
        semicolonUsage.without++;
      }
    }
  }

  let score = 100;

  if (indentations.size > 2) score -= 20;
  else if (indentations.size > 1) score -= 10;

  if (quoteStyles.size > 1) score -= 20;

  const totalSemicolons = semicolonUsage.with + semicolonUsage.without;
  if (totalSemicolons > 0) {
    const ratio = semicolonUsage.with / totalSemicolons;
    if (ratio > 0.1 && ratio < 0.9) score -= 20;
  }

  return Math.max(0, score);
}

function calculateModularity(files: { path: string; content: string }[]): number {
  if (files.length === 0) return 0;

  const sizes = files.map((f) => f.content.split("\n").length);
  const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  const maxSize = Math.max(...sizes);

  let score = 100;

  if (avgSize > 200) score -= 30;
  else if (avgSize > 100) score -= 15;

  if (maxSize > 500) score -= 30;
  else if (maxSize > 300) score -= 15;

  const dirs = new Set(files.map((f) => f.path.split("/").slice(0, -1).join("/")));
  if (dirs.size > 1) score += 10;

  return Math.min(100, Math.max(0, score));
}

function getGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "A-";
  if (score >= 75) return "B+";
  if (score >= 70) return "B";
  if (score >= 65) return "B-";
  if (score >= 60) return "C+";
  if (score >= 55) return "C";
  if (score >= 50) return "C-";
  if (score >= 40) return "D";
  return "F";
}

/** Factor scores are surfaced in the UI, Markdown and JSON, so keep them tidy. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function analyzeCodebase(codebase: Codebase): AnalysisResult {
  const factors: AnalysisFactor[] = [];

  const complexityScore = calculateComplexity(codebase.files);
  factors.push({
    name: "Complexity",
    score: round1(complexityScore),
    weight: 0.2,
    description: "Measures code complexity and nesting depth",
    details: [
      `Average file size: ${Math.round(codebase.files.reduce((s, f) => s + f.content.split("\n").length, 0) / codebase.files.length)} lines`,
      `Largest file: ${Math.max(...codebase.files.map((f) => f.content.split("\n").length))} lines`,
    ],
  });

  const structureScore = calculateStructure(codebase.files);
  factors.push({
    name: "Structure",
    score: round1(structureScore),
    weight: 0.25,
    description: "Evaluates project organization and file structure",
    details: [
      `Total files: ${codebase.files.length}`,
      `Directories: ${new Set(codebase.files.map((f) => f.path.split("/").slice(0, -1).join("/"))).size}`,
    ],
  });

  const documentationScore = calculateDocumentation(codebase.files);
  factors.push({
    name: "Documentation",
    score: round1(documentationScore),
    weight: 0.15,
    description: "Assesses code comments and documentation",
    details: [
      `Documentation ratio: ${documentationScore}%`,
    ],
  });

  const namingScore = calculateNaming(codebase.files);
  factors.push({
    name: "Naming",
    score: round1(namingScore),
    weight: 0.15,
    description: "Evaluates variable and function naming conventions",
    details: [],
  });

  const consistencyScore = calculateConsistency(codebase.files);
  factors.push({
    name: "Consistency",
    score: round1(consistencyScore),
    weight: 0.15,
    description: "Measures code style consistency",
    details: [],
  });

  const modularityScore = calculateModularity(codebase.files);
  factors.push({
    name: "Modularity",
    score: round1(modularityScore),
    weight: 0.1,
    description: "Assesses code organization and separation of concerns",
    details: [],
  });

  const overallScore = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  );

  const recommendations: string[] = [];
  if (complexityScore < 60) recommendations.push("Consider breaking down complex functions into smaller, more manageable pieces");
  if (structureScore < 60) recommendations.push("Improve project organization with clearer directory structure");
  if (documentationScore < 50) recommendations.push("Add more comments and documentation to explain complex logic");
  if (namingScore < 60) recommendations.push("Use more descriptive and consistent naming conventions");
  if (consistencyScore < 60) recommendations.push("Establish and follow a consistent code style guide");
  if (modularityScore < 60) recommendations.push("Separate concerns into distinct modules or files");

  if (recommendations.length === 0) {
    recommendations.push("Code quality is good! Continue maintaining these standards");
  }

  return {
    id: crypto.randomUUID(),
    codebaseId: codebase.id,
    overallScore,
    grade: getGrade(overallScore),
    factors,
    recommendations,
    summary: `Codebase scored ${overallScore}/100 (${getGrade(overallScore)}). ${factors.length} factors analyzed.`,
    analyzedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
  };
}
