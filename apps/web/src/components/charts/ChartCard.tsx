import { BarChart3, Table2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/cn';
import { Card, CardHeader } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ChartSkeleton } from '../ui/Skeleton';

export type LegendItem = {
  label: string;
  color: string;
};

type ChartCardProps = {
  title: string;
  description?: string;
  /** Required for two or more series; omit for a single series. */
  legend?: readonly LegendItem[];
  /** First load shows a skeleton; a refetch dims instead, so nothing jumps. */
  isPending: boolean;
  isFetching?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  height?: number;
  table: ReactNode;
  /** Rendered below the plot, outside its fixed height so it cannot be clipped. */
  footnote?: ReactNode;
  children: ReactNode;
};

export function ChartCard({
  title,
  description,
  legend,
  isPending,
  isFetching = false,
  isEmpty = false,
  emptyMessage = 'Nothing logged in this range yet.',
  height = 260,
  table,
  footnote,
  children,
}: ChartCardProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title={title}
        description={description}
        action={
          <div
            role="radiogroup"
            aria-label={`${title} view`}
            className="flex gap-0.5 rounded-lg border border-line p-0.5"
          >
            <ViewToggle
              selected={view === 'chart'}
              onSelect={() => setView('chart')}
              label="Chart"
              icon={<BarChart3 className="size-3.5" />}
            />
            <ViewToggle
              selected={view === 'table'}
              onSelect={() => setView('table')}
              label="Table"
              icon={<Table2 className="size-3.5" />}
            />
          </div>
        }
      />

      {legend && legend.length > 1 ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-5">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5 text-[0.8125rem] text-ink-secondary">
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="px-2 pt-4 pb-5">
        {isPending ? (
          <div className="px-3">
            <ChartSkeleton height={height} />
          </div>
        ) : isEmpty ? (
          <EmptyState title="No data yet" description={emptyMessage} />
        ) : (
          <div
            className={cn(
              'transition-opacity duration-200',
              isFetching && 'opacity-60',
            )}
          >
            {view === 'chart' ? (
              // Height includes the axis band, so the card never grows an
              // inner scrollbar around its own labels.
              <div style={{ height }}>{children}</div>
            ) : (
              <div className="px-1">{table}</div>
            )}

            {footnote ? (
              <p className="px-3 pt-3 text-[0.75rem] text-ink-muted">{footnote}</p>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  );
}

type ViewToggleProps = {
  selected: boolean;
  onSelect: () => void;
  label: string;
  icon: ReactNode;
};

function ViewToggle({ selected, onSelect, label, icon }: ViewToggleProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={cn(
        'rounded-[0.3125rem] p-1.5 transition-colors duration-150',
        selected ? 'bg-wash-strong text-ink' : 'text-ink-muted hover:text-ink',
      )}
    >
      {icon}
    </button>
  );
}
