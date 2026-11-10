// Display helpers for the operator console pages. Pure, so a page and a test
// read the same labels.

export function money(cents: number | null | undefined, currency: string | null = "usd"): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function relativeDays(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const days = Math.round((new Date(iso).getTime() - now.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days > 0) return days === 1 ? "tomorrow" : `in ${days} days`;
  return days === -1 ? "yesterday" : `${-days} days ago`;
}

export type Tone = "success" | "warning" | "info" | "destructive" | "muted";

/** Community status, Stripe subscription status, and charge status labels. */
export const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  trial: "Trial",
  trialing: "Trialing",
  past_due: "Past due",
  expired: "Expired",
  canceled: "Canceled",
  free: "Free",
  incomplete: "Incomplete",
  incomplete_expired: "Incomplete, expired",
  unpaid: "Unpaid",
  paused: "Paused",
  succeeded: "Paid",
  failed: "Failed",
  pending: "Pending",
  refunded: "Refunded",
  partially_refunded: "Part refunded",
  paid: "Paid",
  open: "Open",
  void: "Void",
  uncollectible: "Uncollectible",
  draft: "Draft",
  // Scheduled jobs (health page)
  ok: "OK",
  error: "Error",
  overdue: "Overdue",
  never: "No run yet",
};

export const STATUS_TONE: Record<string, Tone> = {
  active: "success",
  succeeded: "success",
  paid: "success",
  trial: "info",
  trialing: "info",
  free: "info",
  pending: "info",
  open: "info",
  past_due: "warning",
  partially_refunded: "warning",
  refunded: "warning",
  incomplete: "warning",
  failed: "destructive",
  unpaid: "destructive",
  expired: "destructive",
  uncollectible: "destructive",
  canceled: "muted",
  incomplete_expired: "muted",
  void: "muted",
  draft: "muted",
  ok: "success",
  error: "destructive",
  overdue: "warning",
  never: "muted",
};

/** Bytes as a person reads them: "0 B", "512 KB", "1.4 GB". */
export function bytes(n: number | null | undefined): string {
  if (n == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = Math.max(0, n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${i === 0 ? v : v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export const BOARD_TITLE: Record<string, string> = {
  president: "President",
  vice_president: "Vice president",
  secretary: "Secretary",
  treasurer: "Treasurer",
  director: "Director",
};

export const BILLING_ROLE: Record<string, string> = {
  owner: "Billing account owner",
  billing_admin: "Billing admin",
  viewer: "Viewer",
};
