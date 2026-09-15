import type { Entry } from '@tracker/shared';
import { Plus, Target, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MACRO_SERIES } from '@/components/charts/palette';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { RowsSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { StatTile } from '@/components/ui/StatTile';
import { useToast } from '@/components/ui/Toast';
import { formatDayLong, lastDays, today } from '@/lib/dates';
import { formatCompact, formatGrams, formatNumber } from '@/lib/format';
import { EntryForm } from '../entries/EntryForm';
import { EntryList } from '../entries/EntryList';
import { useDeleteEntry, useEntries } from '../entries/queries';
import { useCurrentGoal } from '../goals/queries';
import { CaloriesChart } from '../reports/charts/CaloriesChart';
import { useCaloriesReport, useSummaryReport } from '../reports/queries';

export function DashboardPage() {
  const { notify } = useToast();
  const day = today();
  const week = lastDays(7);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | undefined>();
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null);

  const goal = useCurrentGoal();
  const todaySummary = useSummaryReport({ from: day, to: day });
  const todayEntries = useEntries({ from: day, to: day, pageSize: 50, sort: 'entryDate:desc' });
  const weekCalories = useCaloriesReport(week, 'day');
  const deleteEntry = useDeleteEntry();

  const totals = todaySummary.data?.totals;
  const target = goal.data;

  function percentOf(actual: number | undefined, goalValue: number | undefined): number | null {
    if (actual === undefined || goalValue === undefined || goalValue === 0) {
      return null;
    }

    return (actual / goalValue) * 100;
  }

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    await deleteEntry.mutateAsync(pendingDelete.id);
    notify('Meal deleted');
  }

  const caloriesLeft =
    totals && target ? Math.max(target.dailyCalories - totals.calories, 0) : null;

  return (
    <>
      <PageHeader
        title="Today"
        description={formatDayLong(day)}
        action={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={openCreate}>
            Log meal
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* The one hero figure on this view. */}
        <Card className="lg:col-span-1">
          <CardBody>
            <p className="text-[0.8125rem] text-ink-muted">Eaten today</p>

            {todaySummary.isPending ? (
              <Skeleton className="mt-2 h-12 w-32" />
            ) : (
              <p className="mt-1 text-5xl font-semibold tracking-tight text-ink">
                {formatCompact(totals?.calories ?? 0)}
                <span className="ml-1.5 text-base font-medium text-ink-muted">kcal</span>
              </p>
            )}

            {target ? (
              <p className="mt-2 text-[0.8125rem] text-ink-secondary">
                {caloriesLeft !== null && caloriesLeft > 0
                  ? `${formatNumber(caloriesLeft)} kcal left of ${formatNumber(target.dailyCalories)}`
                  : `Over your ${formatNumber(target.dailyCalories)} kcal goal`}
              </p>
            ) : (
              <Link
                to="/goals"
                className="mt-2 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-accent hover:underline"
              >
                <Target className="size-3.5" aria-hidden="true" />
                Set a daily goal
              </Link>
            )}
          </CardBody>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
          {MACRO_SERIES.map((macro) => (
            <StatTile
              key={macro.key}
              label={macro.label}
              value={totals ? formatGrams(totals[macro.key]) : '—'}
              percent={percentOf(totals?.[macro.key], target?.[macro.key])}
              seriesColor={macro.color}
              meta={
                target ? `of ${formatGrams(target[macro.key])}` : 'No target set'
              }
            />
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <CaloriesChart
          points={weekCalories.data?.data ?? []}
          groupBy="day"
          isPending={weekCalories.isPending}
          isFetching={weekCalories.isFetching}
        />

        <Card className="overflow-hidden">
          <CardHeader
            title="Today's meals"
            description={
              todayEntries.data ? `${todayEntries.data.meta.total} logged` : undefined
            }
            action={
              <Link
                to="/entries"
                className="text-[0.8125rem] font-medium text-accent hover:underline"
              >
                View all
              </Link>
            }
          />

          <div className="mt-4">
            {todayEntries.isPending ? (
              <div className="px-5 pb-5">
                <RowsSkeleton rows={3} />
              </div>
            ) : todayEntries.data && todayEntries.data.data.length > 0 ? (
              <EntryList
                entries={todayEntries.data.data}
                groupByDate={false}
                onEdit={(entry) => {
                  setEditing(entry);
                  setFormOpen(true);
                }}
                onDelete={setPendingDelete}
              />
            ) : (
              <EmptyState
                icon={<UtensilsCrossed className="size-5" />}
                title="Nothing logged yet today"
                description="Add your first meal and the numbers above will fill in."
                action={
                  <Button variant="primary" onClick={openCreate}>
                    Log meal
                  </Button>
                }
              />
            )}
          </div>
        </Card>
      </div>

      <EntryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        entry={editing}
        defaultDate={day}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this meal?"
        description={`"${pendingDelete?.foodName ?? ''}" will be removed from your log and your reports.`}
        onConfirm={confirmDelete}
      />
    </>
  );
}
