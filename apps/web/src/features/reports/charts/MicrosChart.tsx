import type { MicrosReport } from '@tracker/shared';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { ChartTooltip } from '@/components/charts/ChartTooltip';
import type { CustomTooltipProps, LabelRenderProps } from '@/components/charts/chart-types';
import { toPixels } from '@/components/charts/chart-types';
import { DataTable } from '@/components/charts/DataTable';
import { AXIS_PROPS, CHART, MARK, SERIES } from '@/components/charts/palette';
import { Button } from '@/components/ui/Button';
import { formatNumber, formatPercent } from '@/lib/format';

type MicrosChartProps = {
  report: MicrosReport | undefined;
  isPending: boolean;
  isFetching: boolean;
};

type Row = MicrosReport['items'][number];

const COLLAPSED_COUNT = 10;

export function MicrosChart({ report, isPending, isFetching }: MicrosChartProps) {
  const [showAll, setShowAll] = useState(false);

  const items = report?.items ?? [];

  // Highest coverage first, so the bars that matter are at the top.
  const ranked = [...items].sort(
    (left, right) => (right.percentOfDailyValue ?? -1) - (left.percentOfDailyValue ?? -1),
  );

  const withDailyValue = ranked.filter((item) => item.dailyValue !== null);
  const visible = showAll ? withDailyValue : withDailyValue.slice(0, COLLAPSED_COUNT);
  const anyLogged = items.some((item) => item.total > 0);

  // The axis always reaches 100%, because "did I hit the daily value" is the
  // question this chart answers. Scaled to the bars instead, the 100% line
  // would fall off-scale whenever every nutrient is short.
  const highest = Math.max(0, ...visible.map((item) => item.percentOfDailyValue ?? 0));
  const axisMax = Math.ceil(Math.max(100, highest) * 1.05);

  return (
    <ChartCard
      title="Micronutrient summary"
      description={
        report ? `Daily average as a share of the reference value, over ${report.days} days` : undefined
      }
      isPending={isPending}
      isFetching={isFetching}
      isEmpty={!anyLogged}
      emptyMessage="Add micronutrients to a meal to see this summary."
      height={Math.max(240, visible.length * 30 + 40)}
      footnote={
        withDailyValue.length > COLLAPSED_COUNT ? (
          <Button size="sm" variant="ghost" onClick={() => setShowAll((shown) => !shown)}>
            {showAll ? 'Show top 10' : `Show all ${withDailyValue.length}`}
          </Button>
        ) : undefined
      }
      table={
        <DataTable
          caption="Micronutrient totals and daily averages against reference values"
          columns={[
            { key: 'label', header: 'Nutrient', render: (row) => row.label },
            {
              key: 'total',
              header: 'Total',
              align: 'right',
              render: (row) => `${formatNumber(row.total)} ${row.unit}`,
            },
            {
              key: 'average',
              header: 'Daily avg',
              align: 'right',
              render: (row) => `${formatNumber(row.dailyAverage)} ${row.unit}`,
            },
            {
              key: 'percent',
              header: '% of daily value',
              align: 'right',
              render: (row) => formatPercent(row.percentOfDailyValue),
            },
          ]}
          rows={ranked}
          rowKey={(row) => row.key}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={visible}
          layout="vertical"
          margin={{ top: 4, right: 48, bottom: 4, left: 0 }}
        >
          <CartesianGrid horizontal={false} stroke={CHART.grid} strokeWidth={1} />

          <XAxis
            type="number"
            {...AXIS_PROPS}
            domain={[0, axisMax]}
            tickFormatter={(value) => `${value}%`}
          />
          <YAxis
            type="category"
            dataKey="label"
            {...AXIS_PROPS}
            width={120}
            tickMargin={4}
          />

          {/* Where "enough" sits, so a bar reads against a target, not in a void. */}
          <ReferenceLine
            x={100}
            stroke={CHART.reference}
            strokeWidth={1}
            label={{
              value: '100%',
              position: 'top',
              fill: 'var(--ink-muted)',
              fontSize: 11,
            }}
          />

          <Tooltip cursor={{ fill: 'var(--wash)' }} content={<MicrosTooltip />} />

          {/* One series, one colour: bar length already encodes magnitude. */}
          <Bar
            dataKey="percentOfDailyValue"
            fill={SERIES.one}
            maxBarSize={MARK.barSize}
            radius={[0, 4, 4, 0]}
            stroke={CHART.surface}
            strokeWidth={MARK.gapWidth}
            animationDuration={600}
          >
            <LabelList dataKey="percentOfDailyValue" content={<PercentLabel />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Value at the bar tip, outside the fill, so it is never clipped by a short bar. */
function PercentLabel({ x, y, width, height, value }: LabelRenderProps) {
  if (typeof value !== 'number') {
    return null;
  }

  return (
    <text
      x={toPixels(x) + toPixels(width) + 6}
      y={toPixels(y) + toPixels(height) / 2}
      dominantBaseline="middle"
      fontSize={11}
      fill="var(--ink-secondary)"
    >
      {Math.round(value)}%
    </text>
  );
}

function MicrosTooltip({ active, payload }: CustomTooltipProps<Row>) {
  const row = payload?.[0]?.payload;

  if (!active || !row) {
    return null;
  }

  return (
    <ChartTooltip
      title={row.label}
      rows={[
        { label: 'Daily average', value: `${formatNumber(row.dailyAverage)} ${row.unit}` },
        { label: 'Range total', value: `${formatNumber(row.total)} ${row.unit}` },
        { label: 'Of daily value', value: formatPercent(row.percentOfDailyValue) },
      ]}
      footer={row.dailyValue !== null ? `Reference: ${row.dailyValue} ${row.unit}/day` : undefined}
    />
  );
}
