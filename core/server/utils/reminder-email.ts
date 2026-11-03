/**
 * A reminder's email (Earnest parity round 3, Phase 5a): which content partial
 * (core/server/emails/reminder-*.mjml) and its vars, escaped here — the partial
 * filler inserts values as they are. The template is composed with the
 * header and footer partials by buildEmailMjml → composeEmail, like every
 * other organization email; the CTA button's href and label are added by
 * sendBrandedTransactionalEmail, which knows the org's slug and the app URL.
 *
 * `notice` reminders (a request's status, the assignee nudge, vendor coverage)
 * have no partial: they are the branded notification email.
 */
import { composeReminder, type ComposedReminder } from "#core/shared/reminders/messages";
import { evaluateReminders, groupReminders, type ReminderTemplate } from "#core/shared/reminders/rules";
import { REMINDER_RULES, resolveReminderSettings } from "#core/shared/reminders/settings";
import type { PartialVars } from "./email-partials";
import duesMjml from "../emails/reminder-dues.mjml";
import meetingMjml from "../emails/reminder-meeting.mjml";
import violationMjml from "../emails/reminder-violation.mjml";
import pollMjml from "../emails/reminder-poll.mjml";

export const REMINDER_PARTIALS: Record<Exclude<ReminderTemplate, "notice">, string> = {
  "reminder-dues": duesMjml,
  "reminder-meeting": meetingMjml,
  "reminder-violation": violationMjml,
  "reminder-poll": pollMjml,
};

export const REMINDER_EMAIL_TEMPLATES = Object.keys(REMINDER_PARTIALS) as Array<keyof typeof REMINDER_PARTIALS>;

const esc = (s: string | null | undefined) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const row = (label: string, value: string, strong = false) =>
  `<tr>
              <td style="padding:6px 0;color:#6b7280;">${esc(label)}</td>
              <td style="padding:6px 0;text-align:right;${strong ? "font-weight:600;" : ""}">${esc(value)}</td>
            </tr>`;

function factRows(c: ComposedReminder): string {
  const v = c.vars;
  switch (c.rule) {
    case "meeting":
      return [row("When", `${v.date} at ${v.time}`, true), v.location ? row("Where", v.location) : ""].filter(Boolean).join("\n            ");
    case "violation":
      return [row("Notice", v.title ?? ""), row("Correct by", v.cure_by ?? "", true)].join("\n            ");
    case "poll":
      if (c.stage === "closed") return v.result ? row("Result", v.result, true) : "";
      return v.closes ? row("Voting closes", v.closes, true) : "";
    default:
      return "";
  }
}

export interface ReminderEmailParts {
  emailType: "reminder" | "notice";
  heading: string;
  /** The plain-text part's and preheader's source (and the whole body of a `notice`). */
  bodyHtml: string;
  cta: { label: string; path: string };
  contentPartial: { name: string; source: string; vars: PartialVars } | null;
}

/** The email twin of one composed reminder. */
export function reminderEmail(c: ComposedReminder): ReminderEmailParts {
  const cta = { label: c.ctaLabel, path: c.path };
  const lines = c.lines ?? [];
  // The text part: the intro, then each fact or charge on its own line.
  const facts =
    c.rule === "dues"
      ? lines.map((l) => `${l.label} — ${l.amount}, due ${l.due}`).concat(lines.length > 1 ? [`Total due: ${c.vars.amount}`] : [])
      : c.rule === "meeting"
        ? [`When: ${c.vars.date} at ${c.vars.time}`, c.vars.location ? `Where: ${c.vars.location}` : ""]
        : c.rule === "violation"
          ? [`Correct by: ${c.vars.cure_by}`]
          : c.rule === "poll"
            ? [c.vars.question ? `“${c.vars.question}”` : "", c.stage === "closed" ? c.vars.result ?? "" : c.vars.closes ? `Voting closes ${c.vars.closes}` : ""]
            : [];
  const bodyHtml = [`<p>${esc(c.intro)}</p>`, ...facts.filter(Boolean).map((f) => `<p>${esc(f)}</p>`)].join("");

  if (c.template === "notice") {
    return { emailType: "notice", heading: c.heading, bodyHtml, cta, contentPartial: null };
  }

  const vars: PartialVars = { heading: esc(c.heading), intro: esc(c.intro) };
  if (c.template === "reminder-dues") {
    vars.lineRows = lines
      .map(
        (l) => `<tr>
              <td style="padding:6px 0;">${esc(l.label)}<br /><span style="color:#6b7280;font-size:13px;">Due ${esc(l.due)}</span></td>
              <td style="padding:6px 0;text-align:right;vertical-align:top;">${esc(l.amount)}</td>
            </tr>`
      )
      .join("\n            ");
    vars.amount = esc(c.vars.amount);
  } else {
    vars.factRows = factRows(c);
    if (c.template === "reminder-poll") vars.question = esc(c.vars.question);
  }
  return {
    emailType: "reminder",
    heading: c.heading,
    bodyHtml,
    cta,
    contentPartial: { name: c.template, source: REMINDER_PARTIALS[c.template], vars },
  };
}

// ── Samples (GET /api/email/preview-mjml?template=reminder-*) ───────────────

/**
 * One believable reminder per template, made by the real rules from a fixed
 * snapshot (Tue, Nov 3 2026, 9:30 am in New York), so the preview is what the
 * engine sends: two charges due in a week, a board meeting a week out, a
 * correction date in three days, a poll closing tomorrow morning.
 */
export function sampleReminders(orgName = "Your community"): Record<keyof typeof REMINDER_PARTIALS, ComposedReminder> {
  const settings = resolveReminderSettings({ rules: Object.fromEntries(REMINDER_RULES.map((r) => [r, { enabled: true }])) });
  const me = "00000000-0000-4000-8000-000000000001";
  const reminders = evaluateReminders(
    {
      org: { id: "sample", slug: "sample", name: orgName, timeZone: "America/New_York", graceDays: 5 },
      settings,
      charges: [
        { id: "c1", label: "November dues", status: "active", amountRemaining: 450, dueDate: "2026-11-10", billedUserId: me, residents: [], sentStages: [] },
        { id: "c2", label: "Pool resurfacing assessment", status: "active", amountRemaining: 75, dueDate: "2026-11-10", billedUserId: me, residents: [], sentStages: [] },
      ],
      meetings: [
        { id: "m1", title: "Monthly board meeting", startsAt: "2026-11-10T23:30:00Z", status: "scheduled", published: true, location: "Clubhouse", audienceUserIds: [me] },
      ],
      requests: [
        { id: "r1", type: "violation", title: "Trash bins visible from the street", status: "waiting", memberUserId: me, cureBy: "2026-11-06" },
      ],
      polls: [
        { id: "p1", question: "Should we repaint the fence green?", status: "open", createdAt: "2026-10-27T14:00:00Z", closesAt: "2026-11-04T13:00:00Z", audienceUserIds: [me], voterUserIds: [] },
      ],
      vendors: [],
      adminUserIds: [],
    },
    new Date("2026-11-03T14:30:00Z")
  );
  const out = {} as Record<keyof typeof REMINDER_PARTIALS, ComposedReminder>;
  for (const g of groupReminders(reminders)) {
    const t = g[0]!.template;
    if (t !== "notice" && !out[t]) out[t] = composeReminder(g);
  }
  return out;
}
