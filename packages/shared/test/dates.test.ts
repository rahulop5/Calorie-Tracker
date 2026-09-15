import { describe, expect, it } from 'vitest';
import {
  addDays,
  countDays,
  eachDay,
  eachWeek,
  startOfWeek,
  toDateOnly,
  toDbDate,
} from '../src/domain/dates';

describe('date conversion', () => {
  it('maps a date string to UTC midnight', () => {
    expect(toDbDate('2026-09-13').toISOString()).toBe('2026-09-13T00:00:00.000Z');
  });

  it('survives a round trip across month and year boundaries', () => {
    for (const day of ['2026-01-01', '2026-02-28', '2026-03-01', '2026-12-31', '2028-02-29']) {
      expect(toDateOnly(toDbDate(day))).toBe(day);
    }
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('goes backwards', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles a leap year', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('countDays', () => {
  it('counts a single day as one', () => {
    expect(countDays('2026-09-13', '2026-09-13')).toBe(1);
  });

  it('counts a week as seven', () => {
    expect(countDays('2026-09-07', '2026-09-13')).toBe(7);
  });

  it('counts a whole leap year', () => {
    expect(countDays('2028-01-01', '2028-12-31')).toBe(366);
  });
});

describe('eachDay', () => {
  it('includes both ends', () => {
    expect(eachDay('2026-09-11', '2026-09-13')).toEqual([
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
  });

  it('returns one day when the range is a single day', () => {
    expect(eachDay('2026-09-13', '2026-09-13')).toEqual(['2026-09-13']);
  });

  it('returns nothing when the range is backwards', () => {
    expect(eachDay('2026-09-13', '2026-09-11')).toEqual([]);
  });
});

describe('startOfWeek', () => {
  it('returns the Monday of the same week', () => {
    // 2026-09-13 is a Sunday, so its week starts on the 7th.
    expect(startOfWeek('2026-09-13')).toBe('2026-09-07');
  });

  it('leaves a Monday alone', () => {
    expect(startOfWeek('2026-09-07')).toBe('2026-09-07');
  });

  it('treats Sunday as the end of a week, not the start', () => {
    expect(startOfWeek('2026-09-06')).toBe('2026-08-31');
  });
});

describe('eachWeek', () => {
  it('starts from the Monday containing `from`', () => {
    expect(eachWeek('2026-09-09', '2026-09-20')).toEqual([
      '2026-09-07',
      '2026-09-14',
    ]);
  });

  it('returns one bucket for a range inside a single week', () => {
    expect(eachWeek('2026-09-08', '2026-09-10')).toEqual(['2026-09-07']);
  });
});
