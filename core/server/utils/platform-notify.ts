// Tell HOA Connect's staff that something happened: a community subscribed, a
// platform support request arrived (launch-followups Session 2; operator
// console Phase 3).
//
// One channel: an email through SendGrid to `BILLING_NOTIFY_EMAIL`, or
// support@hoaconnect.info when it's unset (Peter's call, 2026-11-10). It honours
// `OUTBOUND_EMAIL_ONLY_TO` like every other send, so a dev or test-mode run
// can't mail the real inbox by accident.
//
// Never throws. The callers are a Stripe webhook (a throw makes Stripe retry
// the whole event) and a support request (which mustn't fail because the
// email did); each gets `false` back and the reason is in the log.
import { isOutboundAllowed, outboundAllowList, sendEmail } from "./sendgrid";

export const DEFAULT_PLATFORM_NOTIFY_EMAIL = "support@hoaconnect.info";

export function platformNotifyAddress(raw: string | undefined = process.env.BILLING_NOTIFY_EMAIL): string {
  return (raw ?? "").trim() || DEFAULT_PLATFORM_NOTIFY_EMAIL;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface PlatformNotice {
  subject: string;
  /** Label and value rows; empty values are left out. */
  rows: Array<[string, string | number | null | undefined]>;
  /** Free text under the rows, e.g. a support request's message. */
  body?: string | null;
  link?: { label: string; url: string } | null;
}

/** The email's text and HTML. Pure, for tests. */
export function renderPlatformNotice(n: PlatformNotice): { text: string; html: string } {
  const rows = n.rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  const text = [
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(n.body ? ["", n.body] : []),
    ...(n.link ? ["", `${n.link.label}: ${n.link.url}`] : []),
  ].join("\n");
  const html = [
    `<table cellpadding="4" style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px">`,
    ...rows.map(([k, v]) => `<tr><td style="color:#6b7280">${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`),
    `</table>`,
    ...(n.body ? [`<p style="font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;white-space:pre-wrap">${escapeHtml(n.body)}</p>`] : []),
    ...(n.link ? [`<p><a href="${escapeHtml(n.link.url)}">${escapeHtml(n.link.label)}</a></p>`] : []),
  ].join("\n");
  return { text, html };
}

export async function notifyPlatform(n: PlatformNotice): Promise<boolean> {
  const to = platformNotifyAddress();
  if (!isOutboundAllowed(to, outboundAllowList())) {
    console.log(`[OUTBOUND_EMAIL_ONLY_TO] platform notice not sent → ${to} — "${n.subject}"`);
    return false;
  }
  try {
    await sendEmail({ to, subject: n.subject, ...renderPlatformNotice(n) });
    return true;
  } catch (e: any) {
    console.error(`[platform-notify] "${n.subject}" not sent:`, e?.message ?? e);
    return false;
  }
}

const INTERVAL_LABEL: Record<string, string> = { month: "Monthly", year: "Yearly" };
const STATUS_LABEL: Record<string, string> = {
  trial: "trial",
  past_due: "past due",
  canceled: "canceled",
  expired: "expired",
};

/**
 * A community's own subscription became active (not an agency account's).
 * The first payment, or a payment that brought a lapsed one back: "Was" says
 * which.
 */
export async function notifySubscriptionActivated(input: {
  orgId: string;
  orgName: string;
  previousStatus: string | null | undefined;
  band?: string | null;
  units?: string | number | null;
  interval?: string | null;
}): Promise<boolean> {
  const appUrl = String(useRuntimeConfig().public.appUrl || "").replace(/\/$/, "");
  const back = input.previousStatus && input.previousStatus !== "trial";
  return notifyPlatform({
    subject: back ? `Subscription active again: ${input.orgName}` : `New subscriber: ${input.orgName}`,
    rows: [
      ["Community", input.orgName],
      ["Band", input.band],
      ["Units", input.units],
      ["Billed", input.interval ? INTERVAL_LABEL[input.interval] ?? input.interval : null],
      ["Was", input.previousStatus ? STATUS_LABEL[input.previousStatus] ?? input.previousStatus : "new"],
    ],
    link: { label: "Open in the operator console", url: `${appUrl}/ops/communities/${input.orgId}` },
  });
}
