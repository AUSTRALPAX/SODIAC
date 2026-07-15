import type { Config } from "tailwindcss";

// Tokens definidos en docs/DESIGN_SYSTEM.md — no modificar sin actualizar ese documento.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#090B0D",
        "background-deep": "#050607",
        surface: "#111418",
        "surface-elevated": "#171B20",
        "surface-hover": "#1C2228",
        border: "#293037",
        "border-subtle": "#1D2328",
        "text-primary": "#F4F7F8",
        "text-secondary": "#A5AEB5",
        "text-muted": "#6F7980",
        accent: "#00D6C5",
        "accent-bright": "#16F1DD",
        "accent-dark": "#087F78",
        "atmosphere-purple": "#25192B",
        "atmosphere-blue": "#0B285E",
        success: "#43D69A",
        warning: "#E6B85C",
        danger: "#FF6B72",
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        sans: ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "8px",
        sm: "6px",
        lg: "10px",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
