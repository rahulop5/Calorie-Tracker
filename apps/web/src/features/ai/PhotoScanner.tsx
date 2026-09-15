import type { ExtractionResult, NutritionDraft } from '@tracker/shared';
import { Camera, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatCalories, formatGrams, formatQuantity } from '@/lib/format';
import { useExtractFromPhoto } from './queries';

const ACCEPTED = 'image/jpeg,image/png,image/webp';

type PhotoScannerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the draft the user picks; the form then pre-fills from it. */
  onUse: (draft: NutritionDraft) => void;
  /** Called with every ticked draft. Saves them directly, bypassing the form. */
  onUseMany: (drafts: NutritionDraft[]) => Promise<void>;
};

/**
 * Upload a label or plate photo and act on the drafts it produces.
 *
 * A plate usually yields several foods, so there are two ways out: "Use" sends
 * one draft back to the entry form to be edited before saving, and the tick
 * boxes add several at once. Neither path saves anything the user has not seen.
 */
export function PhotoScanner({ open, onOpenChange, onUse, onUseMany }: PhotoScannerProps) {
  const extract = useExtractFromPhoto();
  const inputRef = useRef<HTMLInputElement>(null);

  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Indexes rather than drafts, so two identical foods on one plate stay distinct.
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [adding, setAdding] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setError(null);
    setResult(null);
    setPicked(new Set());
    setPreview(URL.createObjectURL(file));

    try {
      const extracted = await extract.mutateAsync(file);

      setResult(extracted);
      // Everything ticked to start with: the common case is wanting the whole plate.
      setPicked(new Set(extracted.drafts.map((_, index) => index)));
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not read that photo. Try another.',
      );
    }
  }

  function reset() {
    setResult(null);
    setError(null);
    setPreview(null);
    setPicked(new Set());
  }

  function togglePick(index: number) {
    setPicked((current) => {
      const next = new Set(current);

      if (!next.delete(index)) {
        next.add(index);
      }

      return next;
    });
  }

  async function addPicked() {
    if (!result || picked.size === 0) {
      return;
    }

    setAdding(true);
    setError(null);

    try {
      await onUseMany(result.drafts.filter((_, index) => picked.has(index)));
      onOpenChange(false);
      reset();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not save those meals. Try again.',
      );
    } finally {
      setAdding(false);
    }
  }

  // One draft needs no tick boxes; the row's own "Use" button is the whole story.
  const multiple = (result?.drafts.length ?? 0) > 1;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
      title="Scan a photo"
      description="Upload a nutrition label or a plate of food. You confirm the numbers before anything is saved."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          {result ? (
            <Button variant="secondary" onClick={reset}>
              Try another photo
            </Button>
          ) : null}
          {multiple ? (
            <Button
              variant="primary"
              disabled={picked.size === 0 || adding}
              onClick={() => void addPicked()}
            >
              {adding ? 'Adding…' : `Add ${picked.size} ${picked.size === 1 ? 'meal' : 'meals'}`}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />

        {!result ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={extract.isPending}
            className={cn(
              'flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong',
              'px-6 py-10 text-center transition-colors duration-150',
              'hover:border-accent hover:bg-wash disabled:opacity-60',
            )}
          >
            <Camera className="size-6 text-ink-muted" aria-hidden="true" />
            <span className="text-sm font-medium text-ink">
              {extract.isPending ? 'Reading the photo…' : 'Choose a photo'}
            </span>
            <span className="text-[0.8125rem] text-ink-muted">JPEG, PNG or WebP, up to 8 MB</span>
          </button>
        ) : null}

        {preview && result ? (
          <img
            src={preview}
            alt="The photo you uploaded"
            className="max-h-40 w-full rounded-lg object-cover"
          />
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg bg-wash px-3 py-2 text-[0.8125rem] text-critical">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge tone="accent" icon={<Sparkles className="size-3" />}>
                {result.kind === 'LABEL' ? 'Nutrition label' : 'Plate of food'}
              </Badge>
              <span className="text-[0.8125rem] text-ink-muted">
                {Math.round(result.confidence * 100)}% confident
              </span>
            </div>

            {result.warnings.length > 0 ? (
              <ul className="space-y-1 rounded-lg bg-wash px-3 py-2">
                {result.warnings.map((warning) => (
                  <li key={warning} className="text-[0.8125rem] text-ink-secondary">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}

            {multiple ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.8125rem] text-ink-secondary">
                  Tick the foods to log, or use one on its own to edit it first.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setPicked(
                      picked.size === result.drafts.length
                        ? new Set()
                        : new Set(result.drafts.map((_, index) => index)),
                    )
                  }
                  className="shrink-0 text-[0.8125rem] font-medium text-accent hover:underline"
                >
                  {picked.size === result.drafts.length ? 'Clear all' : 'Select all'}
                </button>
              </div>
            ) : null}

            <ul className="space-y-2">
              {result.drafts.map((draft, index) => (
                <li
                  key={`${draft.foodName}-${index}`}
                  className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5"
                >
                  {multiple ? (
                    <input
                      type="checkbox"
                      checked={picked.has(index)}
                      onChange={() => togglePick(index)}
                      aria-label={`Log ${draft.foodName}`}
                      className="size-4 shrink-0 accent-[var(--accent)]"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{draft.foodName}</p>
                    <p className="text-[0.8125rem] text-ink-muted">
                      {formatQuantity(draft.quantity, draft.unit)} ·{' '}
                      {formatCalories(draft.calories)} · P {formatGrams(draft.proteinG)} · C{' '}
                      {formatGrams(draft.carbsG)} · F {formatGrams(draft.fatG)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      onUse(draft);
                      onOpenChange(false);
                      reset();
                    }}
                  >
                    Use
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
