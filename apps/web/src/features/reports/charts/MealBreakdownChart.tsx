import type { MealBreakdownReport } from '@tracker/shared';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import type { CustomTooltipProps, LabelRenderProps } from '@/components/charts/chart-types';
import { toPixels } from '@/components/charts/chart-types';
import { DataTable } from '@/components/charts/DataTable';
import { AXIS_PROPS, CHART, MARK, SERIES } from '@/components/charts/palette';
import { formatCalories, formatGrams, formatNumber, formatPercent } from '@/lib/format';
import { mealLabel } from '@/lib/format';

type MealBreakdownChartProps = {
  report: MealBreakdownReport | undefined;
  isPending: boolean;
  isFetching: boolean;
};

type Row = MealBreakdownReport['items'][number] & { label: string };

export function MealBreakdownChart({ report, isPending, isFetching }: MealBreakdownChartProps) {
  const rows: Row[] = (report?.items ?? []).map((item) => ({
    ...item,
    label: mealLabel(item.mealType),
  }));

  const anyCalories = rows.some((row) => row.calories > 0);

  return (
    <ChartCard
      title="Where the calories come from"
      description="Totals by meal"
      isPending={isPending}
      isFetching={isFetching}
      isEmpty={!anyCalories}
      height={240}
      table={
        <DataTable
          caption="Calorie and macro totals by meal type"
          columns={[
            { key: 'meal', header: 'Meal', render: (row) => row.label },
            { key: 'entries', header: 'Meals', align: 'right', render: (row) => row.entries },
            {
              key: 'calories',
              header: 'Calories',
              align: 'right',
              render: (row) => formatNumber(row.calories),
            },
            {
              key: 'share',
              header: 'Share',
              align: 'right',
              render: (row) => formatPercent(row.percentOfCalories),
            },
            {
              key: 'macros',
              header: 'P / C / F',
              align: 'right',
              render: (row) =>
                `${formatGrams(row.proteinG)} / ${formatGrams(row.carbsG)} / ${formatGrams(row.fatG)}`,
            },
          ]}
          rows={rows}
          rowKey={(row) => row.mealType}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 20, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />

          <XAxis dataKey="label" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} width={52} tickFormatter={formatNumber} />

          <Tooltip cursor={{ fill: 'var(--wash)' }} content={<MealTooltip />} />

          {/* Nominal categories, so one colour for every bar. */}
          <Bar
            dataKey="calories"
            fill={SERIES.one}
            maxBarSize={MARK.barSize}
            radius={[4, 4, 0, 0]}
            stroke={CHART.surface}
            strokeWidth={MARK.gapWidth}
            animationDuration={600}
          >
            <LabelList dataKey="calories" content={<CapLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Value on the cap, above the bar, so it is never inside a short one. */
function CapLabel({ x, y, width, value }: LabelRenderProps) {
  if (typeof value !== 'number' || value === 0) {
    return null;
  }

  return (
    <text
      x={toPixels(x) + toPixels(width) / 2}
      y={toPixels(y) - 6}
      textAnchor="middle"
      fontSize={11}
      fill="var(--ink-secondary)"
    >
      {formatNumber(value)}
    </text>
  );
}

function MealTooltip({ active, payload }: CustomTooltipProps<Row>) {
  const row = payload?.[0]?.payload;

  if (!active || !row) {
    return null;
  }

  return (
    <ChartTooltip
      title={row.label}
      rows={[
        { label: 'Calories', value: formatCalories(row.calories), color: SERIES.one },
        { label: 'Protein', value: formatGrams(row.proteinG) },
        { label: 'Carbs', value: formatGrams(row.carbsG) },
        { label: 'Fat', value: formatGrams(row.fatG) },
      ]}
      footer={`${formatPercent(row.percentOfCalories)} of calories · ${row.entries} logged`}
    />
  );
}
