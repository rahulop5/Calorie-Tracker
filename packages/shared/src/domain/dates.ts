/**
 * Calendar dates travel as 'YYYY-MM-DD' strings across the API and are stored in
 * `date` columns. Keeping one representation end to end is what removes timezone
 * handling from the app: there is no instant to convert, so there is no off-by-
 * one-day bug and no `tz` parameter on any endpoint.
 *
 * The format also sorts and compares correctly as a plain string, which is why
 * the helpers below use `<=` rather than converting to Date first.
 */
export type DateOnly = string;

const MS_PER_DAY = 86_400_000;

/** 'YYYY-MM-DD' to the UTC-midnight Date that Prisma writes to a `date` column. */
export function toDbDate(value: DateOnly): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** A Date read from a `date` column back to 'YYYY-MM-DD'. */
export function toDateOnly(value: Date): DateOnly {
  return value.toISOString().slice(0, 10);
}

/**
 * Server-side fallback when a request omits a date. Clients should send their own
 * local date, because the server cannot know the user's timezone.
 */
export function todayDateOnly(): DateOnly {
  return toDateOnly(new Date());
}

export function addDays(value: DateOnly, days: number): DateOnly {
  const date = toDbDate(value);
  date.setUTCDate(date.getUTCDate() + days);

  return toDateOnly(date);
}

/** Inclusive day count: the same date twice is 1. */
export function countDays(from: DateOnly, to: DateOnly): number {
  const span = toDbDate(to).getTime() - toDbDate(from).getTime();

  return Math.round(span / MS_PER_DAY) + 1;
}

/** Every day in the range, used to zero-fill gaps so charts have no holes. */
export function eachDay(from: DateOnly, to: DateOnly): DateOnly[] {
  const days: DateOnly[] = [];

  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day);
  }

  return days;
}

/** The Monday of the week containing the date. Week buckets are labelled by it. */
export function startOfWeek(value: DateOnly): DateOnly {
  const date = toDbDate(value);
  const weekday = date.getUTCDay();
  // getUTCDay is 0 for Sunday, so shift it to a Monday-first week.
  const offset = (weekday + 6) % 7;

  date.setUTCDate(date.getUTCDate() - offset);

  return toDateOnly(date);
}

/** Every week start touched by the range. */
export function eachWeek(from: DateOnly, to: DateOnly): DateOnly[] {
  const weeks: DateOnly[] = [];

  for (let week = startOfWeek(from); week <= to; week = addDays(week, 7)) {
    weeks.push(week);
  }

  return weeks;
}
