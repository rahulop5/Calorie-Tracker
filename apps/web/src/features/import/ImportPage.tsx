import { entryInputSchema, type EntryInput, type ImportCandidate } from '@tracker/shared';
import { AlertTriangle, FileUp, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { MEAL_OPTIONS } from '@/lib/format';
import { useParsePdf } from '../ai/queries';
import { useCreateEntriesBulk } from '../entries/queries';

/**
 * Import is stateless on the server: the parse comes back as candidates and
 * lives in this component's state until the user confirms, at which point the
 * corrected rows go to the normal bulk endpoint.
 */

type Row = {
  key: number;
  draft: Record<string, unknown>;
  issues: string[];
  include: boolean;
};

function toRows(candidates: ImportCandidate[]): Row[] {
  return candidates.map((candidate) => ({
    key: candidate.row,
    draft: { ...candidate.draft },
    issues: candidate.issues,
    // Rows the server flagged start excluded, so a bad row is opt-in.
    include: candidate.valid,
  }));
}

function fieldValue(draft: Record<string, unknown>, field: string): string {
  const value = draft[field];

  return value === undefined || value === null ? '' : String(value);
}

export function ImportPage() {
  const { notify } = useToast();
  const parsePdf = useParsePdf();
  const createBulk = useCreateEntriesBulk();
  const inputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setError(null);
    setRows(null);
    setFilename(file.name);

    try {
      const result = await parsePdf.mutateAsync(file);
      setRows(toRows(result.candidates));
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Could not read that PDF. Try another file.',
      );
    }
  }

  function updateField(key: number, field: string, value: string) {
    setRows((current) =>
      current?.map((row) =>
        row.key === key
          ? {
              ...row,
              draft: {
                ...row.draft,
                // Numeric columns stay numbers so the schema can judge them.
                [field]: ['entryDate', 'mealType', 'foodName', 'unit'].includes(field)
                  ? value
                  : value === ''
                    ? undefined
                    : Number(value),
              },
            }
          : row,
      ) ?? null,
    );
  }

  function toggle(key: number) {
    setRows(
      (current) =>
        current?.map((row) => (row.key === key ? { ...row, include: !row.include } : row)) ?? null,
    );
  }

  const selected = rows?.filter((row) => row.include) ?? [];

  // Validated here with the same schema the API uses, so the button reflects
  // whether the confirm will actually succeed.
  const parsedRows = selected.map((row) => ({
    key: row.key,
    parsed: entryInputSchema.safeParse(row.draft),
  }));
  const invalid = parsedRows.filter((row) => !row.parsed.success);
  const ready = parsedRows.length > 0 && invalid.length === 0;

  async function confirmImport() {
    const entries = parsedRows
      .map((row) => (row.parsed.success ? row.parsed.data : null))
      .filter((entry): entry is EntryInput => entry !== null);

    try {
      const result = await createBulk.mutateAsync({ entries, source: 'PDF' });
      notify(`Imported ${result.created} ${result.created === 1 ? 'meal' : 'meals'}`);
      setRows(null);
      setFilename(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not import those rows.');
    }
  }

  return (
    <>
      <PageHeader
        title="Import a diary"
        description="Upload a food diary PDF. You review and fix every row before anything is saved."
      />

      <Card className="mb-5">
        <CardBody>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={parsePdf.isPending}
            className={cn(
              'flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong',
              'px-6 py-10 text-center transition-colors duration-150',
              'hover:border-accent hover:bg-wash disabled:opacity-60',
            )}
          >
            <FileUp className="size-6 text-ink-muted" aria-hidden="true" />
            <span className="text-sm font-medium text-ink">
              {parsePdf.isPending ? 'Reading the diary…' : (filename ?? 'Choose a PDF')}
            </span>
            <span className="text-[0.8125rem] text-ink-muted">Tabular PDF, up to 15 MB</span>
          </button>

          {error ? (
            <p role="alert" className="mt-3 rounded-lg bg-wash px-3 py-2 text-[0.8125rem] text-critical">
              {error}
            </p>
          ) : null}
        </CardBody>
      </Card>

      {rows ? (
        rows.length === 0 ? (
          <Card>
            <EmptyState
              title="No rows found"
              description="That PDF did not contain anything that looked like a food diary."
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <p className="text-[0.8125rem] text-ink-secondary">
                {selected.length} of {rows.length} rows selected
                {invalid.length > 0 ? (
                  <span className="ml-1 text-critical">
                    · {invalid.length} still need fixing
                  </span>
                ) : null}
              </p>

              <Button
                variant="primary"
                icon={<Upload className="size-4" />}
                disabled={!ready}
                loading={createBulk.isPending}
                onClick={() => void confirmImport()}
              >
                Import {selected.length > 0 ? selected.length : ''}
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-line text-left text-ink-muted">
                    <th scope="col" className="px-3 py-2 font-medium">
                      Use
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Meal
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Food
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Qty
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Calories
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      P / C / F
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.key}
                      className={cn(
                        'border-b border-line last:border-0 align-top',
                        row.issues.length > 0 && 'bg-wash',
                      )}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={() => toggle(row.key)}
                          aria-label={`Include row ${row.key + 1}`}
                          className="size-4 accent-[var(--accent)]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="date"
                          value={fieldValue(row.draft, 'entryDate')}
                          onChange={(event) => updateField(row.key, 'entryDate', event.target.value)}
                          aria-label={`Date for row ${row.key + 1}`}
                          className="w-36 rounded-md border border-line bg-surface px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={fieldValue(row.draft, 'mealType')}
                          onChange={(event) => updateField(row.key, 'mealType', event.target.value)}
                          aria-label={`Meal for row ${row.key + 1}`}
                          className="rounded-md border border-line bg-surface px-2 py-1"
                        >
                          {MEAL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={fieldValue(row.draft, 'foodName')}
                          onChange={(event) => updateField(row.key, 'foodName', event.target.value)}
                          aria-label={`Food for row ${row.key + 1}`}
                          className="w-40 rounded-md border border-line bg-surface px-2 py-1"
                        />
                        {row.issues.length > 0 ? (
                          <span className="mt-1 flex items-start gap-1 text-[0.75rem] text-critical">
                            <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                            {row.issues.join(' ')}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="any"
                          value={fieldValue(row.draft, 'quantity')}
                          onChange={(event) => updateField(row.key, 'quantity', event.target.value)}
                          aria-label={`Quantity for row ${row.key + 1}`}
                          className="w-20 rounded-md border border-line bg-surface px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="any"
                          value={fieldValue(row.draft, 'calories')}
                          onChange={(event) => updateField(row.key, 'calories', event.target.value)}
                          aria-label={`Calories for row ${row.key + 1}`}
                          className="w-20 rounded-md border border-line bg-surface px-2 py-1"
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-ink-muted">
                        {fieldValue(row.draft, 'proteinG')} / {fieldValue(row.draft, 'carbsG')} /{' '}
                        {fieldValue(row.draft, 'fatG')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : null}
    </>
  );
}
