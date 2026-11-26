/**
 * The demo scenario: everything the Harborview Lofts (`demo`) community needs so
 * that each of the six logins (docs/plan-unified-experience.md §5) opens to a
 * home that is full of believable things to look at and act on.
 *
 * Runs at the end of seedDemos(), so the nightly reset restores it. Idempotent:
 * every row is found by org and title first. Dates are relative to `now`.
 * DEMO DATA ONLY: the passwords below are throwaway and the accounts hold no
 * real person's data.
 *
 * Logins (all on the demo community): the existing demo admin, plus
 * demo-tenant / demo-owner / demo-board / demo-team / demo-manager @hoaconnect.info.
 */
export interface ScenarioCtx {
  dx: (endpoint: string, options?: RequestInit) => Promise<any>;
  findOne: (collection: string, filter: any, fields?: string) => Promise<any>;
  dry: boolean;
  log: (msg: string) => void;
  now: Date;
}

export interface Persona {
  key: "tenant" | "owner" | "board" | "team" | "manager";
  first: string;
  last: string;
  password: string;
  member_type: "tenant" | "owner" | null;
  directusRole: "HOA Member" | "Property Manager";
}

export const DEMO_DOMAIN = "hoaconnect.info";
export const PERSONAS: Persona[] = [
  { key: "tenant", first: "Tessa", last: "Tenant", password: "IPnjkRvXWOLUBp43Aa1!", member_type: "tenant", directusRole: "HOA Member" },
  { key: "owner", first: "Owen", last: "Owner", password: "rNv5btf0g7iU2jHaAa1!", member_type: "owner", directusRole: "HOA Member" },
  { key: "board", first: "Bea", last: "Board", password: "2pFAUMQtk5dnEOnvAa1!", member_type: "owner", directusRole: "HOA Member" },
  { key: "team", first: "Terry", last: "Team", password: "lgBXzIrpn8nWw3NtAa1!", member_type: "owner", directusRole: "HOA Member" },
  { key: "manager", first: "Max", last: "Manager", password: "Z3FJENmiACP670OWAa1!", member_type: null, directusRole: "Property Manager" },
];
export const personaEmail = (p: Persona) => `demo-${p.key}@${DEMO_DOMAIN}`;

