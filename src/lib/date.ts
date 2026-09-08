/** Calendar dates are addressed by a local-time `YYYY-MM-DD` key, never by UTC. */
export type DateKey = string;

/** 0 = Sunday, 1 = Monday. */
const WEEK_START = 1;

export const WEEKDAYS = [
  { short: 'MON', full: 'Monday' },
  { short: 'TUE', full: 'Tuesday' },
  { short: 'WED', full: 'Wednesday' },
  { short: 'THU', full: 'Thursday' },
  { short: 'FRI', full: 'Friday' },
  { short: 'SAT', full: 'Saturday' },
  { short: 'SUN', full: 'Sunday' },
];

/** Monday-first index for a date, matching WEEKDAYS. */
export function weekdayIndex(key: DateKey): number {
  return (fromKey(key).getDay() + 6) % 7;
}

export function toKey(date: Date): DateKey {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function fromKey(key: DateKey): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Whether a string really is one of these keys.
 *
 * Everything else here is handed keys this app wrote. A restored backup is the
 * one place a key arrives from outside — a file edited by hand, truncated by a
 * failed copy, or simply not this app's — so the shape is checked and then the
 * date is round-tripped, which is what separates a real day from `2026-02-31`.
 */
export function isDateKey(value: string): value is DateKey {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = fromKey(value);
  return !Number.isNaN(date.getTime()) && toKey(date) === value;
}

export function todayKey(): DateKey {
  return toKey(new Date());
}

/**
 * Every cell of the month grid, with leading nulls for the days that belong to
 * the previous month, so the first of the month lands under its weekday. Padded
 * to a fixed number of rows so every month keeps identical grid geometry: a
 * month that needs five rows must not make its cells taller than one needing six.
 */
export function monthGrid(year: number, month: number, rows = 6): (DateKey | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() - WEEK_START + 7) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (DateKey | null)[] = Array(lead).fill(null);
  for (let day = 1; day <= days; day++) cells.push(toKey(new Date(year, month, day)));
  while (cells.length < rows * 7) cells.push(null);
  return cells;
}

export function dayNumber(key: DateKey): number {
  return Number(key.slice(8, 10));
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** `-1` if the day is before today, `0` for today, `1` if it is still ahead. */
export function compareToToday(key: DateKey): number {
  const today = todayKey();
  return key < today ? -1 : key > today ? 1 : 0;
}
