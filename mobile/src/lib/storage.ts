import { MMKV } from "react-native-mmkv"
import { createJSONStorage } from "zustand/middleware"

/** Fast key-value persistence for Zustand and UI state (plan.md §0.2). */
export const storage = new MMKV({ id: "superapp" })

const mmkvStorageAdapter = {
  getItem: (name: string) => storage.getString(name) ?? null,
  setItem: (name: string, value: string) => storage.set(name, value),
  removeItem: (name: string) => storage.delete(name),
}

export const zustandStorage = createJSONStorage(() => mmkvStorageAdapter)
