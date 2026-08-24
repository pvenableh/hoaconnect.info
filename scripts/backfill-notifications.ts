/**
 * backfill-notifications — give the new bell a past.
 *
 * The Phase 2c cutover moves the notification centre from a client-side scan of
 * ten collections to the `directus_notifications` rows the server writes. Those
 * rows only start existing when something happens, so on the morning of the
 * switch every member's bell would be empty — which reads as "the notifications
 * are gone", not "the notifications are new". This walks the same sources the
 * aggregator scanned and writes the last 30 days as real rows.
 *
 * **Everything is written ARCHIVED, and that is the whole design.**
 *
 * The aggregator kept read state in localStorage, per device, keyed per org. It
 * is unmergeable with a row status by construction: there is no server-side
 * record of what anyone had read, and the same person had different answers on
 * their laptop and their phone. So the only two options are "everyone's last 30
 * days arrive unread" — a wall of red on a Monday, and a badge nobody can
 * meaningfully clear — or "history is visible, nothing is unread". The second is
 * obviously right: the bell's job is to tell you what needs attention, and
 * nothing that happened three weeks ago does.
 *
 * Idempotent. Every row is keyed by (recipient, collection, item), the same
 * triple `notifyUsers` writes, so a second run finds its own rows and skips
 * them. That also means it will not duplicate a notification the live path has
 * already sent — running this after the cutover is safe.
 *
 *   pnpm backfill:notifications                  # every org
 *   pnpm backfill:notifications -- --dry-run     # report, write nothing
 *   pnpm backfill:notifications -- --days 60     # a longer window
 *   pnpm backfill:notifications -- --org <id>    # one community
 *
 * Env: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN.
 */

import {
  createDirectus,
  rest,
  staticToken,
  readItems,
  readNotifications,
  createNotification,
} from "@directus/sdk";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("DIRECTUS_URL and DIRECTUS_STATIC_TOKEN are required.");
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const DAYS = Number(argValue("--days") ?? 30);
const ONLY_ORG = argValue("--org");

function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const directus = createDirectus(DIRECTUS_URL).with(staticToken(DIRECTUS_STATIC_TOKEN)).with(rest());

const since = new Date(Date.now() - DAYS * 86400_000).toISOString();
const idOf = (v: any): string | null =>
  !v ? null : typeof v === "string" ? v : v?.id ? String(v.id) : null;

/** One notification we intend to write. */
interface Planned {
  recipient: string;
  subject: string;
  message: string;
  collection: string;
  item: string;
  timestamp: string;
}

