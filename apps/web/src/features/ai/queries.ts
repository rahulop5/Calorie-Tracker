import { useMutation } from '@tanstack/react-query';
import type { EstimateNutritionInput } from '@tracker/shared';
import { aiApi } from '@/lib/api/resources';

/**
 * None of these invalidate anything: every AI endpoint is proposal-only, so
 * nothing in the cache can have changed.
 */
export function useExtractFromPhoto() {
  return useMutation({ mutationFn: (file: File) => aiApi.extractFromPhoto(file) });
}

export function useEstimateNutrition() {
  return useMutation({ mutationFn: (input: EstimateNutritionInput) => aiApi.estimate(input) });
}

export function useParsePdf() {
  return useMutation({ mutationFn: (file: File) => aiApi.parsePdf(file) });
}
