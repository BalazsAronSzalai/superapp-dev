import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useColorScheme } from "react-native"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { zustandStorage } from "@/lib/storage"
import { palette, type ThemeColors } from "./tokens"

export { spacing, radius, typography, fonts, palette } from "./tokens"
export type { ThemeColors, ColorToken, TypographyToken } from "./tokens"

type ThemePreference = "system" | "light" | "dark"

interface ThemePreferenceState {
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
}

export const useThemePreference = create<ThemePreferenceState>()(
  persist(
    (set) => ({
      preference: "system",
      setPreference: (preference) => set({ preference }),
    }),
    { name: "theme-preference", storage: zustandStorage },
  ),
)

interface ThemeContextValue {
  colors: ThemeColors
  scheme: "light" | "dark"
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: palette.light,
  scheme: "light",
})

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme()
  const preference = useThemePreference((s) => s.preference)

  const scheme: "light" | "dark" =
    preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference

  const value = useMemo<ThemeContextValue>(
    () => ({ colors: palette[scheme], scheme }),
    [scheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useAppTheme() {
  return useContext(ThemeContext)
}
