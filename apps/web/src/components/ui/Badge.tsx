import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'accent' | 'good' | 'warning' | 'critical';

const TONES: Record<Tone, string> = {
  neutral: 'bg-wash text-ink-secondary',
  accent: 'bg-accent-wash text-ink',
  good: 'bg-wash text-good-ink',
  warning: 'bg-wash text-ink-secondary',
  critical: 'bg-wash text-critical',
};

type BadgeProps = {
  children: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
};

export function Badge({ children, tone = 'neutral', icon, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5',
        'text-[0.6875rem] font-medium tracking-wide uppercase',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
