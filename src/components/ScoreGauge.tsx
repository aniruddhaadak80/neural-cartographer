"use client";

import { motion } from "framer-motion";

function bandColor(score: number): string {
  if (score >= 80) return "#34d399";
  if (score >= 65) return "#00f5ff";
  if (score >= 50) return "#ffd700";
  if (score >= 35) return "#e07856";
  return "#dc2626";
}

/** Radial gauge for the overall survey score. */
export function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const radius = 78;
  const circumference = Math.PI * radius; // half circle
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);
  const color = bandColor(clamped);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 116" className="w-full max-w-[220px]" role="img" aria-label={`Overall score ${score} out of 100, grade ${grade}`}>
        <path
          d={`M 22 100 A ${radius} ${radius} 0 0 1 178 100`}
          fill="none"
          stroke="#1a1a2e"
          strokeWidth="14"
          strokeLinecap="round"
          opacity="0.12"
        />
        <motion.path
          d={`M 22 100 A ${radius} ${radius} 0 0 1 178 100`}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
        <text
          x="100"
          y="92"
          textAnchor="middle"
          fontSize="44"
          fontWeight="900"
          fill="#1a1a2e"
          fontFamily="Courier New, monospace"
        >
          {score}
        </text>
        <text
          x="100"
          y="112"
          textAnchor="middle"
          fontSize="12"
          fontWeight="800"
          fill="#1a1a2e"
          letterSpacing="2"
        >
          GRADE {grade}
        </text>
      </svg>
    </div>
  );
}

/** A single factor row: score bar, weight, and weighted contribution. */
export function FactorBar({
  name,
  score,
  weight,
  description,
  details,
}: {
  name: string;
  score: number;
  weight: number;
  description: string;
  details: string[];
}) {
  const contribution = score * weight;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-2 border-ink bg-cream p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-black uppercase tracking-wide">{name}</h4>
        <span className="font-mono text-xs">
          {score}/100 · w {weight.toFixed(2)} · +{contribution.toFixed(2)}
        </span>
      </div>
      <div
        className="mt-2 h-4 w-full border-2 border-ink bg-paper"
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${name} score`}
      >
        <motion.div
          className="h-full"
          style={{ backgroundColor: bandColor(score) }}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink/80">{description}</p>
      {details.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-[11px] leading-relaxed text-ink/70">
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

export { bandColor };
