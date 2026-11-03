/**
 * The send queue's progress, as the UI says it (docs/spec-email-send-queue.md
 * §5.4). Shared by the progress route's tests, the compose page's send dialog,
 * the detail page and the browser check, so the three labels can't drift.
 *
 * "Accepted", never "delivered": `sent` means SendGrid took the message (202).
 * Delivery is the webhook's word and shows per row, from `delivery_status`.
 */

export type SendPhase = "preparing" | "sending" | "done";

export interface SendProgressNumbers {
  phase: SendPhase;
  status: string | null;
  total: number | null;
  sent: number;
  failed: number;
  unknown: number;
  suppressed: number;
  queued: number;
  claimed: number;
  /** Rows written so far — the "Getting ready" count. */
  rows: number;
}

export interface SendProgressView extends SendProgressNumbers {
  stalled: string | null;
  updatedAt: string | null;
  errors: Array<{ address: string; reason: string }>;
}

/** Rows attempted: everything that is no longer queued or claimed, out of `total`. */
export function attemptedOf(p: Pick<SendProgressNumbers, "total" | "queued" | "claimed">): number {
  return Math.max(0, (p.total ?? 0) - p.queued - p.claimed);
}

/** The three labels: Getting ready → Sending → Sent / Not sent. */
export function progressLabel(p: SendProgressNumbers): string {
  if (p.phase === "preparing") return `Getting ready · ${p.rows} ${p.rows === 1 ? "person" : "people"}`;
  if (p.phase === "sending") {
    return `Sending · ${attemptedOf(p)} of ${p.total ?? 0}${p.suppressed > 0 ? ` · ${p.suppressed} held back` : ""}`;
  }
  if (p.status === "failed" || p.sent === 0) return "Not sent · nobody could be reached";
  return `Sent · ${p.sent} accepted${p.failed ? `, ${p.failed} failed` : ""}${p.unknown ? `, ${p.unknown} unknown` : ""}`;
}

/** 0–100 for a progress bar; preparing reads as 0. */
export function progressPercent(p: SendProgressNumbers): number {
  if (p.phase === "done") return 100;
  if (p.phase === "preparing" || !p.total) return 0;
  return Math.min(100, Math.round((attemptedOf(p) / p.total) * 100));
}

/** The chip a recipient row wears on the detail page. */
export function recipientChip(row: {
  status?: string | null;
  suppressed_reason?: string | null;
  delivery_status?: string | null;
}): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (row.delivery_status === "bounced") return { label: "Bounced", tone: "bad" };
  if (row.delivery_status === "delivered") return { label: "Delivered", tone: "ok" };
  switch (row.status) {
    case "sent":
      return { label: "Accepted", tone: "ok" };
    case "delivered":
      return { label: "Delivered", tone: "ok" };
    case "failed":
      return { label: "Failed", tone: "bad" };
    case "bounced":
      return { label: "Bounced", tone: "bad" };
    case "unknown":
      return { label: "Unknown", tone: "warn" };
    case "suppressed": {
      const r = row.suppressed_reason || "";
      const why = r.startsWith("bounced") ? "bounced" : r.startsWith("opted_out") ? "unsubscribed" : "held back";
      return { label: `Held back · ${why}${r.endsWith("_mid_send") ? " during send" : ""}`, tone: "muted" };
    }
    case "queued":
    case "claimed":
    case "pending":
      return { label: "Waiting", tone: "muted" };
    default:
      return { label: row.status || "—", tone: "muted" };
  }
}
