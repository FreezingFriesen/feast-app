// Dates are handled as local "YYYY-MM-DD" keys: the user's calendar day, not a UTC instant.
// All math goes through new Date(year, monthIndex, day, 12) and its day fields, never
// millisecond arithmetic, so daylight-saving changes cannot shift a day.
// Functions here expect valid keys; check route params and stored data with dateKeySchema first.

export type DateKey = string;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

// Column headings for a Monday-first week.
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const pad = (value: number) => String(value).padStart(2, "0");

// Noon, so the date is never near a midnight DST jump.
const localDate = (year: number, monthIndex: number, day: number) =>
  new Date(year, monthIndex, day, 12);

export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateKey(key: DateKey): Date {
  const [year, month, day] = key.split("-").map(Number);
  return localDate(year, month - 1, day);
}

export function todayKey(now: () => number = Date.now): DateKey {
  return toDateKey(new Date(now()));
}

export function addDays(key: DateKey, days: number): DateKey {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function daysInMonth(year: number, monthIndex: number): number {
  return localDate(year, monthIndex + 1, 0).getDate();
}

// Keeps the day of the month where it exists: Jan 31 + 1 month -> Feb 28 (or 29).
export function addMonths(key: DateKey, months: number): DateKey {
  const date = fromDateKey(key);
  const target = localDate(date.getFullYear(), date.getMonth() + months, 1);
  target.setDate(Math.min(date.getDate(), daysInMonth(target.getFullYear(), target.getMonth())));
  return toDateKey(target);
}

// Weeks start on Monday.
export function startOfWeek(key: DateKey): DateKey {
  const mondayOffset = (fromDateKey(key).getDay() + 6) % 7;
  return addDays(key, -mondayOffset);
}

export function weekDays(key: DateKey): DateKey[] {
  const start = startOfWeek(key);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function weekBounds(key: DateKey): { start: DateKey; end: DateKey } {
  const start = startOfWeek(key);
  return { start, end: addDays(start, 6) };
}

export function monthBounds(key: DateKey): { start: DateKey; end: DateKey } {
  const date = fromDateKey(key);
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  return {
    start: toDateKey(localDate(year, monthIndex, 1)),
    end: toDateKey(localDate(year, monthIndex, daysInMonth(year, monthIndex))),
  };
}

// Calendar rows for the month containing `key`: 7 cells per row, Monday first,
// with null for the blank cells before the 1st and after the last day.
export function monthGrid(key: DateKey): (DateKey | null)[][] {
  const date = fromDateKey(key);
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  const leadingBlanks = (localDate(year, monthIndex, 1).getDay() + 6) % 7;

  const cells: (DateKey | null)[] = Array.from({ length: leadingBlanks }, () => null);
  for (let day = 1; day <= daysInMonth(year, monthIndex); day += 1) {
    cells.push(toDateKey(localDate(year, monthIndex, day)));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const rows: (DateKey | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    rows.push(cells.slice(index, index + 7));
  }
  return rows;
}

// Labels use fixed English names so output is the same on every device.

export function dayOfMonth(key: DateKey): number {
  return fromDateKey(key).getDate();
}

// "Mon"
export function formatWeekday(key: DateKey): string {
  return DAY_NAMES[fromDateKey(key).getDay()];
}

// "October 2026"
export function formatMonthYear(key: DateKey): string {
  const date = fromDateKey(key);
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

const shortMonth = (date: Date) => MONTH_NAMES[date.getMonth()].slice(0, 3);

// "Mon, Oct 19"
export function formatDay(key: DateKey): string {
  const date = fromDateKey(key);
  return `${DAY_NAMES[date.getDay()]}, ${shortMonth(date)} ${date.getDate()}`;
}

// "Oct 19 – 25", "Sep 28 – Oct 4", "Dec 28, 2026 – Jan 3, 2027"
export function formatWeekRange(key: DateKey): string {
  const { start, end } = weekBounds(key);
  const first = fromDateKey(start);
  const last = fromDateKey(end);
  if (first.getFullYear() !== last.getFullYear()) {
    return `${shortMonth(first)} ${first.getDate()}, ${first.getFullYear()} – ${shortMonth(last)} ${last.getDate()}, ${last.getFullYear()}`;
  }
  if (first.getMonth() !== last.getMonth()) {
    return `${shortMonth(first)} ${first.getDate()} – ${shortMonth(last)} ${last.getDate()}`;
  }
  return `${shortMonth(first)} ${first.getDate()} – ${last.getDate()}`;
}
