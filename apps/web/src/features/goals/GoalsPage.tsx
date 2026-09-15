import { Pencil, Target } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDayMedium } from '@/lib/dates';
import { formatCalories, formatGrams, formatWeight } from '@/lib/format';
import { WeightCard } from '../weights/WeightCard';
import { GoalForm } from './GoalForm';
import { useCurrentGoal, useGoalHistory } from './queries';

export function GoalsPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  const currentGoal = useCurrentGoal();
  const history = useGoalHistory(historyPage);

  const goal = currentGoal.data ?? null;

  return (
    <>
      <PageHeader
        title="Goals"
        description="Your targets, and every version of them."
        action={
          goal ? (
            <Button
              variant="primary"
              icon={<Pencil className="size-4" />}
              onClick={() => setFormOpen(true)}
            >
              Update goal
            </Button>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Current goal"
            description={goal ? `In force since ${formatDayMedium(goal.effectiveFrom)}` : undefined}
          />

          <CardBody>
            {currentGoal.isPending ? (
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-16" />
                ))}
              </div>
            ) : goal ? (
              <dl className="grid grid-cols-2 gap-4">
                <GoalValue label="Daily calories" value={formatCalories(goal.dailyCalories)} />
                <GoalValue label="Protein" value={formatGrams(goal.proteinG)} />
                <GoalValue label="Carbs" value={formatGrams(goal.carbsG)} />
                <GoalValue label="Fat" value={formatGrams(goal.fatG)} />
                {goal.targetWeightKg !== null ? (
                  <GoalValue
                    label="Target weight"
                    value={formatWeight(goal.targetWeightKg)}
                    className="col-span-2"
                  />
                ) : null}
              </dl>
            ) : (
              <EmptyState
                icon={<Target className="size-5" />}
                title="No goal yet"
                description="Set daily calorie and macro targets to unlock the goal comparison charts."
                action={
                  <Button variant="primary" onClick={() => setFormOpen(true)}>
                    Set a goal
                  </Button>
                }
              />
            )}
          </CardBody>
        </Card>

        <WeightCard targetWeightKg={goal?.targetWeightKg ?? null} />

        <Card className="lg:col-span-2">
          <CardHeader
            title="Goal history"
            description="A change never rewrites the past: each version applies from its own date."
          />

          {history.isPending ? (
            <CardBody>
              <Skeleton className="h-24 w-full" />
            </CardBody>
          ) : !history.data || history.data.data.length === 0 ? (
            <EmptyState title="No versions yet" />
          ) : (
            <>
              <ul className="divide-y divide-line border-t border-line">
                {history.data.data.map((version, index) => (
                  <li
                    key={version.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
                  >
                    <span className="text-[0.8125rem] font-medium text-ink">
                      {formatDayMedium(version.effectiveFrom)}
                    </span>
                    {index === 0 && historyPage === 1 ? (
                      <Badge tone="accent">Current</Badge>
                    ) : null}
                    <span className="ml-auto text-[0.8125rem] text-ink-muted">
                      {formatCalories(version.dailyCalories)} · P {formatGrams(version.proteinG)} ·
                      C {formatGrams(version.carbsG)} · F {formatGrams(version.fatG)}
                      {version.targetWeightKg !== null
                        ? ` · ${formatWeight(version.targetWeightKg)}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <Pagination meta={history.data.meta} onPageChange={setHistoryPage} unit="versions" />
            </>
          )}
        </Card>
      </div>

      <GoalForm open={formOpen} onOpenChange={setFormOpen} current={goal} />
    </>
  );
}

function GoalValue({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[0.8125rem] text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold text-ink">{value}</dd>
    </div>
  );
}
