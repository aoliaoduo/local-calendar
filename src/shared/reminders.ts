import { DateTime } from 'luxon'

/** Returns true only while a reminder is within its one-minute delivery window. */
export function isReminderDue(now: DateTime, fireAt: DateTime, windowSeconds = 60): boolean {
  const elapsed = now.diff(fireAt, 'seconds').seconds
  return elapsed >= 0 && elapsed < windowSeconds
}
