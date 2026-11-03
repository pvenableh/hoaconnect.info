/**
 * Standalone notification-digest WORKER — runs ON the DigitalOcean droplet
 * (alongside Directus), NOT in the Vercel app. Talks directly to Directus (admin
 * token) and SendGrid (REST), and reuses the app's pure preference logic + the
 * exact same branded email render (buildEmailHtml / resolveEmailBranding), so
 * digests look identical to every other HOA Connect email.
 *
 * Trigger it hourly from the droplet's crontab (see docs/notification-digest-cron.md):
 *   0 * * * * cd /path/to/hoaconnect && pnpm run digest:worker >> /var/log/hoa-digest.log 2>&1
 *
 * Idempotent-by-hour: each run emails only members whose cadence + local
 * send-hour match the current hour, so a member gets at most one digest per day
 * even though the cron fires 24×/day. The hour is the COMMUNITY's
 * (`hoa_organizations.timezone`, Phase 5a): a member of a Los Angeles HOA gets
 * its digest at 8 am Pacific. DIGEST_TZ is only the fallback for an org with no
 * zone, or before `pnpm create:reminder-log` adds the field.
 *
 *   pnpm run digest:worker              # send
 *   pnpm run digest:worker -- --dry-run # report who WOULD receive, send nothing
 *
 * Env: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN, SENDGRID_API_KEY, FROM_EMAIL, APP_URL,
 *      DIGEST_TZ (fallback zone, default America/New_York), optional FROM_NAME,
 *      DEMO_ALLOW_EMAIL.
 */

import { randomBytes } from "node:crypto";
import {
  createDirectus,
  rest,
  staticToken,
  readUsers,
  readItems,
  readItem,
  updateItem,
} from "@directus/sdk";
// Reused app modules — imported by RELATIVE path (the `#core` alias is Nuxt-only).
// Their only `#core` imports are `import type`, which tsx/esbuild erases, and the
// only runtime dep they pull in is `mjml` (resolved from the core package).
import {
  shouldSendDigest,
  digestCadence,
  digestSections,
  type DigestSection,
} from "../core/shared/notifications/preferences";
import { resolveEmailBranding } from "../core/server/utils/email-branding";
import { buildEmailHtml, buildEmailText } from "../core/server/utils/email-templates-mjml";
import { suppressionReason } from "../core/shared/email/email-class";
import { validTimeZone } from "../core/shared/email/recurrence";
import { localHourAndWeekday } from "../core/shared/org-timezone";
import { checkSendCompliance, isUnsubscribeToken, recipientCompliance } from "../core/shared/email/unsubscribe";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@hoaconnect.info";
const FROM_NAME = process.env.FROM_NAME || "HOA Connect";
const APP_URL = process.env.APP_URL || "";
const DEFAULT_TZ = process.env.DIGEST_TZ || "America/New_York";
const DEMO_ALLOW_EMAIL = ["1", "true", "yes"].includes((process.env.DEMO_ALLOW_EMAIL || "").toLowerCase());
const DRY_RUN = process.argv.includes("--dry-run");

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}
if (!DRY_RUN && !SENDGRID_API_KEY) {
  console.error("❌ Missing SENDGRID_API_KEY (required unless --dry-run)");
  process.exit(1);
}

const directus = createDirectus(DIRECTUS_URL).with(staticToken(DIRECTUS_STATIC_TOKEN)).with(rest());

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function sinceForCadence(cadence: string, now: Date): string {
  const hours = cadence === "weekly" ? 8 * 24 : 25;
  return new Date(now.getTime() - hours * 3600 * 1000).toISOString();
}

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

const items = (collection: string, query: Record<string, any>): Promise<any[]> =>
  directus.request(readItems(collection as any, query as any)) as Promise<any[]>;

interface DigestSectionOut {
  title: string;
  items: { label: string; sub?: string }[];
}

