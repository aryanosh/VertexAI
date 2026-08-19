import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background, #f4f5f7)",
        foreground: "var(--foreground, #1e232b)",
        brand: {
          DEFAULT: "var(--brand, #e8613c)",
          foreground: "var(--brand-foreground, #ffffff)",
          soft: "var(--brand-soft, #fbe6dd)",
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
        health:   { DEFAULT: "#22c55e", dim: "#15803d" },
        threat:   { DEFAULT: "#ef4444", dim: "#991b1b" },
        critical: { DEFAULT: "#f97316", dim: "#c2410c" },
        ai:       { DEFAULT: "#06b6d4", dim: "#0e7490" },
        card: {
          DEFAULT: "var(--card, #ffffff)",
          foreground: "var(--card-foreground, #1e232b)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
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
  plugins: [require("tailwindcss-animate")],
};

export default config;
