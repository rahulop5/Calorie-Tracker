import { useQuery } from '@tanstack/react-query';
import type { BucketedRange, ReportRange } from '@/lib/api/resources';
import { reportsApi } from '@/lib/api/resources';
import { queryKeys } from '@/lib/queryKeys';

// Series are computed for the whole range, then paged, so a page size wide
// enough for the range keeps every chart on one page.
const SERIES_PAGE_SIZE = 100;

function bucketed(range: ReportRange, groupBy: 'day' | 'week'): BucketedRange {
  return { ...range, groupBy, page: 1, pageSize: SERIES_PAGE_SIZE };
}

export function useSummaryReport(range: ReportRange) {
  return useQuery({
    queryKey: [...queryKeys.reports, 'summary', range],
    queryFn: () => reportsApi.summary(range),
  });
}

export function useCaloriesReport(range: ReportRange, groupBy: 'day' | 'week') {
  return useQuery({
    queryKey: [...queryKeys.reports, 'calories', range, groupBy],
    queryFn: () => reportsApi.calories(bucketed(range, groupBy)),
  });
}

export function useMacrosReport(range: ReportRange, groupBy: 'day' | 'week') {
  return useQuery({
    queryKey: [...queryKeys.reports, 'macros', range, groupBy],
    queryFn: () => reportsApi.macros(bucketed(range, groupBy)),
  });
}

export function useGoalVsActualReport(range: ReportRange, groupBy: 'day' | 'week') {
  return useQuery({
    queryKey: [...queryKeys.reports, 'goal-vs-actual', range, groupBy],
    queryFn: () => reportsApi.goalVsActual(bucketed(range, groupBy)),
  });
}

export function useMicrosReport(range: ReportRange) {
  return useQuery({
    queryKey: [...queryKeys.reports, 'micros', range],
    queryFn: () => reportsApi.micros(range),
  });
}

export function useMealBreakdownReport(range: ReportRange) {
  return useQuery({
    queryKey: [...queryKeys.reports, 'meal-breakdown', range],
    queryFn: () => reportsApi.mealBreakdown(range),
  });
}

export function useWeightReport(range: ReportRange) {
  return useQuery({
    queryKey: [...queryKeys.reports, 'weight', range],
    queryFn: () => reportsApi.weight(bucketed(range, 'day')),
  });
}
