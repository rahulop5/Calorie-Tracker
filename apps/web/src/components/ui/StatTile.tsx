import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type StatTileProps = {
  label: string;
  value: string;
  /** Progress towards a target, 0-100+. Renders a meter under the value. */
  percent?: number | null;
  meta?: ReactNode;
  seriesColor?: string;
  className?: string;
};

/**
 * The meter track is a lighter step of the fill's own colour, so the state
 * reads across the whole bar rather than only where it is filled.
 */
export function StatTile({
  label,
  value,
  percent,
  meta,
  seriesColor = 'var(--accent)',
  className,
}: StatTileProps) {
  const clamped = percent === null || percent === undefined ? null : Math.min(percent, 100);
  const over = percent !== null && percent !== undefined && percent > 105;

  return (
    <div
      className={cn(
        'rounded-xl border border-line bg-surface p-4 shadow-card',
        'transition-shadow duration-200 hover:shadow-lifted',
        className,
      )}
    >
      <p className="text-[0.8125rem] text-ink-muted">{label}</p>

      {/* Proportional figures: tabular-nums makes a big number look loose. */}
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>

      {clamped !== null ? (
        <div className="mt-3">
          <div
            className="h-1.5 overflow-hidden rounded-full"
            style={{ backgroundColor: 'color-mix(in oklab, var(--wash-strong), transparent 0%)' }}
            role="presentation"
          >
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: `${clamped}%`,
                backgroundColor: over ? 'var(--warning)' : seriesColor,
              }}
            />
          </div>
        </div>
      ) : null}

      {meta ? <div className="mt-2 text-[0.8125rem] text-ink-muted">{meta}</div> : null}
    </div>
  );
}
