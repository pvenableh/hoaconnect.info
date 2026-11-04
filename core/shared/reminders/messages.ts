/**
 * What a reminder says (Earnest parity round 3, Phase 5a) — pure. The tick
 * claims a group of reminders (one member's dues on one day; everyone invited
 * to one meeting) and sends it as ONE notification; `composeReminder` gives
 * that notification its subject, bell/push line, email heading and intro, the
 * link, and the vars of its email partial (core/server/emails/reminder-*.mjml).
 *
 * The default copy is plain and specific ("$450.00 is due on Tue, Nov 10").
 * A board's approved copy (`settings.reminders.rules.<rule>.copy`, Phase 5b)
 * replaces the subject and the intro; `{{amount}}`-style tokens are the vars.
 */
import type { NotificationCategory } from "../notifications/preferences";
import type { PushActionInput } from "../notifications/push";
import type { ReminderCopy, ReminderRule, ReminderStage } from "./settings";
import { formatMoney, type Reminder, type ReminderChannel, type ReminderLine, type ReminderTemplate, type ReminderUrgency } from "./rules";

export interface ComposedReminder {
  group: string;
  rule: ReminderRule;
  stage: ReminderStage;
  template: ReminderTemplate;
  category: NotificationCategory;
  essential: boolean;
  urgency: ReminderUrgency;
  channels: ReminderChannel[];
  ttlSeconds?: number;
  /** Unique user ids, in key order. */
  recipients: string[];
  keys: string[];
  /** The entities this notification is about (a dues group can carry several charges). */
  entities: Array<{ collection: string; id: string }>;
  /** Bell + email subject. */
  subject: string;
  /** Bell + push body. */
  message: string;
  /** The email's bold lead line. */
  heading: string;
  /** The email's first sentence. */
  intro: string;
  /** Org-relative path: the push tap, the bell link and the email button. */
  path: string;
  ctaLabel: string;
  vars: Record<string, string>;
  lines?: ReminderLine[];
}

const fill = (template: string, vars: Record<string, string>) =>
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "");

const q = (s: string) => `“${s}”`;

interface Copy {
  subject: string;
  message: string;
  heading: string;
  intro: string;
  path: string;
  ctaLabel: string;
}

