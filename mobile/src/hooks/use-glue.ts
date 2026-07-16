// TanStack Query 5 hooks for the superapp glue layer (search, links, today).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import * as glueApi from "@/lib/glue-api"
import type {
  CreateLinkInput,
  EmailToTaskInput,
  EntityLinkType,
  SearchType,
} from "@/lib/schemas/glue.schemas"
import { taskKeys } from "./use-tasks"

export const glueKeys = {
  all: ["glue"] as const,
  search: (q: string, types?: SearchType[]) =>
    [...glueKeys.all, "search", q, types?.join(",") ?? "all"] as const,
  links: (type: EntityLinkType, id: string) => [...glueKeys.all, "links", type, id] as const,
  today: (tz: string, date?: string) => [...glueKeys.all, "today", tz, date ?? "auto"] as const,
}

/** Device IANA timezone (stable during a session). */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

// ---------------------------------------------------------------------------
// Universal search
// ---------------------------------------------------------------------------

export function useUniversalSearch(q: string, types?: SearchType[]) {
  const trimmed = q.trim()
  return useQuery({
    queryKey: glueKeys.search(trimmed, types),
    queryFn: () => glueApi.universalSearch(trimmed, types),
    enabled: trimmed.length >= 2,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  })
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export function useLinks(type: EntityLinkType, id: string | undefined) {
  return useQuery({
    queryKey: glueKeys.links(type, id ?? ""),
    queryFn: () => glueApi.listLinks(type, id!),
    select: (d) => d.links,
    enabled: !!id,
  })
}

export function useCreateLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLinkInput) => glueApi.createLink(input),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({
        queryKey: glueKeys.links(input.sourceType, input.sourceId),
      })
      queryClient.invalidateQueries({
        queryKey: glueKeys.links(input.targetType, input.targetId),
      })
    },
  })
}

export function useDeleteLink(type: EntityLinkType, entityId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (linkId: string) => glueApi.deleteLink(linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: glueKeys.links(type, entityId) })
    },
  })
}

export function useEmailToTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: EmailToTaskInput) => glueApi.emailToTask(input),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
      queryClient.invalidateQueries({ queryKey: glueKeys.links("thread", input.threadId) })
    },
  })
}

// ---------------------------------------------------------------------------
// Today dashboard
// ---------------------------------------------------------------------------

export function useToday() {
  const tz = deviceTimezone()
  return useQuery({
    queryKey: glueKeys.today(tz),
    queryFn: () => glueApi.getToday(tz),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
}
