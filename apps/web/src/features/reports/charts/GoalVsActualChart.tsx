import type { GoalVsActualPoint } from '@tracker/shared';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { ChartTooltip, type TooltipRow } from '@/components/charts/ChartTooltip';
import type { CustomTooltipProps } from '@/components/charts/chart-types';
import { DataTable } from '@/components/charts/DataTable';
import { AXIS_PROPS, CHART, MARK, SERIES } from '@/components/charts/palette';
import { formatBucket } from '@/lib/dates';
import { formatGrams, formatNumber, formatPercent, formatSigned } from '@/lib/format';

type GoalVsActualChartProps = {
  points: readonly GoalVsActualPoint[];
  groupBy: 'day' | 'week';
  isPending: boolean;
  isFetching: boolean;
};

type Measure = {
  key: 'calories' | 'proteinG' | 'carbsG' | 'fatG';
  label: string;
  unit: string;
};

const MEASURES: readonly Measure[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'carbsG', label: 'Carbs', unit: 'g' },
  { key: 'fatG', label: 'Fat', unit: 'g' },
];

/**
 * Four small multiples rather than one chart. Calories run in the thousands and
 * macros in the tens, so a shared axis would flatten the macros; a second axis
 * would invent a relationship. Each panel keeps its own scale.
 */
export function GoalVsActualChart({
  points,
  groupBy,
  isPending,
  isFetching,
}: GoalVsActualChartProps) {
  const usesBaseline = points.some((point) => point.goalIsBaseline);
  const hasGoal = points.some((point) => point.calories.goal !== null);

  return (
    <ChartCard
      title="Goal vs actual"
      description="Each measure on its own scale"
      legend={[
        { label: 'Actual', color: SERIES.one },
        { label: 'Goal', color: CHART.reference },
      ]}
      isPending={isPending}
      isFetching={isFetching}
      isEmpty={points.length === 0}
      height={320}
      footnote={
        !hasGoal
          ? 'Set a goal to see targets on these charts.'
          : usesBaseline
            ? 'Periods before your first goal are compared against it as a baseline.'
            : undefined
      }
      table={
        <DataTable
          caption="Goal against actual intake per bucket"
          columns={[
            {
              key: 'bucket',
              header: 'Period',
              render: (row) => formatBucket(row.bucket, groupBy),
            },
            ...MEASURES.map((measure) => ({
              key: measure.key,
              header: measure.label,
              align: 'right' as const,
              render: (row: GoalVsActualPoint) => {
                const comparison = row[measure.key];

                return comparison.goal === null
                  ? formatNumber(comparison.actual)
                  : `${formatNumber(comparison.actual)} / ${formatNumber(comparison.goal)} (${formatPercent(comparison.percent)})`;
              },
            })),
          ]}
          rows={points}
          rowKey={(row) => row.bucket}
        />
      }
    >
      <div className="grid h-full grid-cols-1 gap-3 sm:grid-cols-2">
        {MEASURES.map((measure) => (
          <MeasurePanel
            key={measure.key}
            measure={measure}
            points={points}
            groupBy={groupBy}
          />
        ))}
      </div>
    </ChartCard>
  );
}

type MeasurePanelProps = {
  measure: Measure;
  points: readonly GoalVsActualPoint[];
  groupBy: 'day' | 'week';
};

type PanelRow = {
  bucket: string;
  axisLabel: string;
  actual: number;
  goal: number | null;
  percent: number | null;
  diff: number | null;
  isBaseline: boolean;
};

function MeasurePanel({ measure, points, groupBy }: MeasurePanelProps) {
  const data: PanelRow[] = points.map((point) => {
    const comparison = point[measure.key];

    return {
      bucket: point.bucket,
      axisLabel: formatBucket(point.bucket, groupBy),
      actual: comparison.actual,
      goal: comparison.goal,
      percent: comparison.percent,
      diff: comparison.diff,
      isBaseline: point.goalIsBaseline,
    };
  });

  // The goal is constant across a bucket set unless it changed mid-range; the
  // reference line uses the latest one, and the tooltip carries the exact value.
  const goalLine = data.findLast((row) => row.goal !== null)?.goal ?? null;

  // The axis has to cover the goal as well as the bars. Sized from the bars
  // alone, a goal above the tallest bar falls off-scale and its line vanishes.
  const tallestBar = Math.max(0, ...data.map((row) => row.actual));
  const upperBound = Math.max(tallestBar, goalLine ?? 0);
  const domainMax = upperBound > 0 ? Math.ceil(upperBound * 1.1) : 'auto';

  return (
    <div className="flex min-h-0 flex-col">
      <p className="px-2 text-[0.75rem] font-medium text-ink-secondary">
        {measure.label}
        <span className="ml-1 font-normal text-ink-muted">({measure.unit})</span>
      </p>

      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />

            <XAxis dataKey="axisLabel" {...AXIS_PROPS} tick={false} height={4} />
            <YAxis
              {...AXIS_PROPS}
              width={40}
              tickCount={4}
              domain={[0, domainMax]}
              tickFormatter={formatNumber}
            />

            <Tooltip
              cursor={{ fill: 'var(--wash)' }}
              content={<PanelTooltip measure={measure} />}
            />

            {goalLine !== null ? (
              <ReferenceLine y={goalLine} stroke={CHART.reference} strokeWidth={1} />
            ) : null}

            <Bar
              dataKey="actual"
              fill={SERIES.one}
              maxBarSize={MARK.barSize}
              radius={[4, 4, 0, 0]}
              // Surface-coloured stroke: the 2px air that keeps touching bars
              // separate without drawing an ink border around them.
              stroke={CHART.surface}
              strokeWidth={MARK.gapWidth}
              animationDuration={600}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PanelTooltip({
  active,
  payload,
  measure,
}: CustomTooltipProps<PanelRow> & { measure: Measure }) {
  const row = payload?.[0]?.payload;

  if (!active || !row) {
    return null;
  }

  const format = measure.key === 'calories' ? formatNumber : formatGrams;

  const rows: TooltipRow[] = [{ label: 'Actual', value: format(row.actual), color: SERIES.one }];

  if (row.goal !== null) {
    rows.push({ label: 'Goal', value: format(row.goal), color: CHART.reference });
    rows.push({
      label: 'Difference',
      value: row.diff === null ? '—' : formatSigned(row.diff),
    });
  }

  return (
    <ChartTooltip
      title={`${measure.label} · ${row.axisLabel}`}
      rows={rows}
      footer={
        row.isBaseline
          ? 'Goal shown is a baseline'
          : row.percent !== null
            ? `${formatPercent(row.percent)} of goal`
            : undefined
      }
    />
  );
}
