import { ChevronDown } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '@/lib/cn';

const CONTROL_CLASS = cn(
  'h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink',
  'transition-[border-color,box-shadow] duration-150',
  'placeholder:text-ink-muted',
  'hover:border-line-strong',
  'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25',
  'disabled:opacity-50',
);

type FieldShellProps = {
  label: string;
  error?: string;
  hint?: string;
  suffix?: ReactNode;
  children: (id: string, describedBy: string | undefined) => ReactNode;
};

/** Shared label, hint, error and aria wiring for every control. */
function FieldShell({ label, error, hint, suffix, children }: FieldShellProps) {
  const id = useId();
  const messageId = error || hint ? `${id}-message` : undefined;

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-[0.8125rem] font-medium text-ink-secondary">
        {label}
      </label>

      <div className="relative">
        {children(id, messageId)}
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.8125rem] text-ink-muted">
            {suffix}
          </span>
        ) : null}
      </div>

      {error ? (
        <p id={messageId} className="mt-1.5 text-[0.8125rem] text-critical">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-[0.8125rem] text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  error?: string;
  hint?: string;
  suffix?: ReactNode;
};

export function TextField({ label, error, hint, suffix, className, ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint} suffix={suffix}>
      {(id, describedBy) => (
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            CONTROL_CLASS,
            error && 'border-critical focus:border-critical focus:ring-critical/25',
            suffix && 'pr-12',
            className,
          )}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

type Option = { value: string; label: string };

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'children'> & {
  label: string;
  options: readonly Option[];
  error?: string;
  hint?: string;
};

/**
 * A native select: it is keyboard and screen-reader correct for free, and gives
 * mobile users the platform picker.
 */
export function SelectField({
  label,
  options,
  error,
  hint,
  className,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <>
          <select
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              CONTROL_CLASS,
              'cursor-pointer appearance-none pr-9',
              error && 'border-critical focus:border-critical focus:ring-critical/25',
              className,
            )}
            {...rest}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
        </>
      )}
    </FieldShell>
  );
}
