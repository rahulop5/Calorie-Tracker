import type { WeightPoint } from '@tracker/shared';
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
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
import { EndpointLabel } from '@/components/charts/EndpointLabel';
import { AXIS_PROPS, CHART, MARK, SERIES } from '@/components/charts/palette';
import { formatDayMedium, formatDayShort } from '@/lib/dates';
import { formatWeight } from '@/lib/format';

type WeightChartProps = {
  points: readonly WeightPoint[];
  isPending: boolean;
  isFetching: boolean;
};

type Row = WeightPoint & { axisLabel: string };

export function WeightChart({ points, isPending, isFetching }: WeightChartProps) {
  const data: Row[] = points.map((point) => ({
    ...point,
    axisLabel: formatDayShort(point.measuredOn),
  }));

  const target = data.findLast((row) => row.targetWeightKg !== null)?.targetWeightKg ?? null;

  // The target belongs in the domain. Scaled to the measurements alone, a
  // target outside their range sits off-scale and its line is never drawn.
  const plotted = data.map((row) => row.weightKg);
  const covered = target === null ? plotted : [...plotted, target];
  const domain: [number, number] | undefined =
    covered.length === 0
      ? undefined
      : [Math.floor(Math.min(...covered) - 1), Math.ceil(Math.max(...covered) + 1)];

  // One series plus a reference line needs no legend: the title names it and the
  // target line is labelled where it sits.
  return (
    <ChartCard
      title="Weight"
      description={target !== null ? `Target ${formatWeight(target)}` : 'No target set'}
      isPending={isPending}
      isFetching={isFetching}
      isEmpty={points.length === 0}
      emptyMessage="Log your weight to see it trend against your target."
      height={240}
      table={
        <DataTable
          caption="Weight measurements against the target active that day"
          columns={[
            { key: 'date', header: 'Date', render: (row) => formatDayMedium(row.measuredOn) },
            {
              key: 'weight',
              header: 'Weight',
              align: 'right',
              render: (row) => formatWeight(row.weightKg),
            },
            {
              key: 'target',
              header: 'Target',
              align: 'right',
              render: (row) =>
                row.targetWeightKg === null ? '—' : formatWeight(row.targetWeightKg),
            },
          ]}
          rows={data}
          rowKey={(row) => row.measuredOn}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 24, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />

          <XAxis dataKey="axisLabel" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={16} />
          <YAxis
            {...AXIS_PROPS}
            width={52}
            domain={domain ?? ['dataMin - 1', 'dataMax + 1']}
            tickFormatter={(value) => String(Math.round(Number(value)))}
          />

          <Tooltip cursor={{ stroke: CHART.axis, strokeWidth: 1 }} content={<WeightTooltip />} />

          {target !== null ? (
            <ReferenceLine
              y={target}
              stroke={CHART.reference}
              strokeWidth={1}
              label={{
                value: 'Target',
                position: 'insideTopRight',
                fill: 'var(--ink-muted)',
                fontSize: 11,
              }}
            />
          ) : null}

          <Line
            type="monotone"
            dataKey="weightKg"
            stroke={SERIES.one}
            strokeWidth={MARK.lineWidth}
            // The 2px surface ring keeps dots legible where they overlap the line.
            dot={{
              r: MARK.dotRadius,
              fill: SERIES.one,
              stroke: CHART.surface,
              strokeWidth: MARK.gapWidth,
            }}
            activeDot={{
              r: MARK.dotRadius + 1,
              fill: SERIES.one,
              stroke: CHART.surface,
              strokeWidth: MARK.gapWidth,
            }}
            animationDuration={600}
          >
            <LabelList
              dataKey="weightKg"
              content={
                <EndpointLabel total={data.length} format={(value) => formatWeight(value)} />
              }
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function WeightTooltip({ active, payload }: CustomTooltipProps<Row>) {
  const row = payload?.[0]?.payload;

  if (!active || !row) {
    return null;
  }

  const rows: TooltipRow[] = [
    { label: 'Weight', value: formatWeight(row.weightKg), color: SERIES.one },
  ];

  if (row.targetWeightKg !== null) {
    const gap = row.weightKg - row.targetWeightKg;

    rows.push({ label: 'Target', value: formatWeight(row.targetWeightKg), color: CHART.reference });
    rows.push({
      label: gap >= 0 ? 'Above target' : 'Below target',
      value: formatWeight(Math.abs(gap)),
    });
  }

  return <ChartTooltip title={formatDayMedium(row.measuredOn)} rows={rows} />;
}
