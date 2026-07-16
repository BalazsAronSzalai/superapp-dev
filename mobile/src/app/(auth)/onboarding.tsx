import { useRef, useState } from "react"
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useRouter } from "expo-router"
import {
  CalendarDays,
  LayoutGrid,
  Mail,
  NotebookPen,
  SquareCheckBig,
  Wallet,
} from "lucide-react-native"

import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/lib/auth/store"
import { radius, spacing, typography, useAppTheme } from "@/theme"

const slides = [
  {
    key: "all-in-one",
    icon: LayoutGrid,
    title: "Everything in one place",
    body: "Mail, tasks, calendar, notes and finances — five apps' worth of daily life, in one superapp.",
  },
  {
    key: "stay-on-top",
    icon: Mail,
    title: "Stay on top of your inbox",
    body: "A fast, threaded inbox with snooze, send later and swipe actions that keep you at inbox zero.",
  },
  {
    key: "organized",
    icon: SquareCheckBig,
    title: "Organized, effortlessly",
    body: "Tasks flow into your calendar, notes link to projects, and spending turns into budgets — automatically.",
  },
] as const

export default function OnboardingScreen() {
  const { colors } = useAppTheme()
  const { width } = useWindowDimensions()
  const router = useRouter()
  const setHasOnboarded = useAuthStore((s) => s.setHasOnboarded)
  const [index, setIndex] = useState(0)
  const listRef = useRef<FlatList>(null)

  const finish = () => {
    setHasOnboarded(true)
    router.replace("/login")
  }

  const next = () => {
    if (index < slides.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true })
    } else {
      finish()
    }
  }

  const renderSlide = ({ item }: ListRenderItemInfo<(typeof slides)[number]>) => {
    const Icon = item.icon
    return (
      <View style={[styles.slide, { width }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.accentMuted }]}>
          <Icon color={colors.accent} size={44} strokeWidth={1.75} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{item.body}</Text>
      </View>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.moduleRow}>
        {[Mail, SquareCheckBig, CalendarDays, NotebookPen, Wallet].map((Icon, i) => (
          <View
            key={i}
            style={[styles.moduleIcon, { backgroundColor: colors.surfaceSecondary }]}
          >
            <Icon color={colors.textSecondary} size={18} strokeWidth={1.75} />
          </View>
        ))}
      </View>

      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(s) => s.key}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
        }
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View
              key={s.key}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? colors.accent : colors.separator,
                  width: i === index ? 20 : 8,
                },
              ]}
            />
          ))}
        </View>
        <Button title={index === slides.length - 1 ? "Get started" : "Continue"} onPress={next} />
        <Button title="Skip" variant="ghost" onPress={finish} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  moduleRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  moduleIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  slide: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.title1.fontSize,
    lineHeight: typography.title1.lineHeight,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    textAlign: "center",
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
})
