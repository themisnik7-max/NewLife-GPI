import type { Config } from "tailwindcss";

// Values copied verbatim from the "NewLife GPI Design System" claude.ai/design
// project (tokens/colors.css, tokens/typography.css, tokens/spacing.css).
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        aegean: {
          50: "#f1f8fc",
          100: "#e0eef8",
          200: "#bfdcef",
          300: "#92c3e2",
          400: "#5fa4d1",
          500: "#3684bb",
          600: "#2769a0",
          700: "#1f5480",
          800: "#1c4568",
          900: "#193a57",
        },
        flag: {
          50: "#eef2f8",
          100: "#d9e2ee",
          200: "#aec1dd",
          300: "#7f9dc8",
          400: "#4f74a9",
          500: "#2c5490",
          600: "#1c3f74",
          700: "#14315e",
          800: "#0d234a",
          900: "#081a38",
        },
        stone: {
          0: "#ffffff",
          25: "#fdfcfa",
          50: "#f8f6f2",
          100: "#f0ede6",
          200: "#e3ded3",
          300: "#d0c8b8",
          400: "#a99f8c",
          500: "#837a69",
          600: "#635c4e",
          700: "#4a453a",
          800: "#332f28",
          900: "#201d18",
        },
        olive: { 100: "#e7ecd7", 300: "#b8c98c", 500: "#7c9a4f", 700: "#5a7236" },
        sun: { 100: "#fdf1d6", 300: "#f6d888", 500: "#e7ad2e", 700: "#b3810f" },
        coral: { 100: "#fbe2df", 300: "#ec9d95", 500: "#d6543f", 700: "#a83a2a" },
        terracotta: { 100: "#f7e3d6", 300: "#e6a67c", 500: "#c9713f", 700: "#9c4f27" },
      },
      fontFamily: {
        display: ["Manrope", "-apple-system", "Segoe UI", "sans-serif"],
        body: ["Inter", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "16px",
        xl: "22px",
      },
      boxShadow: {
        xs: "0 1px 2px rgba(25, 58, 87, 0.06)",
        sm: "0 2px 6px rgba(25, 58, 87, 0.07)",
        md: "0 8px 24px rgba(25, 58, 87, 0.10)",
        lg: "0 16px 40px rgba(25, 58, 87, 0.14)",
      },
    },
  },
  plugins: [],
};

export default config;
