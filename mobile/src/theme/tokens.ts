import { Platform } from "react-native"

/**
 * Design tokens — Apple-inspired minimal (plan.md §0.4).
 * Neutral palette + one accent color, 8px spacing grid, dark/light mode.
 */

export const palette = {
  light: {
    background: "#FFFFFF",
    backgroundSecondary: "#F2F2F7",
    surface: "#FFFFFF",
    surfaceSecondary: "#F2F2F7",
    text: "#000000",
    textSecondary: "#3C3C43",
    textTertiary: "#8E8E93",
    separator: "#E5E5EA",
    accent: "#007AFF",
    accentMuted: "#E5F1FF",
    destructive: "#FF3B30",
    success: "#34C759",
    warning: "#FF9500",
  },
  dark: {
    background: "#000000",
    backgroundSecondary: "#1C1C1E",
    surface: "#1C1C1E",
    surfaceSecondary: "#2C2C2E",
    text: "#FFFFFF",
    textSecondary: "#EBEBF5",
    textTertiary: "#8E8E93",
    separator: "#38383A",
    accent: "#0A84FF",
    accentMuted: "#0A2540",
    destructive: "#FF453A",
    success: "#30D158",
    warning: "#FF9F0A",
  },
} as const

export type ThemeColors = typeof palette.light
export type ColorToken = keyof ThemeColors

/** 8px spacing grid */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const

export const fonts = Platform.select({
  ios: {
    sans: "system-ui",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "sans-serif",
    rounded: "sans-serif",
    mono: "monospace",
  },
})

export const typography = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "700" },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: "600" },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 22, fontWeight: "400" },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: "400" },
  subheadline: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" },
} as const

export type TypographyToken = keyof typeof typography
