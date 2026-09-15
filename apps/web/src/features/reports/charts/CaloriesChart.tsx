import type { CaloriePoint } from '@tracker/shared';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { ChartTooltip, type TooltipRow } from '@/components/charts/ChartTooltip';
import type { CustomTooltipProps } from '@/components/charts/chart-types';
import { EndpointLabel } from '@/components/charts/EndpointLabel';
import { AXIS_PROPS, CHART, MARK, SERIES } from '@/components/charts/palette';
import { DataTable } from '@/components/charts/DataTable';
import { formatBucket } from '@/lib/dates';
import { formatCalories, formatNumber } from '@/lib/format';

type CaloriesChartProps = {
  points: readonly CaloriePoint[];
  groupBy: 'day' | 'week';
  isPending: boolean;
  isFetching: boolean;
};

const LEGEND = [
  { label: 'Eaten', color: SERIES.one },
  { label: 'Goal', color: CHART.reference },
];

export function CaloriesChart({ points, groupBy, isPending, isFetching }: CaloriesChartProps) {
  const data = points.map((point) => ({
    ...point,
    axisLabel: formatBucket(point.bucket, groupBy),
  }));

  const last = data.at(-1);
  const usesBaseline = points.some((point) => point.goalIsBaseline);

  return (
    <ChartCard
      title="Calorie intake"
      description={
        last
          ? `Latest ${groupBy === 'day' ? 'day' : 'week'}: ${formatCalories(last.calories)}`
          : undefined
      }
      legend={LEGEND}
      isPending={isPending}
      isFetching={isFetching}
      isEmpty={points.length === 0}
      height={280}
      footnote={
        usesBaseline
          ? 'Some periods predate your first goal and are compared against it as a baseline.'
          : undefined
      }
      table={
        <DataTable
          caption="Calories eaten against the goal, per bucket"
          columns={[
            { key: 'bucket', header: 'Period', render: (row) => row.axisLabel },
            {
              key: 'calories',
              header: 'Eaten',
              align: 'right',
              render: (row) => formatNumber(row.calories),
            },
            {
              key: 'goal',
              header: 'Goal',
              align: 'right',
              render: (row) => (row.goalCalories === null ? '—' : formatNumber(row.goalCalories)),
            },
          ]}
          rows={data}
          rowKey={(row) => row.bucket}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="calories-wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES.one} stopOpacity={MARK.areaOpacity * 2} />
              <stop offset="100%" stopColor={SERIES.one} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Solid hairlines, horizontal only: vertical rules fight the bars. */}
          <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />

          <XAxis dataKey="axisLabel" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...AXIS_PROPS} width={52} tickFormatter={formatNumber} />

          <Tooltip
            cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
            content={<CaloriesTooltip />}
          />

          <Area
            type="monotone"
            dataKey="calories"
            name="Eaten"
            stroke={SERIES.one}
            strokeWidth={MARK.lineWidth}
            fill="url(#calories-wash)"
            activeDot={{
              r: MARK.dotRadius,
              fill: SERIES.one,
              stroke: CHART.surface,
              strokeWidth: MARK.gapWidth,
            }}
            animationDuration={600}
          >
            <LabelList
              dataKey="calories"
              content={<EndpointLabel total={data.length} format={formatNumber} />}
            />
          </Area>

          {/* The goal is a reference, so it wears muted ink rather than a slot. */}
          <Line
            type="stepAfter"
            dataKey="goalCalories"
            name="Goal"
            stroke={CHART.reference}
            strokeWidth={MARK.lineWidth}
            dot={false}
            activeDot={false}
            connectNulls
            animationDuration={600}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

type Row = CaloriePoint & { axisLabel: string };

function CaloriesTooltip({ active, payload }: CustomTooltipProps<Row>) {
  const row = payload?.[0]?.payload;

  if (!active || !row) {
    return null;
  }

  const rows: TooltipRow[] = [
    { label: 'Eaten', value: formatCalories(row.calories), color: SERIES.one },
  ];

  if (row.goalCalories !== null) {
    rows.push({
      label: 'Goal',
      value: formatCalories(row.goalCalories),
      color: CHART.reference,
    });
  }

  return (
    <ChartTooltip
      title={row.axisLabel}
      rows={rows}
      footer={row.goalIsBaseline ? 'Goal shown is a baseline' : undefined}
    />
  );
}
