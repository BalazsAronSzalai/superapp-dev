import { memo, type ComponentType } from "react"
import { StyleSheet, View } from "react-native"

import { useAppTheme } from "@/theme"

/**
 * FlashList perf: `ItemSeparatorComponent` must be a *stable component type*.
 * Inline arrows (`ItemSeparatorComponent={() => <View … />}`) create a new
 * component type on every render, forcing FlashList to unmount and remount
 * every separator. This factory returns a memoized separator per inset value,
 * cached at module scope, so the component identity never changes.
 *
 * Usage (module scope, outside the screen component):
 *   const Separator = getListSeparator(26)
 *   …
 *   <FlashList ItemSeparatorComponent={Separator} … />
 */
const cache = new Map<number, ComponentType>()

export function getListSeparator(inset = 0): ComponentType {
  let Separator = cache.get(inset)
  if (!Separator) {
    Separator = memo(function ListSeparator() {
      const { colors } = useAppTheme()
      return (
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            marginLeft: inset,
            backgroundColor: colors.separator,
          }}
        />
      )
    })
    cache.set(inset, Separator)
  }
  return Separator
}
