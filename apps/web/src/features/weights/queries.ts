import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WeightLogInput } from '@tracker/shared';
import { ApiError } from '@/lib/api/client';
import { weightsApi } from '@/lib/api/resources';
import { queryKeys, WEIGHT_DEPENDENTS } from '@/lib/queryKeys';

/** Nothing logged yet is a normal state, so a 404 resolves to null. */
export function useLatestWeight() {
  return useQuery({
    queryKey: [...queryKeys.weights, 'latest'],
    queryFn: async () => {
      try {
        return await weightsApi.latest();
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }

        throw error;
      }
    },
  });
}

export function useWeights(page: number, pageSize = 7) {
  return useQuery({
    queryKey: [...queryKeys.weights, 'list', page, pageSize],
    queryFn: () => weightsApi.list({ page, pageSize }),
  });
}

function useWeightInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    for (const key of WEIGHT_DEPENDENTS) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

export function useSaveWeight() {
  const invalidate = useWeightInvalidation();

  return useMutation({
    mutationFn: (input: WeightLogInput) => weightsApi.save(input),
    onSuccess: invalidate,
  });
}

export function useDeleteWeight() {
  const invalidate = useWeightInvalidation();

  return useMutation({
    mutationFn: (id: string) => weightsApi.remove(id),
    onSuccess: invalidate,
  });
}
