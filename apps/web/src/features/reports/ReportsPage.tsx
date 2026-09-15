import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/Field';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { lastDays, RANGE_PRESETS, type RangePresetId } from '@/lib/dates';
import { CaloriesChart } from './charts/CaloriesChart';
import { GoalVsActualChart } from './charts/GoalVsActualChart';
import { MacrosChart } from './charts/MacrosChart';
import { MealBreakdownChart } from './charts/MealBreakdownChart';
import { WeightChart } from './charts/WeightChart';
import {
  useCaloriesReport,
  useGoalVsActualReport,
  useMacrosReport,
  useMealBreakdownReport,
  useMicrosReport,
  useWeightReport,
} from './queries';
import { MicrosChart } from './charts/MicrosChart';

const GROUP_OPTIONS = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
] as const;

const PRESET_OPTIONS = RANGE_PRESETS.map((preset) => ({
  value: preset.id,
  label: preset.label,
}));

export function ReportsPage() {
  const [preset, setPreset] = useState<RangePresetId | 'custom'>('30d');
  const [groupBy, setGroupBy] = useState<'day' | 'week'>('day');
  const [custom, setCustom] = useState(() => lastDays(30));

  const range = preset === 'custom' ? custom : presetRange(preset);

  const calories = useCaloriesReport(range, groupBy);
  const macros = useMacrosReport(range, groupBy);
  const goalVsActual = useGoalVsActualReport(range, groupBy);
  const micros = useMicrosReport(range);
  const mealBreakdown = useMealBreakdownReport(range);
  const weight = useWeightReport(range);

  return (
    <>
      <PageHeader title="Reports" description="How your intake tracks against your goals." />

      {/* One filter row scoping every chart below, never per-card controls. */}
      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-secondary">Range</p>
            <SegmentedControl
              label="Date range"
              options={[...PRESET_OPTIONS, { value: 'custom' as const, label: 'Custom' }]}
              value={preset}
              onChange={setPreset}
            />
          </div>

          <div>
            <p className="mb-1.5 text-[0.8125rem] font-medium text-ink-secondary">Group by</p>
            <SegmentedControl
              label="Group by"
              options={GROUP_OPTIONS}
              value={groupBy}
              onChange={setGroupBy}
            />
          </div>

          {preset === 'custom' ? (
            <div className="flex items-end gap-3">
              <TextField
                label="From"
                type="date"
                value={custom.from}
                max={custom.to}
                onChange={(event) =>
                  setCustom((current) => ({ ...current, from: event.target.value }))
                }
                className="w-40"
              />
              <TextField
                label="To"
                type="date"
                value={custom.to}
                min={custom.from}
                onChange={(event) =>
                  setCustom((current) => ({ ...current, to: event.target.value }))
                }
                className="w-40"
              />
            </div>
          ) : null}
        </div>
      </Card>

      <div className="grid gap-5">
        <CaloriesChart
          points={calories.data?.data ?? []}
          groupBy={groupBy}
          isPending={calories.isPending}
          isFetching={calories.isFetching}
        />

        <MacrosChart
          points={macros.data?.data ?? []}
          groupBy={groupBy}
          isPending={macros.isPending}
          isFetching={macros.isFetching}
        />

        <GoalVsActualChart
          points={goalVsActual.data?.data ?? []}
          groupBy={groupBy}
          isPending={goalVsActual.isPending}
          isFetching={goalVsActual.isFetching}
        />

        <div className="grid gap-5 lg:grid-cols-2">
          <MealBreakdownChart
            report={mealBreakdown.data}
            isPending={mealBreakdown.isPending}
            isFetching={mealBreakdown.isFetching}
          />

          <WeightChart
            points={weight.data?.data ?? []}
            isPending={weight.isPending}
            isFetching={weight.isFetching}
          />
        </div>

        <MicrosChart
          report={micros.data}
          isPending={micros.isPending}
          isFetching={micros.isFetching}
        />
      </div>
    </>
  );
}

function presetRange(preset: RangePresetId) {
  const match = RANGE_PRESETS.find((option) => option.id === preset);

  return lastDays(match?.days ?? 30);
}
