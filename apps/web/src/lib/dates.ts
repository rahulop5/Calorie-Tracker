import { addDays, type DateOnly, toDateOnly } from '@tracker/shared';

/**
 * The user's own calendar day. The API never guesses this, so the browser is the
 * only thing that can answer it correctly.
 */
export function today(): DateOnly {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);

  return toDateOnly(local);
}

export type DateRange = { from: DateOnly; to: DateOnly };

export function lastDays(days: number): DateRange {
  const to = today();

  return { from: addDays(to, -(days - 1)), to };
}

export const RANGE_PRESETS = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
] as const;

export type RangePresetId = (typeof RANGE_PRESETS)[number]['id'];

const WEEKDAY_MONTH_DAY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const MONTH_DAY = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

const FULL_DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

// Dates are plain calendar days, so they are formatted in UTC: shifting them
// into the local zone is what puts a label on the wrong day.
function asDate(value: DateOnly): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDayLong(value: DateOnly): string {
  return FULL_DATE.format(asDate(value));
}

export function formatDayMedium(value: DateOnly): string {
  return WEEKDAY_MONTH_DAY.format(asDate(value));
}

export function formatDayShort(value: DateOnly): string {
  return MONTH_DAY.format(asDate(value));
}

/** 'Sep 7' for a day bucket, 'Sep 7 – 13' for a week bucket. */
export function formatBucket(value: DateOnly, groupBy: 'day' | 'week'): string {
  if (groupBy === 'day') {
    return formatDayShort(value);
  }

  return `${formatDayShort(value)} – ${formatDayShort(addDays(value, 6))}`;
}

export function relativeDayLabel(value: DateOnly): string | null {
  const now = today();

  if (value === now) {
    return 'Today';
  }

  if (value === addDays(now, -1)) {
    return 'Yesterday';
  }

  return null;
}
