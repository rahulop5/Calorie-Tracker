import type { PageMeta } from '@tracker/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

type PaginationProps = {
  meta: PageMeta;
  onPageChange: (page: number) => void;
  unit?: string;
};

export function Pagination({ meta, onPageChange, unit = 'items' }: PaginationProps) {
  if (meta.total === 0) {
    return null;
  }

  const firstOnPage = (meta.page - 1) * meta.pageSize + 1;
  const lastOnPage = Math.min(meta.page * meta.pageSize, meta.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
      <p className="text-[0.8125rem] text-ink-muted">
        {firstOnPage}–{lastOnPage} of {meta.total} {unit}
      </p>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon={<ChevronLeft className="size-4" />}
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
          aria-label="Previous page"
        />
        <span className="text-[0.8125rem] text-ink-secondary tabular-nums">
          {meta.page} / {meta.totalPages}
        </span>
        <Button
          size="sm"
          variant="ghost"
          icon={<ChevronRight className="size-4" />}
          disabled={!meta.hasNext}
          onClick={() => onPageChange(meta.page + 1)}
          aria-label="Next page"
        />
      </div>
    </div>
  );
}
