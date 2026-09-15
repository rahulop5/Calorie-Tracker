import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '@/lib/api/resources';
import { queryKeys } from '@/lib/queryKeys';


export const CONVERSATIONS_KEY = ['conversations'] as const;

export function useConversations(page: number) {
  return useQuery({
    queryKey: [...CONVERSATIONS_KEY, 'list', page],
    queryFn: () => chatApi.listConversations(page),
  });
}

export function useConversationMessages(conversationId: string | null) {
  return useQuery({
    queryKey: [...CONVERSATIONS_KEY, 'messages', conversationId],
    queryFn: () => chatApi.listMessages(conversationId as string, 1),
    enabled: conversationId !== null,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => chatApi.createConversation(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => chatApi.removeConversation(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    },
  });
}

/**
 * The assistant can log meals and change goals, so once a reply finishes every
 * view that reads that data has to be refetched.
 */
export function useRefreshAfterChat() {
  const queryClient = useQueryClient();

  return () => {
    for (const key of [queryKeys.entries, queryKeys.goals, queryKeys.weights, queryKeys.reports]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
    void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
  };
}

