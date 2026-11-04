export interface DateWindow {
  start: Date;
  end: Date;
}

export const startOfDay = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

export const endOfDay = (date: Date): Date =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );

export const startOfMonth = (year: number, month: number): Date =>
  new Date(Date.UTC(year, month - 1, 1));

export const endOfMonth = (year: number, month: number): Date =>
  new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

export const startOfYear = (year: number): Date =>
  new Date(Date.UTC(year, 0, 1));

export const endOfYear = (year: number): Date =>
  new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

export const normaliseWindow = (start: Date, end: Date): DateWindow => {
  const normalisedStart = startOfDay(start);
  const normalisedEnd = endOfDay(end);

  if (normalisedStart > normalisedEnd) {
    return { start: normalisedEnd, end: normalisedStart };
  }

  return { start: normalisedStart, end: normalisedEnd };
};

export const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

export const monthKey = (date: Date): string => date.toISOString().slice(0, 7);

export const eachDay = (start: Date, end: Date): Date[] => {
  const days: Date[] = [];
  const cursor = startOfDay(start);
  const last = startOfDay(end);

  while (cursor.getTime() <= last.getTime()) {
    days.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
};

export const eachMonth = (start: Date, end: Date): string[] => {
  const months: string[] = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
  );
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

  while (cursor.getTime() <= last.getTime()) {
    months.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
};
