import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1a1a2e",
        paper: "#f5ede0",
        cream: "#fff8f0",
        clay: "#e07856",
        clayDark: "#b85538",
        clayLight: "#f4a488",
        electric: "#00f5ff",
        gold: "#ffd700",
        violet: "#8b5cf6",
        emerald: "#34d399",
        crimson: "#dc2626",
      },
      fontFamily: {
        marker: ['"Permanent Marker"', '"Comic Sans MS"', "cursive"],
        sans: ['"Segoe UI"', "system-ui", "sans-serif"],
        mono: ['"Courier New"', "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
