import { ENTRY_SORTS, type Entry, type EntrySort, type MealType } from '@tracker/shared';
import { Plus, Search, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { SelectField, TextField } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { RowsSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { lastDays } from '@/lib/dates';
import { MEAL_OPTIONS } from '@/lib/format';
import { EntryForm } from './EntryForm';
import { EntryList } from './EntryList';
import { useDeleteEntry, useEntries } from './queries';

const SORT_LABELS: Record<EntrySort, string> = {
  'entryDate:desc': 'Newest first',
  'entryDate:asc': 'Oldest first',
  'calories:desc': 'Most calories',
  'calories:asc': 'Fewest calories',
};

const SORT_OPTIONS = ENTRY_SORTS.map((sort) => ({ value: sort, label: SORT_LABELS[sort] }));

const MEAL_FILTER_OPTIONS = [{ value: '', label: 'All meals' }, ...MEAL_OPTIONS];

const PAGE_SIZE = 20;

export function EntriesPage() {
  const defaultRange = lastDays(30);
  const { notify } = useToast();

  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [mealType, setMealType] = useState<MealType | ''>('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<EntrySort>('entryDate:desc');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | undefined>();
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null);

  const deleteEntry = useDeleteEntry();

  const entries = useEntries({
    from,
    to,
    page,
    pageSize: PAGE_SIZE,
    sort,
    ...(mealType ? { mealType } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  });

  // Any filter change invalidates the current page number.
  function updateFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }

  function openEdit(entry: Entry) {
    setEditing(entry);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    await deleteEntry.mutateAsync(pendingDelete.id);
    notify('Meal deleted');
  }

  const hasFilters = Boolean(mealType || search.trim());

  return (
    <>
      <PageHeader
        title="Meals"
        description="Everything you have logged, filterable by date and meal."
        action={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={openCreate}>
            Log meal
          </Button>
        }
      />

      {/* One filter row above the list, not per-section controls. */}
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <TextField
            label="From"
            type="date"
            value={from}
            max={to}
            onChange={(event) => updateFilter(() => setFrom(event.target.value))}
          />
          <TextField
            label="To"
            type="date"
            value={to}
            min={from}
            onChange={(event) => updateFilter(() => setTo(event.target.value))}
          />
          <SelectField
            label="Meal"
            options={MEAL_FILTER_OPTIONS}
            value={mealType}
            onChange={(event) =>
              updateFilter(() => setMealType(event.target.value as MealType | ''))
            }
          />
          <SelectField
            label="Sort"
            options={SORT_OPTIONS}
            value={sort}
            onChange={(event) => updateFilter(() => setSort(event.target.value as EntrySort))}
          />
          <div className="relative">
            <TextField
              label="Search"
              placeholder="Food name"
              value={search}
              onChange={(event) => updateFilter(() => setSearch(event.target.value))}
              className="pl-9"
            />
            <Search
              className="pointer-events-none absolute bottom-3 left-3 size-4 text-ink-muted"
              aria-hidden="true"
            />
          </div>
        </div>
      </Card>

      {/* `clip`, not `hidden`: both round off the full-bleed day headers and row
          hovers, but `hidden` makes the card a scroll container, which then owns
          the sticky day headers and offsets them 56px down into the card instead
          of pinning them under the app bar. */}
      <Card className="overflow-clip">
        {entries.isPending ? (
          <div className="p-5">
            <RowsSkeleton rows={6} />
          </div>
        ) : entries.isError ? (
          <EmptyState
            title="Could not load meals"
            description="Check your connection and try again."
            action={<Button onClick={() => void entries.refetch()}>Retry</Button>}
          />
        ) : entries.data.data.length === 0 ? (
          <EmptyState
            icon={<UtensilsCrossed className="size-5" />}
            title={hasFilters ? 'No meals match these filters' : 'No meals in this range'}
            description={
              hasFilters
                ? 'Try widening the date range or clearing the search.'
                : 'Log your first meal to start seeing trends.'
            }
            action={
              hasFilters ? (
                <Button
                  onClick={() =>
                    updateFilter(() => {
                      setMealType('');
                      setSearch('');
                    })
                  }
                >
                  Clear filters
                </Button>
              ) : (
                <Button variant="primary" onClick={openCreate}>
                  Log meal
                </Button>
              )
            }
          />
        ) : (
          <div className={cn('transition-opacity duration-200', entries.isFetching && 'opacity-60')}>
            <EntryList
              entries={entries.data.data}
              onEdit={openEdit}
              onDelete={setPendingDelete}
            />
            <Pagination meta={entries.data.meta} onPageChange={setPage} unit="meals" />
          </div>
        )}
      </Card>

      <EntryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        entry={editing}
        defaultDate={to}
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
