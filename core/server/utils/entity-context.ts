// Entity dossiers for the AI assistant — the server-side counterpart to the
// client's "focus" (useAiContext.setContext). When the user is looking at a
// specific record (a member, vendor, project, ticket/violation, meeting, or
// channel), getEntityContext() assembles a compact CURRENT FOCUS block from that
// record + its most useful related rows, with inline [Source: X] tags, and the
// chat route injects it so the assistant answers about THIS thing without the
// client scraping the DOM.
//
// Tenant-isolated: every record is fetched filtered by { organization: orgId },
// so a focused id from another org resolves to null (treated as "no dossier")
// rather than leaking. Best-effort throughout — each section degrades to omitted
// rather than throwing, and any builder failure returns null (a plain answer).
//
// getTypedDirectus is auto-imported from server/utils/directus.ts.

import { readItems } from "@directus/sdk";

/** ~800-token budget (≈ chars/4) for a whole dossier — keep the prompt lean. */
const ENTITY_BUDGET_CHARS = 3200;

/** Entity kinds we build a dossier for. Others fall back to the compact hint. */
export const DOSSIER_ENTITY_TYPES = [
  "member",
  "vendor",
  "project",
  "request",
  "violation",
  "ticket",
  "meeting",
  "channel",
] as const;

function clip(s: unknown, max = 160): string {
  const t = String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function shortDate(iso: unknown): string {
  const s = String(iso ?? "");
  return s ? s.slice(0, 10) : "";
}

function money(n: unknown): string {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "";
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Run a best-effort read, returning `fallback` on any failure. */
async function tryRead<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/** Wrap accumulated lines in the standard focus header, trimmed to budget. */
function frame(lines: string[]): string | null {
  const body = lines.filter((l) => l !== undefined && l !== null).join("\n");
  if (!body.trim()) return null;
  const trimmed = body.length > ENTITY_BUDGET_CHARS ? `${body.slice(0, ENTITY_BUDGET_CHARS)}…` : body;
  return [
    "CURRENT FOCUS — the user is looking at this specific record. Prefer it when",
    "answering, and cite the [Source: …] tags. If a detail isn't here, say so.",
    "",
    trimmed,
  ].join("\n");
}

interface EntityInput {
  orgId: string;
  entityType: string;
  entityId: string;
}

/**
 * Build a focus dossier for the entity the user is viewing, or null when the
 * type is unsupported / the record isn't in this org / everything failed.
 */
export async function getEntityContext(input: EntityInput): Promise<string | null> {
  const { orgId, entityType, entityId } = input;
  if (!orgId || !entityType || !entityId) return null;
  try {
    switch (entityType) {
      case "member":
        return await buildMemberContext(orgId, entityId);
      case "vendor":
        return await buildVendorContext(orgId, entityId);
      case "project":
        return await buildProjectContext(orgId, entityId);
      case "request":
      case "violation":
      case "ticket":
        return await buildRequestContext(orgId, entityId);
      case "meeting":
        return await buildMeetingContext(orgId, entityId);
      case "channel":
        return await buildChannelContext(orgId, entityId);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Fetch one org-scoped record by id, or null (cross-tenant/unknown → null). */
async function readOne<T = any>(collection: string, orgId: string, id: string, fields: any[]): Promise<T | null> {
  const rows = (await getTypedDirectus().request(
    (readItems as any)(collection, {
      filter: { id: { _eq: id }, organization: { _eq: orgId } },
      fields,
      limit: 1,
    })
  )) as T[];
  return rows?.[0] ?? null;
}

// ── member ───────────────────────────────────────────────────────────────────
async function buildMemberContext(orgId: string, id: string): Promise<string | null> {
  const m = await readOne("hoa_members", orgId, id, [
    "id",
    "first_name",
    "last_name",
    "email",
    "phone",
    "company",
    "member_type",
    "status",
    "payment_status",
    "outstanding_balance",
    "last_payment_date",
    "last_payment_amount",
    "total_payments",
    "mailing_address",
  ]);
  if (!m) return null;

  const lines: string[] = [];
  const name = [m.first_name, m.last_name].filter(Boolean).join(" ") || "(unnamed member)";
  lines.push(`Member: ${name} [Source: Member]`);
  const bits = [
    m.member_type ? `${m.member_type}` : "",
    m.status ? `status ${m.status}` : "",
    m.company ? `company ${clip(m.company, 60)}` : "",
  ].filter(Boolean);
  if (bits.length) lines.push(`- ${bits.join(" · ")}`);
  const contact = [m.email, m.phone].filter(Boolean).join(" · ");
  if (contact) lines.push(`- Contact: ${contact}`);
  const addr = m.mailing_address;
  if (addr && (addr.line1 || addr.city)) {
    lines.push(`- Mailing: ${clip([addr.line1, addr.line2, addr.city, addr.state, addr.zip].filter(Boolean).join(", "), 120)}`);
  }

  // Financials
  const fin = [
    m.payment_status ? `payment status ${m.payment_status}` : "",
    m.outstanding_balance != null ? `balance ${money(m.outstanding_balance)}` : "",
    m.last_payment_date ? `last paid ${shortDate(m.last_payment_date)}${m.last_payment_amount != null ? ` (${money(m.last_payment_amount)})` : ""}` : "",
  ].filter(Boolean);
  if (fin.length) lines.push(`- Payments: ${fin.join(" · ")} [Source: Payments]`);

  // Household counts + open requests about them (each best-effort).
  const [units, vehicles, pets, openReqs] = await Promise.all([
    tryRead(
      () =>
        getTypedDirectus().request(
          (readItems as any)("hoa_member_units", {
            filter: { member_id: { _eq: id } },
            fields: ["id", "is_primary_unit"],
            limit: 10,
          })
        ) as Promise<any[]>,
      [] as any[]
    ),
    tryRead(
      () =>
        getTypedDirectus().request(
          (readItems as any)("hoa_vehicles", {
            filter: { member_id: { _eq: id } },
            fields: ["make", "model", "year", "license_plate"],
            limit: 6,
          })
        ) as Promise<any[]>,
      [] as any[]
    ),
    tryRead(
      () =>
        getTypedDirectus().request(
          (readItems as any)("hoa_pets", {
            filter: { member_id: { _eq: id } },
            fields: ["name", "type", "breed"],
            limit: 6,
          })
        ) as Promise<any[]>,
      [] as any[]
    ),
    tryRead(
      () =>
        getTypedDirectus().request(
          (readItems as any)("hoa_requests", {
            filter: {
              organization: { _eq: orgId },
              member: { _eq: id },
              status: { _in: ["open", "in_progress", "waiting"] },
            },
            fields: ["title", "type", "status", "priority"],
            sort: ["-date_created"],
            limit: 5,
          })
        ) as Promise<any[]>,
      [] as any[]
    ),
  ]);

  if (units.length) lines.push(`- Units on file: ${units.length}`);
  if (vehicles.length) {
    lines.push(
      `- Vehicles: ${vehicles.map((v) => clip([v.year, v.make, v.model].filter(Boolean).join(" ") + (v.license_plate ? ` (${v.license_plate})` : ""), 40)).join("; ")}`
    );
  }
  if (pets.length) {
    lines.push(`- Pets: ${pets.map((p) => clip([p.name, p.type || p.breed].filter(Boolean).join(" – "), 30)).join("; ")}`);
  }
  if (openReqs.length) {
    lines.push("- Open requests/violations about this member [Source: Requests]:");
    for (const r of openReqs) {
      lines.push(`  · ${r.type ? `[${r.type}] ` : ""}${clip(r.title, 70)} — ${r.status}${r.priority ? ` (${r.priority})` : ""}`);
    }
  }

  return frame(lines);
}

// ── vendor ───────────────────────────────────────────────────────────────────
async function buildVendorContext(orgId: string, id: string): Promise<string | null> {
  const v = await readOne("hoa_vendors", orgId, id, [
    "id",
    "company",
    "name",
    "category",
    "category_other",
    "email",
    "phone",
    "website",
    "status",
    "management_role",
    "active_since",
    "notes",
    "show_to_members",
  ]);
  if (!v) return null;

  const lines: string[] = [];
  lines.push(`Vendor: ${clip(v.company || v.name, 80)} [Source: Vendor]`);
  const cat = v.category === "other" ? v.category_other : v.category;
  const bits = [
    cat ? `category ${cat}` : "",
    v.status ? `status ${v.status}` : "",
    v.management_role ? `management role ${v.management_role}` : "",
  ].filter(Boolean);
  if (bits.length) lines.push(`- ${bits.join(" · ")}`);
  if (v.name && v.company) lines.push(`- Contact: ${clip(v.name, 60)}`);
  const contact = [v.email, v.phone, v.website].filter(Boolean).join(" · ");
  if (contact) lines.push(`- ${contact}`);
  if (v.active_since) lines.push(`- Active since ${shortDate(v.active_since)}`);
  if (v.notes) lines.push(`- Notes: ${clip(v.notes, 200)}`);

  const jobs = await tryRead(
    () =>
      getTypedDirectus().request(
        (readItems as any)("hoa_projects_vendors", {
          filter: { hoa_vendors_id: { _eq: id } },
          fields: ["role", { hoa_projects_id: ["title", "status"] }],
          limit: 8,
        })
      ) as Promise<any[]>,
    [] as any[]
  );
  const namedJobs = jobs.filter((j) => j.hoa_projects_id?.title);
  if (namedJobs.length) {
    lines.push("- Projects worked [Source: Projects]:");
    for (const j of namedJobs) {
      lines.push(`  · ${clip(j.hoa_projects_id.title, 60)}${j.hoa_projects_id.status ? ` [${j.hoa_projects_id.status}]` : ""}${j.role ? ` — ${clip(j.role, 30)}` : ""}`);
    }
  }

  return frame(lines);
}

// ── project ──────────────────────────────────────────────────────────────────
async function buildProjectContext(orgId: string, id: string): Promise<string | null> {
  const p = await readOne("hoa_projects", orgId, id, [
    "id",
    "title",
    "description",
    "status",
    "start_date",
    "due_date",
    "completion_date",
    "budget_amount",
    "actual_spend",
    "member_visible",
  ]);
  if (!p) return null;

  const lines: string[] = [];
  lines.push(`Project: ${clip(p.title, 90)} [Source: Project]`);
  const bits = [
    p.status ? `status ${p.status}` : "",
    p.start_date ? `start ${shortDate(p.start_date)}` : "",
    p.due_date ? `due ${shortDate(p.due_date)}` : "",
    p.completion_date ? `completed ${shortDate(p.completion_date)}` : "",
  ].filter(Boolean);
  if (bits.length) lines.push(`- ${bits.join(" · ")}`);
  if (p.budget_amount != null || p.actual_spend != null) {
    lines.push(`- Budget ${money(p.budget_amount)} · spent ${money(p.actual_spend)}`);
  }
  if (p.description) lines.push(`- ${clip(p.description, 220)}`);

  const [events, tasks] = await Promise.all([
    tryRead(
      () =>
        getTypedDirectus().request(
          (readItems as any)("hoa_project_events", {
            filter: { project: { _eq: id } },
            fields: ["title", "type", "event_date", "is_milestone", "approval"],
            sort: ["event_date"],
            limit: 8,
          })
        ) as Promise<any[]>,
      [] as any[]
    ),
    tryRead(
      () =>
        getTypedDirectus().request(
          (readItems as any)("hoa_tasks", {
            filter: { project: { _eq: id } },
            fields: ["title", "status", "priority", "due_date"],
            sort: ["-date_created"],
            limit: 8,
          })
        ) as Promise<any[]>,
      [] as any[]
    ),
  ]);

  if (events.length) {
    lines.push("- Milestones/phases [Source: Timeline]:");
    for (const e of events) {
      lines.push(`  · ${clip(e.title, 60)}${e.event_date ? ` (${shortDate(e.event_date)})` : ""}${e.is_milestone ? " ★" : ""}${e.approval ? ` [${e.approval}]` : ""}`);
    }
  }
  if (tasks.length) {
    const open = tasks.filter((t) => t.status && !["done", "complete", "completed"].includes(String(t.status).toLowerCase()));
    lines.push(`- Tasks: ${tasks.length} total, ${open.length} open [Source: Tasks]`);
    for (const t of open.slice(0, 5)) {
      lines.push(`  · ${clip(t.title, 60)} — ${t.status}${t.due_date ? ` (due ${shortDate(t.due_date)})` : ""}`);
    }
  }

  return frame(lines);
}

// ── request / ticket / violation ──────────────────────────────────────────────
async function buildRequestContext(orgId: string, id: string): Promise<string | null> {
  const r = await readOne("hoa_requests", orgId, id, [
    "id",
    "title",
    "description",
    "type",
    "status",
    "priority",
    "category",
    "due_date",
    "date_created",
    { member: ["first_name", "last_name"] },
    { assigned_to: ["first_name", "last_name", "email"] },
  ]);
  if (!r) return null;

  const lines: string[] = [];
  const kind = r.type === "violation" ? "Violation" : r.type === "arc" ? "ARC request" : r.type ? `${r.type} request` : "Request";
  lines.push(`${kind}: ${clip(r.title, 90)} [Source: Request]`);
  const bits = [
    r.status ? `status ${r.status}` : "",
    r.priority ? `priority ${r.priority}` : "",
    r.category ? `category ${clip(r.category, 40)}` : "",
    r.due_date ? `due ${shortDate(r.due_date)}` : "",
    r.date_created ? `opened ${shortDate(r.date_created)}` : "",
  ].filter(Boolean);
  if (bits.length) lines.push(`- ${bits.join(" · ")}`);
  const subject = r.member ? [r.member.first_name, r.member.last_name].filter(Boolean).join(" ") : "";
  if (subject) lines.push(`- Subject member: ${subject}`);
  const owner = r.assigned_to ? [r.assigned_to.first_name, r.assigned_to.last_name].filter(Boolean).join(" ") : "";
  if (owner) lines.push(`- Assigned to: ${owner}`);
  if (r.description) lines.push(`- ${clip(r.description, 240)}`);

  const comments = await tryRead(
    () =>
      getTypedDirectus().request(
        (readItems as any)("hoa_comments", {
          filter: { target_collection: { _eq: "hoa_requests" }, target_id: { _eq: id } },
          fields: ["body", "is_internal", "date_created", { user_created: ["first_name", "last_name"] }],
          sort: ["-date_created"],
          limit: 6,
        })
      ) as Promise<any[]>,
    [] as any[]
  );
  if (comments.length) {
    lines.push("- Recent activity/comments [Source: Comments]:");
    for (const c of comments.reverse()) {
      const who = c.user_created ? [c.user_created.first_name, c.user_created.last_name].filter(Boolean).join(" ") : "";
      lines.push(`  · ${shortDate(c.date_created)}${who ? ` ${who}` : ""}${c.is_internal ? " (internal)" : ""}: ${clip(c.body, 120)}`);
    }
  }

  return frame(lines);
}

// ── meeting ──────────────────────────────────────────────────────────────────
async function buildMeetingContext(orgId: string, id: string): Promise<string | null> {
  const m = await readOne("hoa_meetings", orgId, id, [
    "id",
    "title",
    "type",
    "status",
    "meeting_date",
    "end_date",
    "location",
    "virtual_url",
    "agenda",
    "minutes",
  ]);
  if (!m) return null;

  const lines: string[] = [];
  lines.push(`Meeting: ${clip(m.title, 90)} [Source: Meeting]`);
  const bits = [
    m.type ? `${m.type}` : "",
    m.status ? `status ${m.status}` : "",
    m.meeting_date ? `on ${shortDate(m.meeting_date)}` : "",
    m.location ? `at ${clip(m.location, 40)}` : m.virtual_url ? "virtual" : "",
  ].filter(Boolean);
  if (bits.length) lines.push(`- ${bits.join(" · ")}`);
  if (m.agenda) lines.push(`- Agenda: ${clip(m.agenda, 240)}`);
  if (m.minutes) lines.push(`- Minutes on file (${clip(m.minutes, 120)})`);

  const attendees = await tryRead(
    () =>
      getTypedDirectus().request(
        (readItems as any)("hoa_meeting_attendees", {
          filter: { meeting: { _eq: id } },
          fields: ["attendance", "is_board_member"],
          limit: 100,
        })
      ) as Promise<any[]>,
    [] as any[]
  );
  if (attendees.length) {
    const present = attendees.filter((a) => a.attendance === "present").length;
    lines.push(`- Attendees: ${attendees.length} recorded, ${present} present [Source: Attendees]`);
  }

  return frame(lines);
}

// ── channel ──────────────────────────────────────────────────────────────────
async function buildChannelContext(orgId: string, id: string): Promise<string | null> {
  const c = await readOne("hoa_channels", orgId, id, [
    "id",
    "name",
    "description",
    "is_private",
    "is_default",
    "status",
    { request: ["title", "type", "status"] },
  ]);
  if (!c) return null;

  const lines: string[] = [];
  lines.push(`Channel: #${clip(c.name, 60)} [Source: Channel]`);
  const bits = [c.is_private ? "private" : "open", c.status ? `status ${c.status}` : ""].filter(Boolean);
  if (bits.length) lines.push(`- ${bits.join(" · ")}`);
  if (c.description) lines.push(`- ${clip(c.description, 200)}`);
  if (c.request?.title) {
    lines.push(`- Discussion channel for request: ${clip(c.request.title, 70)}${c.request.status ? ` [${c.request.status}]` : ""}`);
  }

  const [members, msgs] = await Promise.all([
    tryRead(
      () =>
        getTypedDirectus().request(
          (readItems as any)("hoa_channel_members", {
            filter: { channel: { _eq: id } },
            fields: ["id"],
            limit: 200,
          })
        ) as Promise<any[]>,
      [] as any[]
    ),
    tryRead(
      () =>
        getTypedDirectus().request(
          (readItems as any)("hoa_channel_messages", {
            filter: { channel: { _eq: id }, status: { _eq: "published" } },
            fields: ["content", "date_created", { user_created: ["first_name", "last_name"] }],
            sort: ["-date_created"],
            limit: 5,
          })
        ) as Promise<any[]>,
      [] as any[]
    ),
  ]);
  if (members.length) lines.push(`- Members: ${members.length}`);
  if (msgs.length) {
    lines.push("- Recent messages [Source: Messages]:");
    for (const msg of msgs.reverse()) {
      const who = msg.user_created ? [msg.user_created.first_name, msg.user_created.last_name].filter(Boolean).join(" ") : "";
      lines.push(`  · ${shortDate(msg.date_created)}${who ? ` ${who}` : ""}: ${clip(msg.content, 100)}`);
    }
  }

  return frame(lines);
}
