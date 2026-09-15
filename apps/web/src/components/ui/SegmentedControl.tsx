import { cn } from '@/lib/cn';

type Option<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
};

/** Small set of mutually exclusive choices: date range, day vs week. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex gap-0.5 rounded-lg border border-line bg-surface p-0.5', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-[0.3125rem] px-2.5 py-1 text-[0.8125rem] font-medium',
              'transition-colors duration-150',
              selected
                ? 'bg-accent text-accent-ink shadow-card'
                : 'text-ink-secondary hover:bg-wash hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
