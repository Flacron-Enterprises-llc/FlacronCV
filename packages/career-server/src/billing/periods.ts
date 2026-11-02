export interface Period {
  start: Date;
  end: Date;
}

/**
 * Adds calendar months in UTC. The day is clamped to the last day of the
 * target month and counted from the anchor each time, so 31 January gives
 * 28 or 29 February and then 31 March, not 28 March.
 */
export function addMonthsUtc(anchor: Date, months: number): Date {
  const monthIndex = anchor.getUTCMonth() + months;
  const year = anchor.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(anchor.getUTCDate(), lastDay),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

/** The monthly anniversary period `[start, end)` that contains `at`. */
export function periodContaining(anchor: Date, at: Date): Period {
  let n =
    (at.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (at.getUTCMonth() - anchor.getUTCMonth());
  while (addMonthsUtc(anchor, n) > at) n -= 1;
  while (addMonthsUtc(anchor, n + 1) <= at) n += 1;
  return { start: addMonthsUtc(anchor, n), end: addMonthsUtc(anchor, n + 1) };
}
