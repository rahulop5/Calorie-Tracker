import type { Entry } from '@tracker/shared';
import { Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDayMedium, relativeDayLabel } from '@/lib/dates';
import { formatCalories, formatGrams, formatQuantity, mealLabel } from '@/lib/format';

const SOURCE_LABELS: Partial<Record<Entry['source'], string>> = {
  IMAGE: 'From photo',
  PDF: 'Imported',
  CHAT: 'From chat',
  AI_ESTIMATE: 'Estimated',
};

type EntryListProps = {
  entries: readonly Entry[];
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
  /** Off on the dashboard, where every row is already the same day. */
  groupByDate?: boolean;
};

export function EntryList({ entries, onEdit, onDelete, groupByDate = true }: EntryListProps) {
  if (!groupByDate) {
    return (
      <ul className="stagger divide-y divide-line">
        {entries.map((entry, index) => (
          <EntryRow key={entry.id} entry={entry} index={index} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </ul>
    );
  }

  const groups = groupEntriesByDate(entries);

  return (
    <div>
      {groups.map((group) => (
        <section key={group.date}>
          {/* A label, not a control: pointer-events-none stops the sticky
              header from swallowing clicks on the row scrolling under it. */}
          <h3 className="pointer-events-none sticky top-14 z-10 flex items-baseline gap-2 border-y border-line bg-plane px-5 py-1.5 text-[0.75rem] font-medium tracking-wide text-ink-muted uppercase">
            {relativeDayLabel(group.date) ?? formatDayMedium(group.date)}
            <span className="font-normal normal-case">
              {formatCalories(group.calories)}
            </span>
          </h3>

          <ul className="stagger divide-y divide-line">
            {group.entries.map((entry, index) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                index={index}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type Group = { date: string; calories: number; entries: Entry[] };

/** Entries arrive already sorted, so one pass preserves the server's order. */
function groupEntriesByDate(entries: readonly Entry[]): Group[] {
  const groups: Group[] = [];

  for (const entry of entries) {
    const last = groups.at(-1);

    if (last && last.date === entry.entryDate) {
      last.entries.push(entry);
      last.calories += entry.calories;
    } else {
      groups.push({ date: entry.entryDate, calories: entry.calories, entries: [entry] });
    }
  }

  return groups;
}

type EntryRowProps = {
  entry: Entry;
  index: number;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
};

function EntryRow({ entry, index, onEdit, onDelete }: EntryRowProps) {
  const sourceLabel = SOURCE_LABELS[entry.source];

  return (
    <li
      className="group flex items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-wash"
      style={{ '--index': index } as React.CSSProperties}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-medium text-ink">{entry.foodName}</p>
          <Badge>{mealLabel(entry.mealType)}</Badge>
          {sourceLabel ? <Badge tone="accent">{sourceLabel}</Badge> : null}
        </div>

        <p className="mt-0.5 text-[0.8125rem] text-ink-muted">
          {formatQuantity(entry.quantity, entry.unit)} · P {formatGrams(entry.proteinG)} · C{' '}
          {formatGrams(entry.carbsG)} · F {formatGrams(entry.fatG)}
        </p>
      </div>

      <p className="shrink-0 text-sm font-semibold text-ink tabular-nums">
        {formatCalories(entry.calories)}
      </p>

      {/* Always reachable by keyboard; visually calm until the row is hovered. */}
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Edit ${entry.foodName}`}
          onClick={() => onEdit(entry)}
          icon={<Pencil className="size-3.5" />}
        />
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Delete ${entry.foodName}`}
          onClick={() => onDelete(entry)}
          icon={<Trash2 className="size-3.5" />}
        />
      </div>
    </li>
  );
}
