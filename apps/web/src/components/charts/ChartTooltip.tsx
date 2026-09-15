import type { ReactNode } from 'react';

export type TooltipRow = {
  label: string;
  value: string;
  color?: string;
};

type ChartTooltipProps = {
  title: string;
  rows: TooltipRow[];
  footer?: ReactNode;
};

/**
 * Values wear text tokens; identity comes from the swatch beside them, never
 * from colouring the text.
 */
export function ChartTooltip({ title, rows, footer }: ChartTooltipProps) {
  return (
    <div className="min-w-[10rem] rounded-lg border border-line bg-surface-raised px-3 py-2.5 shadow-overlay">
      <p className="text-[0.8125rem] font-medium text-ink">{title}</p>

      <dl className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-[0.8125rem] text-ink-secondary">
              {row.color ? (
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
              ) : null}
              {row.label}
            </dt>
            <dd className="text-[0.8125rem] font-medium text-ink tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>

      {footer ? (
        <div className="mt-2 border-t border-line pt-1.5 text-[0.75rem] text-ink-muted">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