function defaultCopy(rule: ReminderRule, stage: ReminderStage, v: Record<string, string>): Copy {
  switch (rule) {
    case "dues": {
      const many = Number(v.count || "1") > 1;
      const what = many ? `${v.count} charges totalling ${v.amount}` : `${v.amount} for ${v.label}`;
      if (stage === "before")
        return {
          subject: `Reminder: ${v.amount} due ${v.due}`,
          message: `${v.amount} is due on ${v.due}.`,
          heading: `Due ${v.due}`,
          intro: `A friendly reminder: ${what} ${many ? "are" : "is"} due on ${v.due}.`,
          path: "/payments",
          ctaLabel: "Pay now",
        };
      if (stage === "due")
        return {
          subject: `Due today: ${v.amount}`,
          message: `${v.amount} is due today.`,
          heading: "Due today",
          intro: `${what[0]!.toUpperCase()}${what.slice(1)} ${many ? "are" : "is"} due today, ${v.due}.`,
          path: "/payments",
          ctaLabel: "Pay now",
        };
      return {
        subject: `Past due: ${v.amount}`,
        message: `${v.amount} was due on ${v.due} and is past due.`,
        heading: "Past due",
        intro: `${what[0]!.toUpperCase()}${what.slice(1)} ${many ? "were" : "was"} due on ${v.due} and ${many ? "are" : "is"} now past due. If you've already paid, thank you — you can ignore this.`,
        path: "/payments",
        ctaLabel: "Pay now",
      };
    }
    case "meeting": {
      if (stage === "hour")
        return {
          subject: `${v.title} starts at ${v.time}`,
          message: v.location ? `In about an hour · ${v.location}` : "In about an hour.",
          heading: `Starts at ${v.time}`,
          intro: `${v.title} starts at ${v.time}.`,
          path: "/meetings",
          ctaLabel: "View meeting",
        };
      const lead = stage === "week" ? `${v.title} is a week away` : `${v.title} is ${v.when}`;
      return {
        subject: stage === "week" ? `Coming up: ${v.title}, ${v.date}` : `Reminder: ${v.title} ${v.when}`,
        message: `${v.title} — ${v.when}${v.location ? ` · ${v.location}` : ""}.`,
        heading: stage === "week" ? `Next week: ${v.date}` : v.when!.replace(/^./, (c) => c.toUpperCase()),
        intro:
          stage === "week"
            ? `${lead}: ${v.when}. The agenda and documents are in the portal.`
            : `A reminder that ${lead}.`,
        path: "/meetings",
        ctaLabel: "View meeting",
      };
    }
    case "violation":
      return stage === "due"
        ? {
            subject: `Today is the correction date: ${v.title}`,
            message: `${q(v.title!)} is due to be corrected today.`,
            heading: "Correction due today",
            intro: `The notice about ${q(v.title!)} asked for it to be corrected by today, ${v.cure_by}. If it's already done, reply to let the board know.`,
            path: `/requests/${v.id}`,
            ctaLabel: "View notice",
          }
        : {
            subject: `Reminder: please correct by ${v.cure_by}`,
            message: `${q(v.title!)} is due to be corrected by ${v.cure_by}.`,
            heading: `Correct by ${v.cure_by}`,
            intro: `A reminder about the notice for ${q(v.title!)}: the correction date is ${v.cure_by}, ${v.days_left} day${v.days_left === "1" ? "" : "s"} from now.`,
            path: `/requests/${v.id}`,
            ctaLabel: "View notice",
          };
    case "poll":
      if (stage === "closed")
        return {
          subject: `Results: ${v.question}`,
          message: v.result ? `Voting closed. ${v.result}.` : "Voting closed.",
          heading: "Voting has closed",
          intro: `Voting on ${q(v.question!)} has closed.${v.result ? ` ${v.result}.` : ""}`,
          path: "/polls",
          ctaLabel: "See the results",
        };
      if (stage === "closing")
        return {
          subject: `Closing soon: ${v.question}`,
          message: `Voting closes ${v.closes}. You haven't voted yet.`,
          heading: `Closes ${v.closes}`,
          intro: `Voting on ${q(v.question!)} closes ${v.closes}, and you haven't voted yet.`,
          path: "/polls",
          ctaLabel: "Vote now",
        };
      return {
        subject: `New poll: ${v.question}`,
        message: v.closes ? `Voting is open until ${v.closes}.` : "Voting is open.",
        heading: "A new poll is open",
        intro: `The board would like your vote on ${q(v.question!)}.${v.closes ? ` Voting closes ${v.closes}.` : ""}`,
        path: "/polls",
        ctaLabel: "Vote",
      };
    case "request":
      return stage === "status"
        ? {
            subject: `Your request is now ${v.status!.toLowerCase()}`,
            message: `${q(v.title!)} is now ${v.status!.toLowerCase()}.`,
            heading: `Status: ${v.status}`,
            intro: `Your request ${q(v.title!)} is now ${v.status!.toLowerCase()}.`,
            path: v.path || "/requests",
            ctaLabel: "View request",
          }
        : {
            subject: `No activity in ${v.days} days: ${v.title}`,
            message: `${q(v.title!)} hasn't been updated since ${v.since}.`,
            heading: `Quiet since ${v.since}`,
            intro: `${q(v.title!)} is assigned to you and hasn't been updated since ${v.since}.`,
            path: v.path || "/requests",
            ctaLabel: "Open request",
          };
    case "coverage":
      return stage === "expired"
        ? {
            subject: `${v.vendor}: coverage on file has ended`,
            message: `The coverage on file for ${v.vendor} ended on ${v.ends}. Ask for a renewed certificate.`,
            heading: "Coverage ended",
            intro: `The coverage on file for ${v.vendor} ended on ${v.ends}.`,
            path: "/admin/vendors",
            ctaLabel: "Open vendors",
          }
        : {
            subject: `${v.vendor}: coverage ends ${v.ends}`,
            message: `The coverage on file for ${v.vendor} ends on ${v.ends}. Ask for a renewed certificate.`,
            heading: `Coverage ends ${v.ends}`,
            intro: `The coverage on file for ${v.vendor} ends on ${v.ends}, in ${v.days_left} days.`,
            path: "/admin/vendors",
            ctaLabel: "Open vendors",
          };
  }
}

