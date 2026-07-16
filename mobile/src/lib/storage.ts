import { createMMKV } from "react-native-mmkv"
import { createJSONStorage } from "zustand/middleware"

/** Fast key-value persistence for Zustand and UI state (plan.md §0.2). */
export const storage = createMMKV({ id: "superapp" })

const mmkvStorageAdapter = {
  getItem: (name: string) => storage.getString(name) ?? null,
  setItem: (name: string, value: string) => storage.set(name, value),
  removeItem: (name: string) => storage.remove(name), // <-- Changed .delete to .remove
}

export const zustandStorage = createJSONStorage(() => mmkvStorageAdapter)
