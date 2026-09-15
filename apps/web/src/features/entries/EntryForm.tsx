import {
  type Entry,
  type EntryInput,
  entryInputSchema,
  type FoodUnit,
  FOOD_UNITS,
  type MealType,
  MICRONUTRIENT_KEYS,
  MICRONUTRIENTS,
  type NutritionDraft,
  estimateNutritionInputSchema,
} from '@tracker/shared';
import { Camera, ChevronDown, Sparkles } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectField, TextField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { today } from '@/lib/dates';
import { MEAL_OPTIONS, unitLabel } from '@/lib/format';
import { PhotoScanner } from '../ai/PhotoScanner';
import { useEstimateNutrition } from '../ai/queries';
import { useCreateEntriesBulk, useCreateEntry, useUpdateEntry } from './queries';

const UNIT_OPTIONS = FOOD_UNITS.map((unit) => ({ value: unit, label: unitLabel(unit) }));

type MicroValues = Partial<Record<string, string>>;

type FormValues = {
  entryDate: string;
  mealType: MealType;
  foodName: string;
  quantity: string;
  unit: FoodUnit;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  micros: MicroValues;
};

function emptyValues(defaults?: Partial<FormValues>): FormValues {
  return {
    entryDate: today(),
    mealType: 'BREAKFAST',
    foodName: '',
    quantity: '',
    unit: 'G',
    calories: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
    micros: {},
    ...defaults,
  };
}

function valuesFromEntry(entry: Entry): FormValues {
  const micros: MicroValues = {};

  for (const [key, value] of Object.entries(entry.micros)) {
    if (typeof value === 'number') {
      micros[key] = String(value);
    }
  }

  return {
    entryDate: entry.entryDate,
    mealType: entry.mealType,
    foodName: entry.foodName,
    quantity: String(entry.quantity),
    unit: entry.unit,
    calories: String(entry.calories),
    proteinG: String(entry.proteinG),
    carbsG: String(entry.carbsG),
    fatG: String(entry.fatG),
    micros,
  };
}

/** '' means "not provided"; anything else is handed to the schema to judge. */
function toNumber(value: string): number | undefined {
  const trimmed = value.trim();

  return trimmed === '' ? undefined : Number(trimmed);
}

function buildPayload(values: FormValues): Record<string, unknown> {
  const micros: Record<string, number> = {};

  for (const [key, raw] of Object.entries(values.micros)) {
    const amount = toNumber(raw ?? '');

    if (amount !== undefined) {
      micros[key] = amount;
    }
  }

  return {
    entryDate: values.entryDate,
    mealType: values.mealType,
    foodName: values.foodName,
    quantity: toNumber(values.quantity),
    unit: values.unit,
    calories: toNumber(values.calories),
    proteinG: toNumber(values.proteinG),
    carbsG: toNumber(values.carbsG),
    fatG: toNumber(values.fatG),
    micros,
  };
}

type EntryFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; absent when logging something new. */
  entry?: Entry;
  defaultDate?: string;
  defaultMeal?: MealType;
};

export function EntryForm({
  open,
  onOpenChange,
  entry,
  defaultDate,
  defaultMeal,
}: EntryFormProps) {
  const isEditing = Boolean(entry);
  const { notify } = useToast();
  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();

  const initial = useMemo(
    () =>
      entry
        ? valuesFromEntry(entry)
        : emptyValues({
            ...(defaultDate ? { entryDate: defaultDate } : {}),
            ...(defaultMeal ? { mealType: defaultMeal } : {}),
          }),
    [entry, defaultDate, defaultMeal],
  );

  // Remounting on open resets the form without an effect that fights the user.
  return open ? (
    <EntryFormBody
      key={entry?.id ?? 'new'}
      initial={initial}
      isEditing={isEditing}
      submitting={createEntry.isPending || updateEntry.isPending}
      onClose={() => onOpenChange(false)}
      onSubmit={async (payload) => {
        if (entry) {
          await updateEntry.mutateAsync({ id: entry.id, input: payload });
          notify('Meal updated');
        } else {
          await createEntry.mutateAsync(payload);
          notify('Meal logged');
        }
      }}
      open={open}
      onOpenChange={onOpenChange}
    />
  ) : null;
}

