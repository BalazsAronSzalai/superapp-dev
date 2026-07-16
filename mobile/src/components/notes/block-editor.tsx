// Block-based note editor — v1 rich content (plan.md Phase 5).
// Supports paragraphs, headings, bullets, and checklists. Inline marks
// (bold/italic) are deferred to the 10tap/TipTap editor evaluation.
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react"
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native"
import {
  Check,
  CheckSquare,
  Heading as HeadingIcon,
  List,
  Type,
  type LucideProps,
} from "lucide-react-native"

import type { NoteBlock, NoteBlockType, NoteDoc } from "@/lib/schemas/note.schemas"
import { radius, spacing, typography, useAppTheme } from "@/theme"

/** Client-generated stable block id (schema allows any 1–64 char string). */
export function newBlockId(): string {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export function emptyParagraph(): NoteBlock {
  return { id: newBlockId(), type: "paragraph", text: "" }
}

const TOOLBAR: { type: NoteBlockType; label: string; icon: ComponentType<LucideProps> }[] = [
  { type: "paragraph", label: "Text", icon: Type },
  { type: "heading", label: "Heading", icon: HeadingIcon },
  { type: "bullet", label: "List", icon: List },
  { type: "checklist", label: "Checklist", icon: CheckSquare },
]

interface BlockEditorProps {
  doc: NoteDoc
  onChange: (doc: NoteDoc) => void
}

export function BlockEditor({ doc, onChange }: BlockEditorProps) {
  const { colors } = useAppTheme()

  const blocks = doc.content
  const inputRefs = useRef<Map<string, TextInput>>(new Map())
  const [focusedId, setFocusedId] = useState<string | null>(null)
  /** Block to focus after the next render (set on split/merge). */
  const pendingFocus = useRef<string | null>(null)

  useEffect(() => {
    if (pendingFocus.current) {
      const input = inputRefs.current.get(pendingFocus.current)
      pendingFocus.current = null
      input?.focus()
    }
  }, [blocks])

  const setBlocks = useCallback(
    (content: NoteBlock[]) => onChange({ type: "doc", content }),
    [onChange],
  )

  const updateBlock = useCallback(
    (id: string, patch: Partial<NoteBlock>) => {
      setBlocks(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)))
    },
    [blocks, setBlocks],
  )

  /** Newlines split the block: text after "\n" moves into a new block below. */
  const handleTextChange = useCallback(
    (id: string, text: string) => {
      if (!text.includes("\n")) {
        updateBlock(id, { text })
        return
      }
      const index = blocks.findIndex((b) => b.id === id)
      if (index < 0) return
      const block = blocks[index]
      const [head, ...rest] = text.split("\n")
      // Continue lists/checklists onto the next line; headings fall back to text.
      const nextType: NoteBlockType =
        block.type === "bullet" || block.type === "checklist" ? block.type : "paragraph"
      const next: NoteBlock = {
        id: newBlockId(),
        type: nextType,
        text: rest.join("\n"),
        ...(nextType === "checklist" ? { checked: false } : null),
      }
      const updated = [...blocks]
      updated[index] = { ...block, text: head }
      updated.splice(index + 1, 0, next)
      pendingFocus.current = next.id
      setBlocks(updated)
    },
    [blocks, setBlocks, updateBlock],
  )

  /** Backspace on an empty block removes it and focuses the previous one. */
  const handleKeyPress = useCallback(
    (id: string, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (e.nativeEvent.key !== "Backspace") return
      const index = blocks.findIndex((b) => b.id === id)
      if (index <= 0) return
      const block = blocks[index]
      if (block.text.length > 0) return
      const previous = blocks[index - 1]
      pendingFocus.current = previous.id
      setBlocks(blocks.filter((b) => b.id !== id))
    },
    [blocks, setBlocks],
  )

  const setFocusedType = useCallback(
    (type: NoteBlockType) => {
      if (!focusedId) return
      const block = blocks.find((b) => b.id === focusedId)
      if (!block || block.type === type) return
      updateBlock(focusedId, {
        type,
        level: type === "heading" ? 1 : undefined,
        checked: type === "checklist" ? (block.checked ?? false) : undefined,
      })
    },
    [blocks, focusedId, updateBlock],
  )

  const focusedType = blocks.find((b) => b.id === focusedId)?.type

  return (
    <View style={styles.editor}>
      <View style={styles.blocks}>
        {blocks.map((block) => (
          <View key={block.id} style={styles.blockRow}>
            {block.type === "bullet" ? (
              <Text style={[styles.bulletDot, { color: colors.textSecondary }]}>{"\u2022"}</Text>
            ) : null}
            {block.type === "checklist" ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: block.checked ?? false }}
                accessibilityLabel={block.checked ? "Mark unchecked" : "Mark checked"}
                hitSlop={8}
                onPress={() => updateBlock(block.id, { checked: !block.checked })}
                style={[
                  styles.checkbox,
                  {
                    borderColor: block.checked ? colors.accent : colors.separator,
                    backgroundColor: block.checked ? colors.accent : "transparent",
                  },
                ]}
              >
                {block.checked ? <Check color="#FFFFFF" size={13} strokeWidth={3} /> : null}
              </Pressable>
            ) : null}
            <TextInput
              ref={(input) => {
                if (input) inputRefs.current.set(block.id, input)
                else inputRefs.current.delete(block.id)
              }}
              value={block.text}
              onChangeText={(text) => handleTextChange(block.id, text)}
              onKeyPress={(e) => handleKeyPress(block.id, e)}
              onFocus={() => setFocusedId(block.id)}
              multiline
              placeholder={block.type === "heading" ? "Heading" : "Write something…"}
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel={`${block.type} block`}
              style={[
                styles.blockInput,
                block.type === "heading" ? styles.headingInput : null,
                {
                  color:
                    block.type === "checklist" && block.checked
                      ? colors.textTertiary
                      : colors.text,
                  textDecorationLine:
                    block.type === "checklist" && block.checked ? "line-through" : "none",
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Block-type toolbar (applies to the focused block). */}
      <View style={[styles.toolbar, { borderTopColor: colors.separator }]}>
        {TOOLBAR.map(({ type, label, icon: Icon }) => {
          const active = focusedType === type
          return (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Format as ${label}`}
              onPress={() => setFocusedType(type)}
              style={[
                styles.toolButton,
                { backgroundColor: active ? colors.accentMuted : "transparent" },
              ]}
            >
              <Icon
                color={active ? colors.accent : colors.textSecondary}
                size={18}
                strokeWidth={2}
              />
              <Text
                style={[
                  styles.toolLabel,
                  { color: active ? colors.accent : colors.textSecondary },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  editor: {
    gap: spacing.sm,
  },
  blocks: {
    gap: 2,
  },
  blockRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  bulletDot: {
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    paddingTop: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: radius.sm - 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 7,
  },
  blockInput: {
    flex: 1,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    paddingVertical: 6,
    padding: 0,
    textAlignVertical: "top",
  },
  headingInput: {
    fontSize: typography.title3.fontSize,
    lineHeight: typography.title3.lineHeight,
    fontWeight: "600",
  },
  toolbar: {
    flexDirection: "row",
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  toolButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  toolLabel: {
    fontSize: typography.caption.fontSize,
    fontWeight: "600",
  },
})