const qs = (o: Record<string, any>) =>
  "?" + Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(typeof v === "string" ? v : JSON.stringify(v))}`).join("&");

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Dates and ids a scenario row set is built from. Pure, so it is unit-tested. */
export function scenarioDates(now: Date) {
  const at = (days: number, hour = 12) => {
    const d = new Date(now.getTime() + days * DAY);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const day = (days: number) => ymd(new Date(now.getTime() + days * DAY));
  const monthStart = (back: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
  return { at, day, monthStart };
}

/**
 * Owen's dues: ten months paid, this month's overdue (due on the 1st), next
 * month's due. Statuses are what the app writes: paid, overdue, active.
 */
export function ownerDues(now: Date, amount = 250) {
  const { monthStart } = scenarioDates(now);
  const rows: Array<{ title: string; due_date: string; status: "paid" | "overdue" | "active"; paid_at: string | null; amount: number }> = [];
  for (let back = 10; back >= -1; back--) {
    const due = monthStart(back);
    const label = due.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const status = back >= 1 ? "paid" : back === 0 ? "overdue" : "active";
    rows.push({
      title: `Monthly dues — ${label}`,
      due_date: ymd(due),
      status,
      paid_at: status === "paid" ? new Date(due.getTime() + 3 * DAY).toISOString() : null,
      amount,
    });
  }
  return rows;
}

/** A one-page PDF with a title and a line of text, valid enough to open in any viewer. Pure. */
export function demoPdf(title: string, body: string): string {
  const esc = (t: string) => t.replace(/[\\()]/g, "\\$&");
  const stream = `BT /F1 20 Tf 72 720 Td (${esc(title)}) Tj 0 -32 Td /F1 12 Tf (${esc(body)}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

export async function seedScenario(c: ScenarioCtx, t: { orgId: string; adminUserId: string }): Promise<void> {
  const { dx, findOne, dry, log, now } = c;
  const { at, day } = scenarioDates(now);
  const org = { organization: t.orgId };

  const mut = async (label: string, method: "POST" | "PATCH", endpoint: string, body: unknown) => {
    if (dry) {
      log(`  (dry) ${label}`);
      return { data: { id: "DRY" } };
    }
    log(`  ${label}`);
    return dx(endpoint, { method, body: JSON.stringify(body) });
  };
  /** Create the row unless one with this title is already there; returns its id. */
  const ensure = async (collection: string, title: string, body: Record<string, any>, filterExtra: Record<string, any> = {}): Promise<string> => {
    const found = await findOne(collection, { organization: { _eq: t.orgId }, title: { _eq: title }, ...filterExtra });
    if (found) return found.id;
    return (await mut(`${collection}: ${title}`, "POST", `/items/${collection}`, { ...org, title, ...body }))?.data?.id ?? "DRY";
  };

  log("  Scenario (six logins):");

  // ── The five role logins ────────────────────────────────────────────────
  const roles = (await dx(`/roles${qs({ fields: "id,name", limit: 100 })}`))?.data || [];
  const roleId = (name: string) => roles.find((r: any) => r.name === name)?.id as string | undefined;
  const ids = {} as Record<Persona["key"], { user: string; member: string }>;
  for (const p of PERSONAS) {
    const email = personaEmail(p);
    const dRole = roleId(p.directusRole);
    if (!dRole) throw new Error(`role ${p.directusRole} not found`);
    let user = (await dx(`/users${qs({ filter: { email: { _eq: email } }, fields: "id", limit: 1 })}`))?.data?.[0];
    if (!user) user = (await mut(`user ${email}`, "POST", "/users", { email, password: p.password, first_name: p.first, last_name: p.last, role: dRole, status: "active" }))?.data;
    // The password here is the only one these logins have: put it back (and
    // un-suspend the account) every run, whatever was set by hand since.
    else if (!dry) await dx(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ password: p.password, status: "active" }) });
    const manager = p.key === "manager";
    let member = await findOne("hoa_members", { organization: { _eq: t.orgId }, email: { _eq: email } }, "id,member_type");
    if (!member)
      member = (
        await mut(`member ${email}`, "POST", "/items/hoa_members", {
          ...org, user: user.id, role: dRole, first_name: p.first, last_name: p.last, email, member_type: p.member_type, status: "active",
          ...(manager
            ? { is_manager: true, manager_title: "Property Manager", manager_permissions: { inquiries: true, violations: true, directory: true, documents: true, communications: true, feedback: true, projects: true, responsibilities: true } }
            : {}),
        })
      )?.data;
    else if (!dry && member.member_type !== p.member_type) await dx(`/items/hoa_members/${member.id}`, { method: "PATCH", body: JSON.stringify({ member_type: p.member_type }) });
    ids[p.key] = { user: user?.id ?? "DRY", member: member?.id ?? "DRY" };

    if (p.key === "board" && (dry || !(await findOne("hoa_board_members", { hoa_member: { _eq: member.id } }))))
      await mut("board term (director)", "POST", "/items/hoa_board_members", { hoa_member: member.id, title: "director", status: "published", term_start: "2026-01-01" });
    if (p.key === "team")
      for (const area of ["documents", "feedback", "projects", "responsibilities"]) {
        if (!dry && (await findOne("hoa_area_grants", { organization: { _eq: t.orgId }, member: { _eq: member.id }, area: { _eq: area }, ends_at: { _null: true } }))) continue;
        await mut(`area grant ${area}`, "POST", "/items/hoa_area_grants", { ...org, member: member.id, area, starts_at: "2026-01-01T00:00:00.000Z", granted_by: t.adminUserId, holder_name: `${p.first} ${p.last}` });
      }
  }
  // Prove each login works with the password above, so a drifted account shows
  // up in the seed log instead of as a 401 on the sign-in page.
  if (!dry)
    for (const p of PERSONAS) {
      const email = personaEmail(p);
      try {
        await dx("/auth/login", { method: "POST", body: JSON.stringify({ email, password: p.password }) });
      } catch (e) {
        log(`  ! ${email} cannot sign in with its scenario.ts password: ${(e as Error).message}`);
      }
    }

  // ── Owner: a year of dues, one overdue, one due, a waiver waiting on the board ──
  const marker = "Demo scenario";
  let overdueCharge: string | null = null;
  // Bea and Terry are owners too: paid up, with next month's dues coming.
  for (const who of ["board", "team"] as const)
    for (const d of ownerDues(now).map((x) => (x.status === "overdue" ? { ...x, status: "paid" as const, paid_at: new Date(Date.parse(x.due_date) + 2 * DAY).toISOString() } : x))) {
      if (await findOne("payment_requests", { organization: { _eq: t.orgId }, member: { _eq: ids[who].member }, title: { _eq: d.title } })) continue;
      const paid = d.status === "paid";
      await mut(`dues ${d.title} for ${who}`, "POST", "/items/payment_requests", {
        ...org, member: ids[who].member, request_type: "monthly_dues", title: d.title, status: d.status, amount: d.amount,
        amount_paid: paid ? d.amount : 0, amount_remaining: paid ? 0 : d.amount, due_date: d.due_date, paid_at: d.paid_at, source: "manual", notes: marker,
      });
    }
  for (const d of ownerDues(now)) {
    const have = await findOne("payment_requests", { organization: { _eq: t.orgId }, member: { _eq: ids.owner.member }, title: { _eq: d.title } }, "id,status");
    if (have) {
      if (d.status === "overdue" && have.status === "overdue") overdueCharge = have.id;
      continue;
    }
    const paid = d.status === "paid";
    const row = (await mut(`dues ${d.title} (${d.status})`, "POST", "/items/payment_requests", {
      ...org, member: ids.owner.member, request_type: "monthly_dues", title: d.title, status: d.status, amount: d.amount,
      amount_paid: paid ? d.amount : 0, amount_remaining: paid ? 0 : d.amount, due_date: d.due_date, paid_at: d.paid_at, source: "manual", notes: marker,
    }))?.data;
    if (d.status === "overdue") overdueCharge = row?.id ?? null;
  }

  // ── Tenant, owner, manager: requests, violations, questions ──
  const req = async (title: string, type: string, status: string, who: Persona["key"] | null, daysAgo: number, extra: Record<string, any> = {}) => {
    const created = at(-daysAgo, 14);
    const id = await ensure("hoa_requests", title, {
      type, status, priority: extra.priority ?? "normal", description: extra.description ?? null,
      ...(who ? { submitted_by: ids[who].user, member: ids[who].member } : { submitted_by: t.adminUserId }),
      ...(extra.updated ? { date_updated: at(-extra.updated, 16) } : {}),
    });
    // Directus stamps date_created on create; a PATCH sets the back-dated value
    // the queue's age and the response-time sparkline read.
    if (!dry && id !== "DRY") {
      const row = (await dx(`/items/hoa_requests/${id}${qs({ fields: "date_created" })}`))?.data;
      if (row && Date.parse(row.date_created) - Date.parse(created) > DAY)
        await dx(`/items/hoa_requests/${id}`, { method: "PATCH", body: JSON.stringify({ date_created: created, ...(extra.updated ? { date_updated: at(-extra.updated, 16) } : {}) }) });
    }
  };
  await req("Leaking kitchen faucet", "maintenance", "in_progress", "tenant", 6, { description: "Drips constantly under the sink in 4B.", priority: "high" });
  await req("Gate fob stopped working", "maintenance", "open", "tenant", 2, { description: "Side gate fob no longer opens the door." });
  await req("Question about guest parking", "question", "resolved", "tenant", 15, { updated: 13 });
  await req("Hallway light out on level 3", "maintenance", "open", "owner", 4);
  await req("Trash bins left out past pickup", "violation", "open", null, 9, { description: "Reported on Tuesday, bins at the curb overnight." });
  await req("Unapproved item on balcony railing", "violation", "cure_period", null, 12, { priority: "high" });
  await req("Garage door sensor is flaky", "maintenance", "in_progress", null, 7);
  await req("Pet policy question", "question", "open", "owner", 1);
  const settled: Array<[string, number, number]> = [["Package room latch", 40, 38], ["Lobby thermostat", 34, 31], ["Pool gate squeak", 27, 24], ["Mail key replacement", 20, 17], ["Elevator inspection tag", 13, 11], ["Courtyard sprinkler", 8, 7], ["Recycling pickup question", 5, 4]];
  for (const [title, created, finished] of settled) await req(title, "maintenance", "resolved", null, created, { updated: finished });

  // ── The feed: announcements ──
  const ann = (title: string, content: string, daysAgo: number, pinned = false) =>
    ensure("hoa_announcements", title, { content, status: "published", announcement_type: "general", publish_date: at(-daysAgo, 9), is_pinned: pinned, target_audience: "all" });
  await ann("Welcome to Harborview Lofts", "Pay dues, send requests, vote in polls and see what is happening in the building, all in one place.", 30, true);
  const waterNotice = await ann("Water shut-off Thursday 10am–1pm", "We are replacing the main valve. Please store some water ahead of time.", 5);
  // A notice to acknowledge (tenant "Notices", swipe to acknowledge): the due
  // date moves with the run, so the row is never overdue on a fresh demo.
  if (!dry && waterNotice !== "DRY") {
    await dx(`/items/hoa_announcements/${waterNotice}`, { method: "PATCH", body: JSON.stringify({ requires_acknowledgment: true, ack_due: day(3) }) });
    // Each run puts the row back: drop acknowledgments of this notice by the demo logins.
    const acks = (await dx(`/items/hoa_acknowledgments${qs({ filter: { announcement: { _eq: waterNotice } }, fields: "id", limit: -1 })}`))?.data ?? [];
    if (acks.length) await dx("/items/hoa_acknowledgments", { method: "DELETE", body: JSON.stringify(acks.map((a: { id: string }) => a.id)) });
  }
  await ann("Holiday lobby decorating", "Volunteers welcome Saturday at 2pm. Cocoa provided.", 2);

  // ── Meetings: one past with minutes, two coming up ──
  const mtg = (title: string, status: string, startDays: number, extra: Record<string, any> = {}) =>
    ensure("hoa_meetings", title, { type: "board", status, meeting_date: at(startDays, 18), end_date: at(startDays, 20), location: "Lobby lounge", is_published: true, target_audience: "all", ...extra });
  await mtg("November board meeting", "completed", -18, { minutes: "Approved the lobby lighting contract. Reviewed reserve study." });
  await mtg("December board meeting", "scheduled", 12, { agenda: "Budget draft\nGutter repair approval\nHoliday party" });
  await mtg("Annual owners meeting", "scheduled", 55, { type: "annual", agenda: "Board elections\nBudget vote" });

  // ── A form for owners to sign (owner "Forms to sign"), with its PDF ──
  const formTitle = "Pet registration 2027";
  const form = await findOne("hoa_forms", { organization: { _eq: t.orgId }, title: { _eq: formTitle } }, "id");
  if (form) {
    if (!dry) await dx(`/items/hoa_forms/${form.id}`, { method: "PATCH", body: JSON.stringify({ status: "open", due_date: day(7) }) });
  } else {
    let fileId: string | null = null;
    if (!dry) {
      const fd = new FormData();
      fd.append("title", `${formTitle} (demo)`);
      fd.append("file", new Blob([demoPdf(formTitle, "Register each pet living in your home for 2027 (demo copy).")], { type: "application/pdf" }), "pet-registration-2027.pdf");
      fileId = (await dx("/files", { method: "POST", body: fd }))?.data?.id ?? null;
    }
    await mut(`hoa_forms: ${formTitle}`, "POST", "/items/hoa_forms", {
      ...org, title: formTitle, description: "One form per household, so the building knows who lives here.",
      audience: "owners", status: "open", due_date: day(7), sent_at: at(-2, 9), ...(fileId ? { document: fileId } : {}),
    });
  }

  // ── Polls the owner can vote in ──
  const poll = (title: string, closesDays: number, options: string[]) =>
    ensure("hoa_polls", title, { status: "open", closes_at: at(closesDays, 17), options: options.map((label, i) => ({ id: `o${i + 1}`, label })) });
  const pollIds = [
    await poll("Rooftop deck hours", 10, ["Dawn to 10pm", "Dawn to 9pm", "Dawn to 11pm"]),
    await poll("Add a bike room?", 9, ["Yes", "No"]),
  ].filter((id) => id !== "DRY");
  // Each run reopens the ballot: drop the demo logins' votes on these polls.
  if (!dry && pollIds.length) {
    const users = Object.values(ids).map((x) => x.user);
    const votes = (await dx(`/items/hoa_poll_votes${qs({ filter: { poll: { _in: pollIds }, user: { _in: users } }, fields: "id", limit: -1 })}`))?.data ?? [];
    if (votes.length) await dx("/items/hoa_poll_votes", { method: "DELETE", body: JSON.stringify(votes.map((v: { id: string }) => v.id)) });
  }

  // ── Team tasks across this week ──
  const task = (title: string, status: string, dueDays: number, done = false) =>
    ensure("hoa_tasks", title, { status, priority: "medium", due_date: day(dueDays), assigned_to: [{ directus_users_id: ids.team.user }], ...(done ? { date_completed: at(dueDays, 10) } : {}) });
  await task("Replace lobby bulbs", "new", 2);
  await task("Post holiday schedule on the notice board", "new", 4);
  await task("Collect bids for hallway paint", "in_progress", 6);
  await task("Update the guest parking sign", "completed", -1, true);
  await task("Photograph the lobby for the website", "completed", -3, true);

  // ── A project past its due date, for the team's Projects queue ──
  await ensure("hoa_projects", "Hallway repaint", { status: "active", start_date: day(-40), due_date: day(-5), description: "Repaint the level 2 and 3 hallways." });

  // ── Vendors with end dates across the year ──
  // Vendors are named by `name`, not `title`.
  // The end date is the contract's (`contract_end`); `active_until` is left empty,
  // since these vendors are still on the job. Older runs wrote it there, so it is moved.
  const vendor = async (name: string, category: string, until: string) => {
    const have = await findOne("hoa_vendors", { organization: { _eq: t.orgId }, name: { _eq: name } }, "id,contract_end,active_until");
    if (have) {
      if (!have.contract_end && !dry)
        await dx(`/items/hoa_vendors/${have.id}`, { method: "PATCH", body: JSON.stringify({ contract_end: until, active_until: null }) });
      return;
    }
    await mut(`hoa_vendors: ${name}`, "POST", "/items/hoa_vendors", { ...org, name, category, status: "active", contract_end: until, active_since: "2024-01-01" });
  };
  const year = now.getUTCFullYear();
  await vendor("Harbor Landscaping", "landscaping", `${year}-12-31`);
  await vendor("Summit Elevator Service", "elevator", `${year}-12-15`);
  await vendor("Clearview Window Cleaning", "cleaning", `${year + 1}-03-31`);
  await vendor("Bayside Pest Control", "pest_control", `${year}-11-30`);

  // ── Money approvals waiting on the board (the rule decides who can vote) ──
  const expense = async (title: string, vendorName: string, amount: number, category: string, daysAgo: number) => {
    const id = await ensure("payment_expenses", title, { vendor: vendorName, amount, category, status: "submitted", entered_by: t.adminUserId, expense_date: at(-daysAgo), date_created: at(-daysAgo, 11) });
    if (!dry && !(await findOne("money_approvals", { organization: { _eq: t.orgId }, expense: { _eq: id } }))) {
      const a = (await mut(`approval for ${title}`, "POST", "/items/money_approvals", { ...org, kind: "spend", expense: id, round: 1, state: "pending", mode: "majority", needed: 2, requested_by: t.adminUserId, excluded: [t.adminUserId], date_created: at(-daysAgo, 11) }))?.data;
      await dx(`/items/payment_expenses/${id}`, { method: "PATCH", body: JSON.stringify({ approval: a.id }) });
    }
  };
  await expense("Roof gutter repair", "Harbor Roofing", 1800, "maintenance", 3);
  await expense("Elevator controller replacement", "Summit Elevator Service", 4200, "maintenance", 6);
  await expense("Lobby holiday lighting", "Bright Nights Co.", 650, "other", 1);
  if (overdueCharge && !dry && !(await findOne("money_approvals", { organization: { _eq: t.orgId }, charge: { _eq: overdueCharge }, state: { _eq: "pending" } })))
    await mut("waiver approval on Owen's overdue dues", "POST", "/items/money_approvals", { ...org, kind: "waive", charge: overdueCharge, round: 1, state: "pending", mode: "majority", needed: 2, requested_by: t.adminUserId, excluded: [t.adminUserId], reason: "Owen was travelling; asks to waive the late fee." });

  // ── Published documents, each with a small real PDF ──
  // ── Folders (document categories): find or create by slug; each document is filed in one ──
  const folderIds: Record<string, string> = {};
  for (const name of ["Governing documents", "Financials", "Meetings"]) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const found = await findOne("hoa_document_categories", { organization: { _eq: t.orgId }, slug: { _eq: slug } });
    if (found) {
      // The folder list only shows published folders, so a folder left unpublished is set right here.
      await mut(`hoa_document_categories: ${name} (published)`, "PATCH", `/items/hoa_document_categories/${found.id}`, { status: "published" });
      folderIds[name] = found.id;
    } else {
      folderIds[name] = (await mut(`hoa_document_categories: ${name}`, "POST", "/items/hoa_document_categories", { ...org, name, slug, status: "published" }))?.data?.id ?? "DRY";
    }
  }

  const publishDoc = async (title: string, body: string, folder: string) => {
    const existing = await findOne("hoa_documents", { organization: { _eq: t.orgId }, title: { _eq: title } });
    if (existing) {
      // Filing is re-applied each run, so a document seeded before folders existed gets one.
      await mut(`hoa_documents: file ${title} in ${folder}`, "PATCH", `/items/hoa_documents/${existing.id}`, { document_category: folderIds[folder] });
      return;
    }
    let fileId: string | null = null;
    if (!dry) {
      const form = new FormData();
      form.append("title", `${title} (demo)`);
      form.append("file", new Blob([demoPdf(title, body)], { type: "application/pdf" }), `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
      fileId = (await dx("/files", { method: "POST", body: form }))?.data?.id ?? null;
    }
    await mut(`hoa_documents: ${title}`, "POST", "/items/hoa_documents", { ...org, title, status: "published", date_published: at(-20), document_category: folderIds[folder], ...(fileId ? { file: fileId } : {}) });
  };
  await publishDoc("Bylaws", "Harborview Lofts bylaws (demo copy).", "Governing documents");
  await publishDoc("2026 Operating Budget", "Approved operating budget for the year (demo copy).", "Financials");
  await publishDoc("November Board Minutes", "Minutes of the November board meeting (demo copy).", "Meetings");

  // ── A draft document for the team's queue ──
  await ensure("hoa_documents", "Parking rules (draft)", { status: "draft" });
}

/**
 * A manager with more than one community: Max Manager also works the second demo
 * community (demo-classic), so the per-community load bars have something to
 * compare. Needs the demo manager user from `seedScenario`; if that has not run
 * yet it says so and skips (the next run picks it up). Idempotent.
 */
export const SECOND_COMMUNITY_REQUESTS: ReadonlyArray<{ title: string; type: string; status: string; daysAgo: number }> = [
  { title: "Courtyard fountain not running", type: "maintenance", status: "open", daysAgo: 11 },
  { title: "Noise complaint, unit 12", type: "violation", status: "open", daysAgo: 8 },
  { title: "Parking permit renewal question", type: "question", status: "open", daysAgo: 3 },
  { title: "Fence paint peeling", type: "maintenance", status: "in_progress", daysAgo: 5 },
];

export async function seedManagerSecondCommunity(c: ScenarioCtx, t: { orgId: string; adminUserId: string }): Promise<void> {
  const { dx, findOne, dry, log, now } = c;
  const manager = PERSONAS.find((p) => p.key === "manager")!;
  const email = personaEmail(manager);
  const user = (await dx(`/users${qs({ filter: { email: { _eq: email } }, fields: "id,role", limit: 1 })}`))?.data?.[0];
  if (!user) {
    log(`  Second community for ${email} skipped: the manager user does not exist yet (run the seed again).`);
    return;
  }
  const org = { organization: t.orgId };
  const mut = async (label: string, endpoint: string, body: unknown) => {
    log(`  ${dry ? "(dry) " : ""}${label}`);
    return dry ? { data: { id: "DRY" } } : dx(endpoint, { method: "POST", body: JSON.stringify(body) });
  };
  let member = await findOne("hoa_members", { organization: { _eq: t.orgId }, email: { _eq: email } }, "id");
  if (!member)
    member = (
      await mut(`member ${email} (second community)`, "/items/hoa_members", {
        ...org, user: user.id, role: user.role, first_name: manager.first, last_name: manager.last, email, member_type: null, status: "active",
        is_manager: true, manager_title: "Property Manager",
        manager_permissions: { inquiries: true, violations: true, directory: true, documents: true, communications: true, feedback: true, projects: true, responsibilities: true },
      })
    )?.data;
  const { at } = scenarioDates(now);
  for (const r of SECOND_COMMUNITY_REQUESTS) {
    if (await findOne("hoa_requests", { organization: { _eq: t.orgId }, title: { _eq: r.title } })) continue;
    const created = at(-r.daysAgo, 14);
    const row = (await mut(`hoa_requests: ${r.title}`, "/items/hoa_requests", { ...org, title: r.title, type: r.type, status: r.status, priority: "normal", submitted_by: t.adminUserId }))?.data;
    if (!dry && row?.id) await dx(`/items/hoa_requests/${row.id}`, { method: "PATCH", body: JSON.stringify({ date_created: created }) });
  }
}
