export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function trailingMonths(now: Date, count: number): Date[] {
  const months: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  return months;
}

// DB date/timestamp columns come back as bare "YYYY-MM-DD" strings. `new Date(str)`
// parses those per ISO 8601 as UTC midnight, while every boundary in this file
// (startOfMonth, endOfMonth, trailingMonths) is built in local time via the
// Date(year, month, day) constructor form. Comparing a UTC-parsed instant against
// a local-time boundary silently misclassifies dates near month edges in any
// timezone west of UTC. Parse as a local calendar date instead so date-string
// fields compare correctly against this file's boundaries.
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}
