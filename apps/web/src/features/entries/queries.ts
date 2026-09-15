import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BulkEntryInput, EntryInput, EntryListQuery, EntryUpdate } from '@tracker/shared';
import { entriesApi } from '@/lib/api/resources';
import { ENTRY_DEPENDENTS, queryKeys } from '@/lib/queryKeys';

type ListQuery = Partial<EntryListQuery>;

export function useEntries(query: ListQuery) {
  return useQuery({
    queryKey: [...queryKeys.entries, 'list', query],
    queryFn: () => entriesApi.list(query),
  });
}

function useEntryInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    for (const key of ENTRY_DEPENDENTS) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

export function useCreateEntry() {
  const invalidate = useEntryInvalidation();

  return useMutation({
    mutationFn: (input: EntryInput) => entriesApi.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateEntry() {
  const invalidate = useEntryInvalidation();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EntryUpdate }) =>
      entriesApi.update(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteEntry() {
  const invalidate = useEntryInvalidation();

  return useMutation({
    mutationFn: (id: string) => entriesApi.remove(id),
    onSuccess: invalidate,
  });
}

export function useCreateEntriesBulk() {
  const invalidate = useEntryInvalidation();

  return useMutation({
    mutationFn: (input: BulkEntryInput) => entriesApi.createBulk(input),
    onSuccess: invalidate,
  });
}
