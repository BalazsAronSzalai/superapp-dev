import { StyleSheet } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import type { ComponentType } from "react"
import type { LucideProps } from "lucide-react-native"

import { EmptyState } from "@/components/ui/empty-state"
import { ScreenHeader } from "@/components/screen-header"
import { useAppTheme } from "@/theme"

interface ModulePlaceholderProps {
  title: string
  icon: ComponentType<LucideProps>
  phase: string
}

/** Placeholder for modules scheduled in later phases (plan.md Phases 3-6). */
export function ModulePlaceholder({ title, icon, phase }: ModulePlaceholderProps) {
  const { colors } = useAppTheme()

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScreenHeader title={title} />
      <EmptyState
        icon={icon}
        title={`${title} is coming soon`}
        description={`This module ships in ${phase} of the development plan.`}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
})
