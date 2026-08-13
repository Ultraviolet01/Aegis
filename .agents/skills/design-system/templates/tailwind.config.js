// {{BRAND}}: Tailwind config (v3 style). Maps Tailwind utilities to the CSS
// variables in tokens.css, so tokens.css stays the single source of truth.
// Tailwind v4: prefer an @theme block in CSS; the same token names apply.
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: "var(--brand)",
        accent: "var(--accent)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        base: "var(--bg-base)",
        surface: "var(--surface)",
        ink: "var(--text)",
        muted: "var(--text-secondary)",
        separator: "var(--separator)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-body)"],
      },
      borderRadius: {
        control: "var(--radius-control)",
        card: "var(--radius-card)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        sm: "var(--shadow-sm)",
      },
      spacing: {
        // base-8 scale also available as Tailwind defaults; these mirror tokens
        22: "90px",
        28: "112px",
      },
      maxWidth: { container: "var(--container-max)" },
      transitionTimingFunction: {
        out: "cubic-bezier(0.32, 0.72, 0, 1)",
        spring: "cubic-bezier(0.34, 1.3, 0.4, 1)",
        "in-out": "cubic-bezier(0.65, 0, 0.35, 1)",
      },
    },
  },
  plugins: [],
};
