import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GoalUpdate } from '@tracker/shared';
import { ApiError } from '@/lib/api/client';
import { goalsApi } from '@/lib/api/resources';
import { GOAL_DEPENDENTS, queryKeys } from '@/lib/queryKeys';

/**
 * A user with no goal yet is a normal state, not an error, so a 404 resolves to
 * null rather than rejecting.
 */
export function useCurrentGoal(on?: string) {
  return useQuery({
    queryKey: [...queryKeys.goals, 'current', on ?? 'today'],
    queryFn: async () => {
      try {
        return await goalsApi.current(on);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }

        throw error;
      }
    },
  });
}

export function useGoalHistory(page: number) {
  return useQuery({
    queryKey: [...queryKeys.goals, 'history', page],
    queryFn: () => goalsApi.history(page),
  });
}

export function useSaveGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: GoalUpdate) => goalsApi.save(input),
    onSuccess: () => {
      for (const key of GOAL_DEPENDENTS) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