/**
 * One notification for a group of claimed reminders. A dues group's charges
 * become its lines and its total; every other group shares one set of vars.
 */
export function composeReminder(group: Reminder[], copy?: ReminderCopy | null): ComposedReminder {
  if (!group.length) throw new Error("composeReminder: empty group");
  const first = group[0]!;
  const recipients = [...new Set(group.map((r) => r.member))];
  const entities = [...new Map(group.map((r) => [`${r.entity.collection}:${r.entity.id}`, r.entity])).values()];

  let vars: Record<string, string> = { ...first.vars, id: first.entity.id };
  let lines: ReminderLine[] | undefined;
  if (first.rule === "dues") {
    // One line per charge (a group is one member's charges at one stage).
    const byCharge = new Map<string, Reminder>();
    for (const r of group) if (!byCharge.has(r.entity.id)) byCharge.set(r.entity.id, r);
    const charges = [...byCharge.values()].sort((a, b) => (a.vars.due_iso ?? "").localeCompare(b.vars.due_iso ?? ""));
    lines = charges.flatMap((r) => r.lines ?? []);
    const total = charges.reduce((sum, r) => sum + (Number(r.vars.amount_value) || 0), 0);
    vars = {
      ...vars,
      amount: formatMoney(total),
      count: String(charges.length),
      // The earliest due date leads: that is the one the member acts on first.
      due: lines[0]?.due ?? vars.due ?? "",
    };
  }

  const c = defaultCopy(first.rule, first.stage, vars);
  const subject = copy?.subject ? fill(copy.subject, vars) : c.subject;
  const intro = copy?.intro ? fill(copy.intro, vars) : c.intro;

  return {
    group: first.group,
    rule: first.rule,
    stage: first.stage,
    template: first.template,
    category: first.category,
    essential: first.essential,
    urgency: first.urgency,
    channels: first.channels,
    ...(first.ttlSeconds ? { ttlSeconds: first.ttlSeconds } : {}),
    recipients,
    keys: group.map((r) => r.key),
    entities,
    subject,
    message: c.message,
    heading: c.heading,
    intro,
    path: c.path,
    ctaLabel: c.ctaLabel,
    vars,
    ...(lines ? { lines } : {}),
  };
}

/** Where "Add to calendar" lands: the meeting's .ics file (a server route, not under `/{slug}`). */
export const meetingCalendarPath = (meetingId: string) => `/api/meetings/${encodeURIComponent(meetingId)}/calendar`;

/**
 * The buttons on a reminder's push (Phase 6): dues → Pay, meeting → Add to
 * calendar, request → Open. Other rules get none — a violation notice or a
 * poll reads fine as a plain tap. The notification's own tap still goes to
 * `c.path`; a button is a shortcut, not the only way in.
 */
export function reminderPushActions(c: Pick<ComposedReminder, "rule" | "path" | "entities">): PushActionInput[] {
  switch (c.rule) {
    case "dues":
      return [{ action: "pay", title: "Pay", path: "/payments" }];
    case "meeting": {
      const id = c.entities.find((e) => e.collection === "hoa_meetings")?.id;
      return id ? [{ action: "calendar", title: "Add to calendar", path: meetingCalendarPath(id), root: true }] : [];
    }
    case "request":
      return [{ action: "open", title: "Open", path: c.path }];
    default:
      return [];
  }
}
