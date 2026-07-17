/** @type {import('tailwindcss').Config} */
// Tokens mirror src/styles/theme.ts (jlpt-preparation-app inspired flat style).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        text: "#333333",
        surface: "#f9f9f9",
        muted: "#e0e0e0",
        mutedHover: "#d1d1d1",
        primary: "#666b7a",
        accent: "#39d1b4",
        confirm: "#087f76",
        confirmHover: "#06655f",
        danger: "#b4232d",
        dangerHover: "#8f1d27",
      },
      borderRadius: {
        DEFAULT: "5px",
      },
      maxWidth: {
        content: "800px",
      },
    },
  },
  plugins: [],
};
