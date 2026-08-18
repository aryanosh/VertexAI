import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#fff4f0",
          100: "#ffe4d8",
          200: "#ffc4aa",
          300: "#ff9a75",
          400: "#ff6b3d",
          500: "#f04e1f",
          600: "#d93c10",
          700: "#b52e0c",
          800: "#912410",
          900: "#782013",
        },
        surface: {
          900: "#0a0b0f",
          800: "#111318",
          700: "#191c24",
          600: "#21262f",
          500: "#2a303c",
          400: "#363d4d",
          300: "#4a5368",
        },
        health:  { DEFAULT: "#22c55e", dim: "#15803d" },
        threat:  { DEFAULT: "#ef4444", dim: "#991b1b" },
        critical:{ DEFAULT: "#f97316", dim: "#c2410c" },
        ai:      { DEFAULT: "#06b6d4", dim: "#0e7490" },
        accent:  { DEFAULT: "#8b5cf6", dim: "#6d28d9" },
        muted:   "#6b7280",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        card: "0 0 0 1px rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.4)",
        glow: "0 0 20px rgba(240,78,31,0.25)",
        "glow-teal": "0 0 20px rgba(6,182,212,0.2)",
      },
    },
  },
  plugins: [],
};
export default config;