/** Cross-category roll-up for one member in one org (mirrors the app's buildDigest). */
async function buildDigest(
  orgId: string,
  memberIds: string[],
  sections: DigestSection[],
  sinceIso: string
): Promise<DigestSectionOut[]> {
  const out: DigestSectionOut[] = [];
  const nowIso = new Date().toISOString();
  const has = (s: DigestSection) => sections.includes(s);

  if (has("announcements")) {
    const rows = await safe(() =>
      items("hoa_announcements", {
        filter: { organization: { _eq: orgId }, status: { _eq: "published" }, date_created: { _gte: sinceIso } },
        fields: ["id", "title"],
        sort: ["-date_created"],
        limit: 8,
      })
    );
    const its = rows?.filter(Boolean).map((r) => ({ label: r.title || "Announcement" }));
    if (its?.length) out.push({ title: "New announcements", items: its });
  }

  if (has("meetings")) {
    const rows = await safe(() =>
      items("hoa_meetings", {
        filter: { organization: { _eq: orgId }, is_published: { _eq: true }, meeting_date: { _gte: nowIso } },
        fields: ["id", "title", "meeting_date"],
        sort: ["meeting_date"],
        limit: 5,
      })
    );
    const its = rows?.filter(Boolean).map((r) => ({ label: r.title || "Meeting", sub: fmtDate(r.meeting_date) }));
    if (its?.length) out.push({ title: "Upcoming meetings", items: its });
  }

  if (has("payments") && memberIds.length) {
    const rows = await safe(() =>
      items("payment_requests", {
        filter: { member: { _in: memberIds }, status: { _in: ["active", "partially_paid", "overdue"] } },
        fields: ["id", "title", "amount_remaining", "due_date"],
        sort: ["due_date"],
        limit: 6,
      })
    );
    const its = rows?.filter(Boolean).map((r) => ({
      label: r.title || "Payment due",
      sub: [
        r.amount_remaining != null ? `$${Number(r.amount_remaining).toFixed(2)}` : null,
        r.due_date ? `due ${fmtDate(r.due_date)}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    }));
    if (its?.length) out.push({ title: "Dues & payments due", items: its });
  }

  if (has("documents")) {
    const rows = await safe(() =>
      items("hoa_documents", {
        filter: { organization: { _eq: orgId }, date_created: { _gte: sinceIso } },
        fields: ["id", "title"],
        sort: ["-date_created"],
        limit: 8,
      })
    );
    const its = rows?.filter(Boolean).map((r) => ({ label: r.title || "Document" }));
    if (its?.length) out.push({ title: "New documents", items: its });
  }

  if (has("requests")) {
    const rows = await safe(() =>
      items("hoa_requests", {
        filter: { organization: { _eq: orgId }, status: { _in: ["open", "in_progress", "waiting"] } },
        fields: ["id", "title"],
        sort: ["-date_created"],
        limit: 6,
      })
    );
    const its = rows?.filter(Boolean).map((r) => ({ label: r.title || "Request" }));
    if (its?.length) out.push({ title: "Open requests", items: its });
  }

  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function renderDigestHtml(sections: DigestSectionOut[]): string {
  return sections
    .map((sec) => {
      const rows = sec.items
        .map(
          (it) =>
            `<tr><td style="padding:6px 0;font-size:15px;color:#111827">${esc(it.label)}${
              it.sub ? `<span style="color:#6b7280"> — ${esc(it.sub)}</span>` : ""
            }</td></tr>`
        )
        .join("");
      return `<div style="margin:20px 0 8px"><p style="text-transform:uppercase;letter-spacing:.08em;font-size:12px;font-weight:600;color:#6b7280;margin:0 0 6px">${esc(
        sec.title
      )}</p><table style="width:100%;border-collapse:collapse">${rows}</table></div>`;
    })
    .join("");
}

/** Per-org sender: white-label from_email when the domain is verified, else platform. */
function resolveFrom(settings: any): { email: string; name: string } {
  const verified = settings?.email_domain_verified === true;
  const email = verified && settings?.from_email ? settings.from_email : FROM_EMAIL;
  const name = settings?.from_name || FROM_NAME;
  return { email, name };
}

async function sendViaSendgrid(msg: {
  to: string;
  toName?: string;
  from: { email: string; name: string };
  replyTo?: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  categories: string[];
  customArgs?: Record<string, string>;
  headers?: Record<string, string>;
}): Promise<void> {
  const body: Record<string, any> = {
    personalizations: [{ to: [{ email: msg.to, ...(msg.toName ? { name: msg.toName } : {}) }] }],
    from: msg.from,
    subject: msg.subject,
    content: [
      { type: "text/plain", value: msg.text },
      { type: "text/html", value: msg.html },
    ],
    categories: msg.categories,
    ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
    ...(msg.customArgs ? { custom_args: msg.customArgs } : {}),
    ...(msg.headers && Object.keys(msg.headers).length ? { headers: msg.headers } : {}),
  };
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
}

/** Each community's zone; DIGEST_TZ for one without (or before the field exists — that read 403s). */
async function loadOrgZones(): Promise<Map<string, string>> {
  const zones = new Map<string, string>();
  const rows =
    (await safe(() => items("hoa_organizations", { fields: ["id", "timezone"], limit: -1 }))) ??
    (await safe(() => items("hoa_organizations", { fields: ["id"], limit: -1 }))) ??
    [];
  for (const o of rows) if (o?.id) zones.set(String(o.id), validTimeZone(o.timezone) ?? DEFAULT_TZ);
  return zones;
}

async function main() {
  const now = new Date();
  const zones = await loadOrgZones();
  const zoneOf = (orgId: string) => zones.get(orgId) ?? DEFAULT_TZ;
  // Every zone in use and its hour now: a member is a candidate when their
  // digest hour is the hour in at least one of them (checked per org below).
  const hours = [...new Set([DEFAULT_TZ, ...zones.values()])].map((tz) => ({ tz, ...localHourAndWeekday(tz, now) }));
  console.log(
    `🔔 Digest worker — ${DRY_RUN ? "DRY RUN" : "send"} · ${hours
      .map((h) => `${h.tz} ${String(h.hour).padStart(2, "0")}:00 (${WEEKDAYS[h.dow]})`)
      .join(" · ")}`
  );

  // Candidate members: anyone with notification preferences set.
  const candidates = (await safe(() =>
    directus.request(
      readUsers({
        filter: { notification_preferences: { _nnull: true } } as any,
        fields: ["id", "email", "first_name", "email_notifications", "notification_preferences"] as any,
        limit: -1,
      })
    )
  )) as Array<any> | null;
  if (!candidates) {
    console.error("❌ Failed to load candidates");
    process.exit(1);
  }

  const eligible = candidates.filter(
    (u) =>
      u.email &&
      u.email_notifications !== false &&
      hours.some((h) => shouldSendDigest(u.notification_preferences, h.hour, h.dow))
  );
  console.log(`   candidates=${candidates.length} eligible=${eligible.length}`);

  if (DRY_RUN) {
    // Per member, not per community: the zone check per org happens in the send loop.
    for (const u of eligible) console.log(`   would send (in at least one community's hour) → ${u.email}`);
    console.log(`\nℹ️  Dry run — nothing sent.`);
    return;
  }

  let sent = 0;
  let emptyOrDemo = 0;

  for (const u of eligible) {
    const prefs = u.notification_preferences || {};
    const cadence = digestCadence(prefs);
    const sinceIso = sinceForCadence(cadence, now);
    const sections = digestSections(prefs);
    const cadenceLabel = cadence === "weekly" ? "weekly" : "daily";

    // With the Phase 3a fields when they exist (bounced / opted out / token);
    // before `pnpm add:email-compliance` runs, without them, as it always was.
    const memberQuery = (extra: string[]) => ({
      filter: { user: { _eq: u.id }, status: { _in: ["active"] } },
      fields: ["id", "organization", ...extra],
      limit: -1,
    });
    let suppressionReady = true;
    let members = await safe(() =>
      items("hoa_members", memberQuery(["email_community_opt_out", "email_bounced", "unsubscribe_token"]))
    );
    if (!members) {
      suppressionReady = false;
      members = (await safe(() => items("hoa_members", memberQuery([])))) || [];
    }

    const byOrg = new Map<string, any[]>();
    for (const m of members) {
      const orgId = m.organization == null ? null : typeof m.organization === "string" ? m.organization : m.organization.id;
      if (orgId) byOrg.set(orgId, [...(byOrg.get(orgId) || []), m]);
    }

    for (const [orgId, orgMembers] of byOrg) {
      // This community's hour, not the global one.
      const lp = localHourAndWeekday(zoneOf(orgId), now);
      if (!shouldSendDigest(prefs, lp.hour, lp.dow)) continue;
      const memberIds = orgMembers.map((m) => m.id as string);
      // The digest is community mail: a bounced address or an opt-out from this
      // org's community mail drops it, whatever the digest preference says.
      const mailable = orgMembers.find((m) => !suppressionReason(m, "community"));
      if (!mailable) {
        console.log(`   suppressed digest → ${u.email} (org ${orgId}: bounced or opted out)`);
        emptyOrDemo++;
        continue;
      }
      const org = await safe(() =>
        directus.request(
          readItem("hoa_organizations" as any, orgId, {
            fields: [
              "id",
              "name",
              "legal_name",
              "slug",
              "external_url",
              "is_demo",
              "email_reply_to",
              "street_address",
              "city",
              "state",
              "zip",
              { settings: ["*"] },
            ] as any,
          })
        )
      );
      if (!org) continue;

      const rollup = await buildDigest(orgId, memberIds, sections, sinceIso);
      if (!rollup.length) {
        emptyOrDemo++;
        continue;
      }

      if ((org as any).is_demo && !DEMO_ALLOW_EMAIL) {
        console.log(`   [demo] suppressed digest → ${u.email} (${(org as any).slug})`);
        emptyOrDemo++;
        continue;
      }

      // Community mail must carry the org's postal address (CAN-SPAM); an org
      // without one gets no digest until it adds one.
      const compliance = checkSendCompliance({ emailType: "notice", requestedClass: "community", org: org as any });
      if (!compliance.ok) {
        console.warn(`   skipped digest → ${u.email} (${(org as any).slug}): ${compliance.message}`);
        emptyOrDemo++;
        continue;
      }
      let token: string | null = isUnsubscribeToken(mailable.unsubscribe_token) ? mailable.unsubscribe_token : null;
      if (!token && suppressionReady) {
        // Minted lazily, as the app's send path does (server/utils/email-compliance.ts).
        const minted = randomBytes(24).toString("base64url");
        const ok = await safe(async () => {
          await directus.request(updateItem("hoa_members" as any, mailable.id, { unsubscribe_token: minted } as any));
          return true;
        });
        if (ok) token = minted;
      }
      const rc = recipientCompliance({
        emailClass: "community",
        org: org as any,
        mailingAddress: compliance.mailingAddress,
        appUrl: APP_URL,
        token,
      });

      const settings = (org as any).settings && typeof (org as any).settings === "object" ? (org as any).settings : null;
      const orgForEmail = { ...(org as any), settings };
      const branding = resolveEmailBranding(orgForEmail as any, null, { appUrl: APP_URL });
      const content = `<p style="font-weight:600;font-size:17px;margin:0 0 12px">Here's what's new in your community</p>${renderDigestHtml(
        rollup
      )}${
        APP_URL && (org as any).slug
          ? `<p style="margin:24px 0 4px"><a href="${esc(`${APP_URL}/${(org as any).slug}`)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 24px;border-radius:9999px;font-weight:600;font-size:15px">Open your dashboard</a></p>`
          : ""
      }`;
      const subject = `Your ${cadenceLabel} community digest`;

      const html = buildEmailHtml({
        organization: orgForEmail as any,
        subject,
        content,
        emailType: "notice",
        recipientFirstName: u.first_name || undefined,
        directusUrl: DIRECTUS_URL,
        appUrl: APP_URL,
        headerText: branding.headerText,
        footerImage: branding.footerImage,
        homepageUrl: branding.homepageUrl,
        complianceFooter: rc.footer,
      } as any);
      const text = buildEmailText({
        organization: orgForEmail as any,
        subject,
        content,
        emailType: "notice",
        recipientFirstName: u.first_name || undefined,
        directusUrl: DIRECTUS_URL,
        complianceFooter: rc.footer,
      } as any);

      const from = resolveFrom(settings);
      const replyTo = (org as any).email_reply_to ? { email: (org as any).email_reply_to } : undefined;
      try {
        await sendViaSendgrid({
          to: u.email,
          toName: u.first_name || undefined,
          from,
          replyTo,
          subject,
          html,
          text,
          categories: ["HOA Connect", "digest", `org:${orgId}`],
          customArgs: { org_id: String(orgId), organization_id: String(orgId) },
          headers: rc.headers,
        });
        sent++;
        console.log(`   sent → ${u.email} (${(org as any).slug})`);
      } catch (e) {
        console.warn(`   send FAILED → ${u.email} (${(org as any).slug}): ${(e as Error).message}`);
      }
    }
  }

  console.log(`\n✅ Done. sent=${sent} skipped(empty/demo)=${emptyOrDemo}`);
}

main().catch((err) => {
  console.error("\n❌ Worker failed:", err);
  process.exit(1);
});
