/**
 * theme.ts — Single source of truth for design tokens (TypeScript mirror).
 *
 * These mirror the CSS custom properties declared in `app/globals.css` (@theme).
 * Use CSS/Tailwind utilities in components; import these values only when a token
 * is needed in TypeScript (e.g. Framer Motion, canvas, inline Recharts colors).
 */

export const colors = {
  primary: "#f24822",
  primary600: "#d93c17",
  primary700: "#b53012",
  accent: "#ffb020",
  accent600: "#e89a12",
  fresh: "#23a55a",
  fresh600: "#1c8b4b",
  ink: "#1b1512",
  body: "#6b6560",
  muted: "#948d85",
  surface: "#ffffff",
  surfaceMuted: "#f7f4f1",
  dark: "#14100d",
  line: "#ece7e2",
  success: "#23a55a",
  warning: "#ffb020",
  danger: "#e2483d",
  rating: "#ffb020",
} as const;

export const radius = {
  field: "8px",
  card: "16px",
  panel: "28px",
  pill: "999px",
} as const;

export const shadow = {
  card: "0 10px 30px rgba(27, 21, 18, 0.08)",
  cardHover: "0 18px 44px rgba(27, 21, 18, 0.14)",
  menu: "0 12px 32px rgba(27, 21, 18, 0.12)",
} as const;

export const container = {
  max: "1320px",
} as const;

/** Tailwind default breakpoints (px), exposed for JS-side matchMedia logic. */
export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

/** Motion tokens shared between CSS and Framer Motion. */
export const motion = {
  ease: {
    out: [0.16, 1, 0.3, 1],
    inOut: [0.65, 0, 0.35, 1],
  },
  duration: {
    fast: 0.15,
    base: 0.25,
    slow: 0.5,
  },
} as const;

/** Palette for Recharts / data-viz series (accessible in light + dark). */
export const chartColors = [
  "#f24822",
  "#ffb020",
  "#23a55a",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
] as const;

export const theme = {
  colors,
  radius,
  shadow,
  container,
  breakpoints,
  motion,
  chartColors,
} as const;
export type Theme = typeof theme;
