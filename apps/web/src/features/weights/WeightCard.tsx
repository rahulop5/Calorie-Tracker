import { weightLogInputSchema } from '@tracker/shared';
import { Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { TextField } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { formatDayMedium, today } from '@/lib/dates';
import { formatWeight } from '@/lib/format';
import { useDeleteWeight, useLatestWeight, useSaveWeight, useWeights } from './queries';

type WeightCardProps = {
  targetWeightKg: number | null;
};

export function WeightCard({ targetWeightKg }: WeightCardProps) {
  const { notify } = useToast();
  const latest = useLatestWeight();
  const saveWeight = useSaveWeight();
  const deleteWeight = useDeleteWeight();

  const [page, setPage] = useState(1);
  const history = useWeights(page);

  const [weightKg, setWeightKg] = useState('');
  const [measuredOn, setMeasuredOn] = useState(today());
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = weightLogInputSchema.safeParse({
      weightKg: weightKg.trim() === '' ? undefined : Number(weightKg),
      measuredOn,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid weight');
      return;
    }

    try {
      await saveWeight.mutateAsync(parsed.data);
      setWeightKg('');
      notify('Weight logged');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save your weight');
    }
  }

  const current = latest.data;
  const toTarget =
    current && targetWeightKg !== null ? current.weightKg - targetWeightKg : null;

  return (
    <Card>
      <CardHeader
        title="Weight"
        description={
          targetWeightKg === null
            ? 'Set a target weight in your goal to track progress.'
            : `Target ${formatWeight(targetWeightKg)}`
        }
      />

      <CardBody className="space-y-4">
        {latest.isPending ? (
          <Skeleton className="h-8 w-32" />
        ) : current ? (
          <div>
            <p className="text-2xl font-semibold text-ink">{formatWeight(current.weightKg)}</p>
            <p className="mt-0.5 text-[0.8125rem] text-ink-muted">
              {formatDayMedium(current.measuredOn)}
              {toTarget !== null
                ? ` · ${formatWeight(Math.abs(toTarget))} ${toTarget > 0 ? 'above' : 'below'} target`
                : ''}
            </p>
          </div>
        ) : (
          <p className="text-[0.8125rem] text-ink-muted">No weight logged yet.</p>
        )}

        {/* One weight per day, so re-submitting the same date corrects it. */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-wrap items-end gap-3">
          <TextField
            label="Weight"
            type="number"
            min="20"
            max="500"
            step="any"
            inputMode="decimal"
            suffix="kg"
            placeholder="74.5"
            value={weightKg}
            onChange={(event) => setWeightKg(event.target.value)}
            className="w-28"
          />
          <TextField
            label="On"
            type="date"
            value={measuredOn}
            onChange={(event) => setMeasuredOn(event.target.value)}
            className="w-40"
          />
          <Button type="submit" variant="primary" loading={saveWeight.isPending}>
            Log
          </Button>
        </form>

        {error ? (
          <p role="alert" className="text-[0.8125rem] text-critical">
            {error}
          </p>
        ) : null}

        {history.data && history.data.data.length > 0 ? (
          <div className="-mx-5 border-t border-line">
            <ul className="divide-y divide-line">
              {history.data.data.map((log) => (
                <li
                  key={log.id}
                  className="group flex items-center justify-between gap-3 px-5 py-2"
                >
                  <span className="text-[0.8125rem] text-ink-muted">
                    {formatDayMedium(log.measuredOn)}
                  </span>
                  <span className="ml-auto text-[0.8125rem] font-medium text-ink tabular-nums">
                    {formatWeight(log.weightKg)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete weight from ${log.measuredOn}`}
                    onClick={async () => {
                      await deleteWeight.mutateAsync(log.id);
                      notify('Weight removed');
                    }}
                    icon={<Trash2 className="size-3.5" />}
                    className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  />
                </li>
              ))}
            </ul>
            <Pagination meta={history.data.meta} onPageChange={setPage} unit="entries" />
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
