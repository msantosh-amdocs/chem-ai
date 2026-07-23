/** @type {import('tailwindcss').Config} */
const HUES = [
  "indigo", "amber", "teal", "rose", "emerald", "violet", "cyan", "orange", "slate",
];
const SAFELIST = HUES.flatMap((h) => [
  `text-${h}-700`,
  `bg-${h}-50`,
  `border-${h}-200`,
  `bg-${h}-500`,
  `ring-${h}-200`,
  `stroke-${h}-500`,
  `border-l-${h}-200`,
  `border-t-${h}-200`,
]);

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  safelist: SAFELIST,
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: [
          "'Fraunces'",
          "'Playfair Display'",
          "Georgia",
          "serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.06)",
        pop: "0 10px 30px rgba(15, 23, 42, 0.12)",
      },
    },
  },
  plugins: [],
};
