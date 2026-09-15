import type { MacroPoint } from '@tracker/shared';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { ChartTooltip, type TooltipRow } from '@/components/charts/ChartTooltip';
import type { CustomTooltipProps } from '@/components/charts/chart-types';
import { DataTable } from '@/components/charts/DataTable';
import { AXIS_PROPS, CHART, MACRO_SERIES, MARK } from '@/components/charts/palette';
import { formatBucket } from '@/lib/dates';
import { formatGrams, formatNumber, formatPercent } from '@/lib/format';

type MacrosChartProps = {
  points: readonly MacroPoint[];
  groupBy: 'day' | 'week';
  isPending: boolean;
  isFetching: boolean;
};

const LEGEND = MACRO_SERIES.map((series) => ({ label: series.label, color: series.color }));

type Row = MacroPoint & {
  axisLabel: string;
  proteinKcal: number;
  carbsKcal: number;
  fatKcal: number;
};

/**
 * Segments are the calories each macro contributes, not raw grams: the stack
 * then totals the day's calories, which is a number that means something.
 * Grams and shares stay in the tooltip and the table.
 */
function toRow(point: MacroPoint, groupBy: 'day' | 'week'): Row {
  return {
    ...point,
    axisLabel: formatBucket(point.bucket, groupBy),
    proteinKcal: Math.round(point.proteinG * 4),
    carbsKcal: Math.round(point.carbsG * 4),
    fatKcal: Math.round(point.fatG * 9),
  };
}

export function MacrosChart({ points, groupBy, isPending, isFetching }: MacrosChartProps) {
  const data = points.map((point) => toRow(point, groupBy));

  return (
    <ChartCard
      title="Macronutrient breakdown"
      description="Calories contributed by each macro"
      legend={LEGEND}
      isPending={isPending}
      isFetching={isFetching}
      isEmpty={points.length === 0}
      height={280}
      table={
        <DataTable
          caption="Protein, carbs and fat per bucket, in grams and as a share of calories"
          columns={[
            { key: 'bucket', header: 'Period', render: (row) => row.axisLabel },
            {
              key: 'protein',
              header: 'Protein',
              align: 'right',
              render: (row) => `${formatGrams(row.proteinG)} (${formatPercent(row.proteinPercent)})`,
            },
            {
              key: 'carbs',
              header: 'Carbs',
              align: 'right',
              render: (row) => `${formatGrams(row.carbsG)} (${formatPercent(row.carbsPercent)})`,
            },
            {
              key: 'fat',
              header: 'Fat',
              align: 'right',
              render: (row) => `${formatGrams(row.fatG)} (${formatPercent(row.fatPercent)})`,
            },
          ]}
          rows={data}
          rowKey={(row) => row.bucket}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />

          <XAxis dataKey="axisLabel" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...AXIS_PROPS} width={52} tickFormatter={formatNumber} />

          <Tooltip cursor={{ fill: 'var(--wash)' }} content={<MacrosTooltip />} />

          {MACRO_SERIES.map((series, index) => (
            <Bar
              key={series.kcalKey}
              dataKey={series.kcalKey}
              name={series.label}
              stackId="macros"
              fill={series.color}
              maxBarSize={MARK.barSize}
              // A surface-coloured stroke is the 2px gap that separates the
              // segments: air between fills, never an ink border.
              stroke={CHART.surface}
              strokeWidth={MARK.gapWidth}
              // Only the top segment is rounded; the stack keeps one flat base.
              radius={index === MACRO_SERIES.length - 1 ? [4, 4, 0, 0] : undefined}
              animationDuration={600}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function MacrosTooltip({ active, payload }: CustomTooltipProps<Row>) {
  const row = payload?.[0]?.payload;

  if (!active || !row) {
    return null;
  }

  const rows: TooltipRow[] = MACRO_SERIES.map((series) => ({
    label: series.label,
    value: `${formatGrams(row[series.key])} · ${formatPercent(row[series.percentKey])}`,
    color: series.color,
  }));

  return (
    <ChartTooltip
      title={row.axisLabel}
      rows={rows}
      footer={`${formatNumber(row.calories)} kcal total`}
    />
  );
}
