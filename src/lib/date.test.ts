import { describe, expect, it } from 'vitest';
import {
  compareToToday,
  dayNumber,
  formatClock,
  fromKey,
  monthGrid,
  todayKey,
  toKey,
  weekdayIndex,
  WEEKDAYS,
} from './date';

describe('day keys', () => {
  it('names the local day, not the UTC one', () => {
    // The whole reason these are strings built by hand. `toISOString()` on a
    // late-evening date lands on tomorrow east of Greenwich and yesterday west
    // of it, which puts a recording on the wrong square of the calendar.
    const lateEvening = new Date(2026, 8, 8, 23, 45, 0);
    const earlyMorning = new Date(2026, 8, 8, 0, 15, 0);
    expect(toKey(lateEvening)).toBe('2026-09-08');
    expect(toKey(earlyMorning)).toBe('2026-09-08');
  });

  it('pads month and day, so keys sort as dates', () => {
    expect(toKey(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(toKey(new Date(2026, 11, 31))).toBe('2026-12-31');
    const unsorted = ['2026-12-01', '2026-01-02', '2026-01-10', '2026-02-01'];
    expect([...unsorted].sort()).toEqual(['2026-01-02', '2026-01-10', '2026-02-01', '2026-12-01']);
  });

  it('reads a key back as local midnight, so it survives the round trip', () => {
    for (const key of ['2026-01-01', '2026-02-28', '2026-06-15', '2026-12-31', '2024-02-29']) {
      const date = fromKey(key);
      expect(date.getHours()).toBe(0);
      expect(toKey(date)).toBe(key);
    }
  });

  it('gives today a key that is today', () => {
    expect(todayKey()).toBe(toKey(new Date()));
  });

  it('reads the day number off the key without parsing a date', () => {
    expect(dayNumber('2026-09-08')).toBe(8);
    expect(dayNumber('2026-09-30')).toBe(30);
    expect(dayNumber('2026-01-01')).toBe(1);
  });
});

describe('the week', () => {
  it('starts on Monday, matching the printed header', () => {
    expect(WEEKDAYS[0].short).toBe('MON');
    expect(WEEKDAYS[6].short).toBe('SUN');
    expect(WEEKDAYS).toHaveLength(7);
  });

  it('indexes a day against that header', () => {
    // 2026-09-07 is a Monday.
    expect(weekdayIndex('2026-09-07')).toBe(0);
    expect(weekdayIndex('2026-09-12')).toBe(5);
    expect(weekdayIndex('2026-09-13')).toBe(6);
  });
});

describe('the month grid', () => {
  it('is always six rows, so a short month never gets taller cells', () => {
    for (let month = 0; month < 12; month++) {
      expect(monthGrid(2026, month)).toHaveLength(42);
    }
    // February 2026 starts on a Sunday and needs five rows; it is padded anyway.
    expect(monthGrid(2026, 1)).toHaveLength(42);
  });

  it('puts the first of the month under its own weekday', () => {
    const grid = monthGrid(2026, 8); // September 2026 begins on a Tuesday.
    const first = grid.indexOf('2026-09-01');
    expect(first).toBe(1);
    expect(grid.slice(0, first).every(cell => cell === null)).toBe(true);
  });

  it('holds every day of the month exactly once, and nothing else', () => {
    const grid = monthGrid(2024, 1); // A leap February.
    const days = grid.filter(Boolean);
    expect(days).toHaveLength(29);
    expect(days.at(-1)).toBe('2024-02-29');
    expect(new Set(days).size).toBe(29);
  });

  it('lands every day under the weekday column it belongs in', () => {
    const grid = monthGrid(2026, 10);
    grid.forEach((date, position) => {
      if (date) expect(weekdayIndex(date)).toBe(position % 7);
    });
  });
});

describe('past, present and future', () => {
  it('separates them by the local day and not by the hour', () => {
    const today = todayKey();
    const yesterday = toKey(new Date(Date.now() - 86_400_000));
    const tomorrow = toKey(new Date(Date.now() + 86_400_000));
    expect(compareToToday(today)).toBe(0);
    expect(compareToToday(yesterday)).toBe(-1);
    expect(compareToToday(tomorrow)).toBe(1);
  });
});

describe('the clock readout', () => {
  it('is mm:ss, zero-padded on both halves', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(9_000)).toBe('00:09');
    expect(formatClock(65_000)).toBe('01:05');
    expect(formatClock(120_000)).toBe('02:00');
  });

  it('rounds to the nearest second rather than truncating', () => {
    expect(formatClock(1_600)).toBe('00:02');
    expect(formatClock(1_400)).toBe('00:01');
  });

  it('never shows a negative time', () => {
    expect(formatClock(-5_000)).toBe('00:00');
  });

  it('keeps counting past an hour rather than wrapping', () => {
    expect(formatClock(3_600_000)).toBe('60:00');
    expect(formatClock(3_661_000)).toBe('61:01');
  });
});