/** Plain text, bounded — these become bell rows people actually read. */
function excerpt(html: unknown, max = 160): string {
  const s = String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Members of an org, split by the audience tags content collections use. */
async function orgAudiences(orgId: string) {
  const members = (await directus.request(
    readItems("hoa_members", {
      filter: { organization: { _eq: orgId }, status: { _eq: "active" } },
      fields: ["id", "user", "member_type"],
      limit: -1,
    })
  )) as Array<{ id: string; user: unknown; member_type?: string | null }>;

  const all: string[] = [];
  const owners: string[] = [];
  const tenants: string[] = [];
  const userByMember = new Map<string, string>();
  for (const m of members) {
    const uid = idOf(m.user);
    if (!uid) continue;
    userByMember.set(String(m.id), uid);
    all.push(uid);
    if (m.member_type === "owner") owners.push(uid);
    else if (m.member_type === "tenant") tenants.push(uid);
  }

  const now = new Date().toISOString();
  const terms = (await directus.request(
    readItems("hoa_board_members", {
      filter: { hoa_member: { organization: { _eq: orgId }, status: { _eq: "active" } } },
      fields: ["term_end", { hoa_member: ["user"] }],
      limit: -1,
    })
  )) as Array<{ term_end?: string | null; hoa_member?: { user?: unknown } }>;
  const board = [
    ...new Set(
      terms
        .filter((t) => !t.term_end || t.term_end >= now)
        .map((t) => idOf(t.hoa_member?.user))
        .filter(Boolean) as string[]
    ),
  ];

  return {
    userByMember,
    for(tag: string | null | undefined): string[] {
      const t = String(tag || "all").replace(/\s+/g, "_").toLowerCase();
      if (t === "owners") return owners;
      if (t === "tenants") return tenants;
      if (t === "board_members") return board;
      return all;
    },
  };
}

/**
 * The historical sources, chosen to match what the aggregator actually showed.
 *
 * Deliberately NOT every collection it scanned. Emails already reached people's
 * inboxes and a bell row for each would be a second copy of something already
 * delivered; comments and mentions are conversation, and a month-old "@you" is
 * archaeology rather than history. What is left is the record a member would
 * expect their community's timeline to contain: what was announced, when the
 * board met, what was published, and what they owe.
 */
async function planForOrg(orgId: string, orgName: string): Promise<Planned[]> {
  const audiences = await orgAudiences(orgId);
  const planned: Planned[] = [];

  // ── Announcements ──────────────────────────────────────────────────────────
  const announcements = (await directus.request(
    readItems("hoa_announcements", {
      filter: {
        organization: { _eq: orgId },
        status: { _eq: "published" },
        date_created: { _gte: since },
      },
      fields: ["id", "title", "content", "target_audience", "publish_date", "date_created"],
      limit: -1,
    })
  )) as any[];
  for (const a of announcements) {
    const when = a.publish_date || a.date_created;
    for (const uid of audiences.for(a.target_audience)) {
      planned.push({
        recipient: uid,
        subject: a.title || "New announcement",
        message: excerpt(a.content) || "A new announcement was posted.",
        collection: "hoa_announcements",
        item: String(a.id),
        timestamp: when,
      });
    }
  }

  // ── Meetings ───────────────────────────────────────────────────────────────
  const meetings = (await directus.request(
    readItems("hoa_meetings", {
      filter: {
        organization: { _eq: orgId },
        is_published: { _eq: true },
        date_created: { _gte: since },
      },
      fields: ["id", "title", "type", "meeting_date", "target_audience", "date_created"],
      limit: -1,
    })
  )) as any[];
  const MEETING_LABELS: Record<string, string> = {
    board: "Board meeting",
    annual: "Annual meeting",
    special: "Special meeting",
    committee: "Committee meeting",
  };
  for (const m of meetings) {
    const label = MEETING_LABELS[String(m.type || "")] || "Meeting";
    for (const uid of audiences.for(m.target_audience)) {
      planned.push({
        recipient: uid,
        subject: `${label} scheduled`,
        message: String(m.title || label),
        collection: "hoa_meetings",
        item: String(m.id),
        timestamp: m.date_created,
      });
    }
  }

  // ── Documents ──────────────────────────────────────────────────────────────
  const documents = (await directus.request(
    readItems("hoa_documents", {
      filter: {
        organization: { _eq: orgId },
        status: { _eq: "published" },
        date_created: { _gte: since },
      },
      fields: ["id", "title", "date_published", "date_created"],
      limit: -1,
    })
  )) as any[];
  for (const d of documents) {
    for (const uid of audiences.for("all")) {
      planned.push({
        recipient: uid,
        subject: "New document available",
        message: `"${d.title || "A document"}" was published to the document library.`,
        collection: "hoa_documents",
        item: String(d.id),
        timestamp: d.date_published || d.date_created,
      });
    }
  }

  // ── Payment requests — to the member who owes, and only them ───────────────
  const payments = (await directus.request(
    readItems("payment_requests", {
      filter: {
        organization: { _eq: orgId },
        status: { _in: ["active", "partially_paid", "overdue"] },
        date_created: { _gte: since },
      },
      fields: ["id", "title", "amount", "due_date", "status", "member", "date_created"],
      limit: -1,
    })
  )) as any[];
  for (const p of payments) {
    const uid = audiences.userByMember.get(String(idOf(p.member) ?? ""));
    if (!uid) continue;
    planned.push({
      recipient: uid,
      subject: p.status === "overdue" ? "Payment overdue" : "Payment due",
      message: `${p.title || "A payment"}${p.due_date ? ` — due ${String(p.due_date).slice(0, 10)}` : ""}`,
      collection: "payment_requests",
      item: String(p.id),
      timestamp: p.date_created,
    });
  }

  if (planned.length) {
    console.log(
      `  ${orgName}: ${announcements.length} announcements · ${meetings.length} meetings · ` +
        `${documents.length} documents · ${payments.length} payments → ${planned.length} rows`
    );
  }
  return planned;
}

/**
 * Drop anything already on record.
 *
 * Keyed on (recipient, collection, item) — the same triple the live path writes,
 * which is what makes this safe to run twice, and safe to run after the cutover
 * rather than only before it.
 */
async function filterExisting(planned: Planned[]): Promise<Planned[]> {
  if (!planned.length) return [];
  const byCollection = new Map<string, Set<string>>();
  for (const p of planned) {
    if (!byCollection.has(p.collection)) byCollection.set(p.collection, new Set());
    byCollection.get(p.collection)!.add(p.item);
  }

  const seen = new Set<string>();
  for (const [collection, items] of byCollection) {
    const ids = [...items];
    // Chunked: an `_in` with a few thousand ids is a URL nobody should build.
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const rows = (await directus.request(
        readNotifications({
          filter: { collection: { _eq: collection }, item: { _in: chunk } },
          fields: ["recipient", "collection", "item"],
          limit: -1,
        })
      )) as Array<{ recipient: unknown; collection: string; item: string }>;
      for (const r of rows) {
        seen.add(`${idOf(r.recipient)}|${r.collection}|${r.item}`);
      }
    }
  }

  return planned.filter((p) => !seen.has(`${p.recipient}|${p.collection}|${p.item}`));
}