type EntryFormBodyProps = {
  initial: FormValues;
  isEditing: boolean;
  submitting: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
  onSubmit: (payload: EntryInput) => Promise<void>;
};

function EntryFormBody({
  initial,
  isEditing,
  submitting,
  open,
  onOpenChange,
  onClose,
  onSubmit,
}: EntryFormBodyProps) {
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showMicros, setShowMicros] = useState(
    () => Object.keys(initial.micros).length > 0,
  );
  const [scannerOpen, setScannerOpen] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const estimate = useEstimateNutrition();
  const createBulk = useCreateEntriesBulk();
  const { notify } = useToast();

  /**
   * A plate photo produces several foods, and this single-entry form cannot
   * hold more than one. Those go straight to the bulk endpoint instead, taking
   * the day and meal the user already chose here.
   */
  async function saveDrafts(drafts: NutritionDraft[]) {
    const entries = drafts.map((draft) => ({
      entryDate: values.entryDate,
      mealType: values.mealType,
      foodName: draft.foodName,
      quantity: draft.quantity,
      unit: draft.unit,
      calories: draft.calories,
      proteinG: draft.proteinG,
      carbsG: draft.carbsG,
      fatG: draft.fatG,
      micros: draft.micros,
    }));

    const result = await createBulk.mutateAsync({ entries, source: 'IMAGE' });

    notify(`Logged ${result.created} ${result.created === 1 ? 'meal' : 'meals'} from the photo`);
    onClose();
  }

  /** Copies a draft into the form, leaving the day and meal the user picked. */
  function applyDraft(draft: NutritionDraft, note: string) {
    const micros: MicroValues = {};

    for (const [key, value] of Object.entries(draft.micros)) {
      if (typeof value === 'number') {
        micros[key] = String(value);
      }
    }

    setValues((current) => ({
      ...current,
      foodName: draft.foodName,
      quantity: String(draft.quantity),
      unit: draft.unit,
      calories: String(draft.calories),
      proteinG: String(draft.proteinG),
      carbsG: String(draft.carbsG),
      fatG: String(draft.fatG),
      micros,
    }));

    setErrors({});
    setAiNote(note);
  }

  const macrosBlank = [values.calories, values.proteinG, values.carbsG, values.fatG].every(
    (value) => value.trim() === '',
  );
  const canEstimate = values.foodName.trim() !== '' && values.quantity.trim() !== '';

  /** Fills in blank macros from the food name, for the user to check. */
  async function handleEstimate() {
    setAiNote(null);

    const parsed = estimateNutritionInputSchema.safeParse({
      foodName: values.foodName,
      quantity: toNumber(values.quantity),
      unit: values.unit,
    });

    if (!parsed.success) {
      setFormError('Enter a food and a quantity first.');
      return;
    }

    try {
      const result = await estimate.mutateAsync(parsed.data);
      applyDraft(
        result.draft,
        `Estimated from the name, ${Math.round(result.confidence * 100)}% confident. Check the numbers before saving.`,
      );
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Could not estimate this food right now.',
      );
    }
  }

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function updateMicro(key: string, value: string) {
    setValues((current) => ({ ...current, micros: { ...current.micros, [key]: value } }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // Same schema the API validates with, so messages match on both sides.
    const parsed = entryInputSchema.safeParse(buildPayload(values));

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
      await onSubmit(parsed.data);
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fieldErrors);
        setFormError(error.details.length > 0 ? null : error.message);
      } else {
        setFormError('Could not save this meal. Please try again.');
      }
    }
  }

  const microCount = Object.values(values.micros).filter((value) => value?.trim()).length;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? 'Edit meal' : 'Log a meal'}
      description="Nutrition values are the totals for the quantity you enter."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="entry-form" variant="primary" loading={submitting}>
            {isEditing ? 'Save changes' : 'Log meal'}
          </Button>
        </>
      }
    >
      <form id="entry-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Date"
            type="date"
            value={values.entryDate}
            onChange={(event) => update('entryDate', event.target.value)}
            error={errors.entryDate}
            hint="Pick a past date to backfill a day."
            required
          />
          <SelectField
            label="Meal"
            options={MEAL_OPTIONS}
            value={values.mealType}
            onChange={(event) => update('mealType', event.target.value as MealType)}
            error={errors.mealType}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<Camera className="size-3.5" />}
            onClick={() => setScannerOpen(true)}
          >
            Scan a photo
          </Button>
          <Button
            size="sm"
            icon={<Sparkles className="size-3.5" />}
            loading={estimate.isPending}
            disabled={!canEstimate}
            onClick={() => void handleEstimate()}
            title={
              canEstimate
                ? 'Estimate the numbers from the food name'
                : 'Enter a food and quantity first'
            }
          >
            Estimate macros
          </Button>
        </div>

        {aiNote ? (
          <p className="flex items-start gap-1.5 rounded-lg bg-accent-wash/40 px-3 py-2 text-[0.8125rem] text-ink-secondary">
            <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {aiNote}
          </p>
        ) : macrosBlank && canEstimate ? (
          <p className="text-[0.8125rem] text-ink-muted">
            No numbers yet? Use <span className="font-medium">Estimate macros</span> and check what
            it suggests.
          </p>
        ) : null}

        <TextField
          label="Food"
          placeholder="Oats with milk"
          value={values.foodName}
          onChange={(event) => update('foodName', event.target.value)}
          error={errors.foodName}
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Quantity"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder="200"
            value={values.quantity}
            onChange={(event) => update('quantity', event.target.value)}
            error={errors.quantity}
            required
          />
          <SelectField
            label="Unit"
            options={UNIT_OPTIONS}
            value={values.unit}
            onChange={(event) => update('unit', event.target.value as FoodUnit)}
            error={errors.unit}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <TextField
            label="Calories"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            suffix="kcal"
            value={values.calories}
            onChange={(event) => update('calories', event.target.value)}
            error={errors.calories}
            required
          />
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

        <div className="rounded-lg border border-line">
          <button
            type="button"
            onClick={() => setShowMicros((shown) => !shown)}
            aria-expanded={showMicros}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[0.8125rem] font-medium text-ink-secondary transition-colors hover:bg-wash"
          >
            <span>
              Micronutrients
              {microCount > 0 ? (
                <span className="ml-1.5 text-ink-muted">({microCount} filled)</span>
              ) : (
                <span className="ml-1.5 font-normal text-ink-muted">optional</span>
              )}
            </span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 transition-transform duration-200',
                showMicros && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>

          {showMicros ? (
            // Driven by the shared registry, so a new nutrient needs no UI change.
            <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2 lg:grid-cols-3">
              {MICRONUTRIENT_KEYS.map((key) => (
                <TextField
                  key={key}
                  label={MICRONUTRIENTS[key].label}
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  suffix={MICRONUTRIENTS[key].unit}
                  value={values.micros[key] ?? ''}
                  onChange={(event) => updateMicro(key, event.target.value)}
                  error={errors[`micros.${key}`]}
                />
              ))}
            </div>
          ) : null}
        </div>

        {formError ? (
          <p role="alert" className="rounded-lg bg-wash px-3 py-2 text-[0.8125rem] text-critical">
            {formError}
          </p>
        ) : null}
      </form>

      <PhotoScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onUse={(draft) =>
          applyDraft(draft, 'Filled in from the photo. Check the numbers before saving.')
        }
        onUseMany={saveDrafts}
      />
    </Modal>
  );
}
