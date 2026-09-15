import { type Goal, goalInputSchema } from '@tracker/shared';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { today } from '@/lib/dates';
import { useSaveGoal } from './queries';

type GoalFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: Goal | null;
};

function toNumber(value: string): number | undefined {
  const trimmed = value.trim();

  return trimmed === '' ? undefined : Number(trimmed);
}

export function GoalForm({ open, onOpenChange, current }: GoalFormProps) {
  const { notify } = useToast();
  const saveGoal = useSaveGoal();

  const [values, setValues] = useState(() => ({
    dailyCalories: current ? String(current.dailyCalories) : '',
    proteinG: current ? String(current.proteinG) : '',
    carbsG: current ? String(current.carbsG) : '',
    fatG: current ? String(current.fatG) : '',
    targetWeightKg: current?.targetWeightKg != null ? String(current.targetWeightKg) : '',
    effectiveFrom: today(),
  }));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function update(key: keyof typeof values, value: string) {
    setValues((currentValues) => ({ ...currentValues, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = goalInputSchema.safeParse({
      dailyCalories: toNumber(values.dailyCalories),
      proteinG: toNumber(values.proteinG),
      carbsG: toNumber(values.carbsG),
      fatG: toNumber(values.fatG),
      // Empty clears the target; the API treats null as "remove it".
      targetWeightKg: toNumber(values.targetWeightKg) ?? null,
      effectiveFrom: values.effectiveFrom,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};

      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path.join('.')] ??= issue.message;
      }

      setErrors(fieldErrors);
      return;
    }

    setErrors({});

    try {
      await saveGoal.mutateAsync(parsed.data);
      notify(current ? 'Goal updated' : 'Goal set');
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        setFormError(error.details.length > 0 ? null : error.message);
      } else {
        setFormError('Could not save your goal. Please try again.');
      }
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={current ? 'Update your goal' : 'Set your goal'}
      description="Saving creates a new version from this date, so past reports keep comparing against the goal that was active then."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="goal-form" variant="primary" loading={saveGoal.isPending}>
            Save goal
          </Button>
        </>
      }
    >
      <form id="goal-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextField
          label="Daily calories"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          suffix="kcal"
          placeholder="2000"
          value={values.dailyCalories}
          onChange={(event) => update('dailyCalories', event.target.value)}
          error={errors.dailyCalories}
          required
        />

        <div className="grid grid-cols-3 gap-3">
          <TextField
            label="Protein"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            suffix="g"
            value={values.proteinG}
            onChange={(event) => update('proteinG', event.target.value)}
            error={errors.proteinG}
            required
          />
          <TextField
            label="Carbs"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            suffix="g"
            value={values.carbsG}
            onChange={(event) => update('carbsG', event.target.value)}
            error={errors.carbsG}
            required
          />
          <TextField
            label="Fat"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            suffix="g"
            value={values.fatG}
            onChange={(event) => update('fatG', event.target.value)}
            error={errors.fatG}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Target weight"
            type="number"
            min="20"
            max="500"
            step="any"
            inputMode="decimal"
            suffix="kg"
            placeholder="Optional"
            value={values.targetWeightKg}
            onChange={(event) => update('targetWeightKg', event.target.value)}
            error={errors.targetWeightKg}
            hint="Leave blank to clear it."
          />
          <TextField
            label="Effective from"
            type="date"
            value={values.effectiveFrom}
            onChange={(event) => update('effectiveFrom', event.target.value)}
            error={errors.effectiveFrom}
            required
          />
        </div>

        {formError ? (
          <p role="alert" className="rounded-lg bg-wash px-3 py-2 text-[0.8125rem] text-critical">
            {formError}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
