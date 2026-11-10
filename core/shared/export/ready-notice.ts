/**
 * The "your export is ready" notice: the bell row's text and the email's body.
 *
 * Two writers share it. The data-export worker (a tsx script, not Nitro) writes
 * the bell row itself, then asks the app to send the email
 * (`POST /api/org/export/:id/ready-email`), because the email templates only
 * load inside Nuxt. The email used to come only from Directus, which emailed
 * every bell row; Session H turned that off app-wide. Pure, so both sides and
 * the tests say the same thing.
 */
import type { ExportTier } from "./collections";

export interface ExportReadyInput {
  /** `org.name || org.slug`. */
  orgName: string;
  slug: string | null;
  tier: ExportTier;
  /** How long the archive stays downloadable. */
  days: number;
  /** ISO timestamp; only the date is shown. */
  expiresAt: string;
  /** Absolute origin for the bell's link, or "" (no link then). */
  appUrl: string;
}

export interface ExportReadyNotice {
  subject: string;
  /** The bell row's message (plain text). */
  message: string;
  /** The email's body paragraphs; the heading and button come from the template. */
  bodyHtml: string;
}

/** The email's button, org-relative (the transactional sender absolutises it). */
export const EXPORT_READY_CTA = { label: "Download your export", path: "/admin/settings/data" } as const;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function exportReadyNotice(i: ExportReadyInput): ExportReadyNotice {
  const kind = i.tier === "full" ? "full" : "shareable";
  const url = i.appUrl && i.slug ? `${i.appUrl}/${i.slug}${EXPORT_READY_CTA.path}` : null;
  const until = i.expiresAt.slice(0, 10);
  return {
    subject: `Your ${i.orgName} data export is ready`,
    message: [
      `The ${kind} export you requested has finished.`,
      `Download it from Settings → Your data${url ? ` (${url})` : ""}.`,
      `It stays available for ${i.days} days, until ${until}.`,
    ].join(" "),
    bodyHtml:
      `<p>The ${kind} export you requested has finished. Download it from Settings → Your data.</p>` +
      `<p>It stays available for ${i.days} days, until ${esc(until)}.</p>`,
  };
}