async function main() {
  console.log(
    `Backfilling notifications from the last ${DAYS} days${DRY_RUN ? " (dry run)" : ""}…`
  );

  const orgs = (await directus.request(
    readItems("hoa_organizations", {
      ...(ONLY_ORG ? { filter: { id: { _eq: ONLY_ORG } } } : {}),
      fields: ["id", "name"],
      limit: -1,
    })
  )) as Array<{ id: string; name: string | null }>;

  let totalPlanned = 0;
  let totalWritten = 0;
  let totalSkipped = 0;
  let failed = 0;

  for (const org of orgs) {
    let planned: Planned[];
    try {
      planned = await planForOrg(org.id, org.name || org.id);
    } catch (e) {
      console.warn(`  ! ${org.name || org.id}: could not plan —`, (e as Error).message);
      continue;
    }
    totalPlanned += planned.length;

    const fresh = await filterExisting(planned);
    totalSkipped += planned.length - fresh.length;
    if (!fresh.length) continue;

    if (DRY_RUN) {
      totalWritten += fresh.length;
      continue;
    }

    for (const row of fresh) {
      try {
        await directus.request(
          createNotification({
            recipient: row.recipient,
            subject: row.subject,
            message: row.message,
            collection: row.collection,
            item: row.item,
            // The point of the whole script. History, not a to-do list.
            status: "archived",
            ...(row.timestamp ? { timestamp: row.timestamp } : {}),
          } as never)
        );
        totalWritten++;
      } catch (e) {
        failed++;
        if (failed <= 5) {
          console.warn(`  ! failed for ${row.collection}/${row.item}:`, (e as Error).message);
        }
      }
    }
  }

  console.log(
    `\n${DRY_RUN ? "Would write" : "Wrote"} ${totalWritten} archived notification(s) ` +
      `across ${orgs.length} org(s). ${totalSkipped} already on record.` +
      (failed ? ` ${failed} failed.` : "")
  );
  if (DRY_RUN) console.log("Dry run — nothing was written.");
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
