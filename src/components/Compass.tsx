"use client";

import { motion } from "framer-motion";

/** Decorative compass rose used as the page's cartographic motif. */
export function Compass({ className = "" }: { className?: string }) {
  const rays = Array.from({ length: 16 }, (_, i) => (i * Math.PI * 2) / 16);
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <circle cx="100" cy="100" r="92" fill="#fff8f0" stroke="#1a1a2e" strokeWidth="3" />
      <circle cx="100" cy="100" r="78" fill="none" stroke="#1a1a2e" strokeWidth="1" strokeDasharray="4 5" />
      {rays.map((angle, i) => {
        const long = i % 4 === 0;
        const r1 = 34;
        const r2 = long ? 78 : 60;
        const x1 = 100 + Math.cos(angle) * r1;
        const y1 = 100 + Math.sin(angle) * r1;
        const x2 = 100 + Math.cos(angle) * r2;
        const y2 = 100 + Math.sin(angle) * r2;
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#1a1a2e"
            strokeWidth={long ? 3 : 1}
          />
        );
      })}
      <motion.polygon
        points="100,28 110,100 100,112 90,100"
        fill="#e07856"
        stroke="#1a1a2e"
        strokeWidth="2"
        initial={{ rotate: -8 }}
        animate={{ rotate: [0, 6, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "100px 100px" }}
      />
      <circle cx="100" cy="100" r="7" fill="#1a1a2e" />
      <text x="100" y="18" textAnchor="middle" fontSize="13" fontWeight="800" fill="#1a1a2e">
        N
      </text>
    </svg>
  );
}
