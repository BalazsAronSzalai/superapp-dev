// TanStack Query 5 hooks for the Mail module.
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query"

import * as mailApi from "@/lib/mail-api"
import type {
  CreateMailAccountInput,
  PatchThreadInput,
  SendMailInput,
  ThreadListResponse,
} from "@/lib/schemas/mail.schemas"

export const mailKeys = {
  all: ["mail"] as const,
  accounts: () => [...mailKeys.all, "accounts"] as const,
  threads: (folder: string) => [...mailKeys.all, "threads", folder] as const,
  thread: (id: string) => [...mailKeys.all, "thread", id] as const,
  unreadCount: () => [...mailKeys.all, "unread-count"] as const,
  search: (q: string) => [...mailKeys.all, "search", q] as const,
}

type ThreadsData = InfiniteData<ThreadListResponse, string | undefined>

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export function useMailAccounts() {
  return useQuery({
    queryKey: mailKeys.accounts(),
    queryFn: mailApi.listMailAccounts,
    select: (d) => d.accounts,
  })
}

export function useCreateMailAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateMailAccountInput) => mailApi.createMailAccount(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.all })
    },
  })
}

export function useDeleteMailAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => mailApi.deleteMailAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.all })
    },
  })
}

/** Sync every connected account, then refresh threads + unread count. */
export function useSyncAccounts() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (accountIds: string[]) => {
      const results = await Promise.allSettled(
        accountIds.map((id) => mailApi.syncMailAccount(id)),
      )
      const failed = results.filter((r) => r.status === "rejected")
      if (failed.length === accountIds.length && accountIds.length > 0) {
        throw new Error("Sync failed for all accounts")
      }
      return results
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.all })
    },
  })
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export function useThreads(folder: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: mailKeys.threads(folder),
    queryFn: ({ pageParam }) => mailApi.listThreads(folder, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  })
}

export function useThread(id: string | undefined) {
  return useQuery({
    queryKey: mailKeys.thread(id ?? ""),
    queryFn: () => mailApi.getThread(id!),
    enabled: !!id,
  })
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: mailKeys.unreadCount(),
    queryFn: mailApi.getUnreadCount,
    select: (d) => d.count,
    refetchInterval: 60_000,
    enabled,
  })
}

/** Optimistically update a thread in every cached folder list. */
function updateThreadInLists(
  data: ThreadsData | undefined,
  threadId: string,
  patch: PatchThreadInput,
): ThreadsData | undefined {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      threads: page.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              isUnread: patch.isUnread ?? t.isUnread,
              isFlagged: patch.isFlagged ?? t.isFlagged,
              folder: patch.folder ?? t.folder,
            }
          : t,
      ),
    })),
  }
}

function removeThreadFromList(
  data: ThreadsData | undefined,
  threadId: string,
): ThreadsData | undefined {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      threads: page.threads.filter((t) => t.id !== threadId),
    })),
  }
}

export function usePatchThread(currentFolder: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchThreadInput }) =>
      mailApi.patchThread(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: mailKeys.threads(currentFolder) })
      const previous = queryClient.getQueryData<ThreadsData>(mailKeys.threads(currentFolder))
      queryClient.setQueryData<ThreadsData>(mailKeys.threads(currentFolder), (old) =>
        input.folder && input.folder !== currentFolder
          ? removeThreadFromList(old, id)
          : updateThreadInLists(old, id, input),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(mailKeys.threads(currentFolder), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.all })
    },
  })
}

export function useDeleteThread(currentFolder: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => mailApi.deleteThread(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: mailKeys.threads(currentFolder) })
      const previous = queryClient.getQueryData<ThreadsData>(mailKeys.threads(currentFolder))
      queryClient.setQueryData<ThreadsData>(mailKeys.threads(currentFolder), (old) =>
        removeThreadFromList(old, id),
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(mailKeys.threads(currentFolder), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.all })
    },
  })
}

export function useSnoozeThread(currentFolder: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, until }: { id: string; until: string }) =>
      mailApi.snoozeThread(id, until),
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: mailKeys.threads(currentFolder) })
      const previous = queryClient.getQueryData<ThreadsData>(mailKeys.threads(currentFolder))
      if (currentFolder === "inbox") {
        queryClient.setQueryData<ThreadsData>(mailKeys.threads(currentFolder), (old) =>
          removeThreadFromList(old, id),
        )
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(mailKeys.threads(currentFolder), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.all })
    },
  })
}

export function useUnsnoozeThread() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => mailApi.unsnoozeThread(id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.all })
    },
  })
}

// ---------------------------------------------------------------------------
// Send + search
// ---------------------------------------------------------------------------

export function useSendMail() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SendMailInput) => mailApi.sendMail(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mailKeys.all })
    },
  })
}

export function useSearchMail(q: string) {
  return useQuery({
    queryKey: mailKeys.search(q),
    queryFn: () => mailApi.searchMail(q),
    select: (d) => d.threads,
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  })
}
