// Pure timing helpers for the monthly plan-allowance reset. A wallet's
// allowance pool is refilled to its plan's `included_credits` at the start of
// each billing period (calendar month, UTC). Framework-free so the reset
// decision and the next-boundary math are unit-testable without a clock.

/**
 * Should the allowance be (re)provisioned now? True when the wallet has never
 * been provisioned (no reset date) or the current period has elapsed.
 */
export function shouldResetAllowance(periodResetsAt: string | null | undefined, now: Date): boolean {
  if (!periodResetsAt) return true;
  const t = new Date(periodResetsAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() >= t;
}

/**
 * The next reset boundary: 00:00 UTC on the first day of next month, as an ISO
 * string. Allowance granted now covers the current month and expires here.
 */
export function nextResetISO(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}
