/**
 * The email send queue (Earnest parity round 3, Phase 3b) — ONE idempotent
 * script for docs/spec-email-send-queue.md §2.2:
 *
 *   hoa_email_recipients.status          + queued | claimed | suppressed | unknown
 *                                          (pending / delivered / bounced stay for old rows)
 *   hoa_email_recipients.kind            member | copy
 *   hoa_email_recipients.run_key         string(32) — the occurrence
 *   hoa_email_recipients.position        integer — send order
 *   hoa_email_recipients.dedupe_key      string(160), UNIQUE — one row per person per occurrence
 *   hoa_email_recipients.claim           string(36) — the run's token; hidden
 *   hoa_email_recipients.claimed_at      timestamp
 *   hoa_email_recipients.member_fields   json — the merge snapshot (balances); hidden
 *   hoa_email_recipients.copies          json — { cc, bcc } on a small send's member rows
 *   hoa_email_recipients.suppressed_reason bounced | opted_out | bounced_mid_send | opted_out_mid_send
 *   hoa_email_recipients.delivery_status delivered | bounced (the webhook's column)
 *   hoa_emails.total_recipients / total_sent / total_failed / total_suppressed / total_unknown
 *   hoa_emails.send_run_key / send_started_at / send_finished_at / send_errors / send_last_error
 *   hoa_email_send_leases                the per-email mutex: `email` UNIQUE
 *
 * And one permission change, because the merge snapshot holds balances: every
 * non-admin-access policy's READ permission on hoa_email_recipients is narrowed
 * to "every field except `claim` and `member_fields`", the way
 * add-email-compliance-fields.ts narrows hoa_members. Fail closed: a field added
 * later must be added to those policies explicitly. Nobody but admin-access
 * policies reads hoa_email_send_leases (no permission rows are created).
 *
 * Until this runs, `emailQueueSchema()` says so and `send.post.ts` /
 * `sendEmailJob` keep today's synchronous send (core/server/utils/email-send-queue.ts).
 *
 * Run with: pnpm add:email-send-queue   (then `pnpm generate:types` — expect no
 * diff on these fields; they were hand-added to core/types/directus.ts with
 * these exact notes)
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL and/or DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function api(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
  try {
    await api(`/fields/${collection}/${field}`);
    return true;
  } catch {
    return false;
  }
}

async function ensureField(collection: string, def: Record<string, any>): Promise<void> {
  if (await fieldExists(collection, def.field)) {
    console.log(`   ⏭️  ${collection}.${def.field} exists`);
    return;
  }
  await api(`/fields/${collection}`, { method: "POST", body: JSON.stringify(def) });
  console.log(`   ✅ ${collection}.${def.field}`);
}

const choices = (pairs: Array<[string, string]>) => pairs.map(([value, text]) => ({ text, value }));

// ── hoa_email_recipients ─────────────────────────────────────────────────────

const RECIPIENT_STATUS_CHOICES = choices([
  ["queued", "Queued"],
  ["claimed", "Claimed"],
  ["sent", "Sent (accepted)"],
  ["failed", "Failed"],
  ["suppressed", "Held back"],
  ["unknown", "Unknown"],
  // Legacy — written before Phase 3b; nothing writes them now.
  ["pending", "Pending (legacy)"],
  ["delivered", "Delivered (legacy)"],
  ["bounced", "Bounced (legacy)"],
]);

const RECIPIENT_FIELDS: Array<Record<string, any>> = [
  {
    field: "kind",
    type: "string",
    schema: { is_nullable: true, max_length: 8 },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: { choices: choices([["member", "Member"], ["copy", "CC/BCC copy"]]) },
      note: "member: one personalised message to one member. copy: a standalone CC/BCC copy of a large send (no member).",
    },
  },
  {
    field: "run_key",
    type: "string",
    schema: { is_nullable: true, max_length: 32 },
    meta: { interface: "input", readonly: true, width: "half", note: "Which occurrence of the email this row belongs to (m:<enqueue time> or s:<scheduled time>)." },
  },
  {
    field: "position",
    type: "integer",
    schema: { is_nullable: true },
    meta: { interface: "input", readonly: true, width: "half", note: "Send order within the occurrence." },
  },
  {
    field: "dedupe_key",
    type: "string",
    // Unique: one row per person per occurrence, so a snapshot written twice is
    // refused instead of mailing someone twice.
    schema: { is_nullable: true, is_unique: true, max_length: 160 },
    meta: { interface: "input", hidden: true, readonly: true, width: "full", note: "email:run_key:m:member or email:run_key:a:address — unique, so nobody is queued twice for one occurrence." },
  },
  {
    field: "claim",
    type: "string",
    schema: { is_nullable: true, max_length: 36 },
    meta: { interface: "input", hidden: true, readonly: true, width: "half", note: "The sending run's token while the row is claimed." },
  },
  {
    field: "claimed_at",
    type: "timestamp",
    schema: { is_nullable: true },
    meta: { interface: "datetime", readonly: true, width: "half", note: "When a run claimed the row." },
  },
  {
    field: "member_fields",
    type: "json",
    schema: { is_nullable: true },
    meta: {
      interface: "input-code",
      options: { language: "json" },
      special: ["cast-json"],
      hidden: true,
      readonly: true,
      width: "full",
      note: "The merge values at enqueue (name, unit, balance…). Admin-only: non-admin policies cannot read it.",
    },
  },
  {
    field: "copies",
    type: "json",
    schema: { is_nullable: true },
    meta: { interface: "input-code", options: { language: "json" }, special: ["cast-json"], readonly: true, width: "full", note: "{ cc, bcc } carried on this message (small sends only)." },
  },
  {
    field: "suppressed_reason",
    type: "string",
    schema: { is_nullable: true, max_length: 24 },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      readonly: true,
      width: "half",
      options: {
        choices: choices([
          ["bounced", "Bounced"],
          ["opted_out", "Opted out"],
          ["bounced_mid_send", "Bounced during the send"],
          ["opted_out_mid_send", "Opted out during the send"],
        ]),
      },
      note: "Why the row was held back.",
    },
  },
  {
    field: "delivery_status",
    type: "string",
    schema: { is_nullable: true, max_length: 16 },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      readonly: true,
      width: "half",
      options: { choices: choices([["delivered", "Delivered"], ["bounced", "Bounced"]]) },
      note: "SendGrid's delivery event for this message (the webhook writes it).",
    },
  },
];

const SENSITIVE_RECIPIENT_FIELDS = ["claim", "member_fields"];

// ── hoa_emails ───────────────────────────────────────────────────────────────

const int = (field: string, note: string) => ({
  field,
  type: "integer",
  schema: { is_nullable: true },
  meta: { interface: "input", readonly: true, width: "half", note },
});
const ts = (field: string, note: string) => ({
  field,
  type: "timestamp",
  schema: { is_nullable: true },
  meta: { interface: "datetime", readonly: true, width: "half", note },
});

const EMAIL_FIELDS: Array<Record<string, any>> = [
  int("total_recipients", "People this occurrence will be sent to (members + CC/BCC copies, not held back). Empty while getting ready."),
  int("total_sent", "Accepted by SendGrid — derived from the recipient rows."),
  int("total_failed", "Refused or unrenderable — derived from the recipient rows."),
  int("total_suppressed", "Held back (bounced or opted out) — derived from the recipient rows."),
  int("total_unknown", "Its run stopped mid-send; may or may not have gone. Never resent automatically."),
  {
    field: "send_run_key",
    type: "string",
    schema: { is_nullable: true, max_length: 32 },
    meta: { interface: "input", readonly: true, width: "half", note: "The occurrence in flight (or last sent)." },
  },
  ts("send_started_at", "When this occurrence was queued."),
  ts("send_finished_at", "When this occurrence finished."),
  {
    field: "send_errors",
    type: "json",
    schema: { is_nullable: true },
    meta: { interface: "input-code", options: { language: "json" }, special: ["cast-json"], readonly: true, width: "full", note: "The first 20 failures of the occurrence, as \"address: reason\"." },
  },
  {
    field: "send_last_error",
    type: "text",
    schema: { is_nullable: true },
    meta: { interface: "input-multiline", readonly: true, width: "full", note: "What stopped the last run before it sent anything; cleared by the next chunk that sends." },
  },
];

// ── hoa_email_send_leases ────────────────────────────────────────────────────

const LEASES = "hoa_email_send_leases";

async function collectionExists(collection: string): Promise<boolean> {
  try {
    await api(`/collections/${collection}`);
    return true;
  } catch {
    return false;
  }
}

async function ensureLeaseCollection(): Promise<void> {
  if (await collectionExists(LEASES)) {
    console.log(`   ⏭️  ${LEASES} exists`);
  } else {
    await api("/collections", {
      method: "POST",
      body: JSON.stringify({
        collection: LEASES,
        meta: {
          icon: "lock_clock",
          hidden: true,
          note: "The send queue's per-email mutex (Phase 3b). One row per email while a run prepares or sends it; `email` is unique, so exactly one run can hold it.",
        },
        schema: { name: LEASES },
        fields: [
          {
            field: "id",
            type: "uuid",
            meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] },
            schema: { is_primary_key: true, has_auto_increment: false },
          },
        ],
      }),
    });
    console.log(`   ✅ ${LEASES}`);
  }

  await ensureField(LEASES, {
    field: "email",
    type: "uuid",
    // THE mutex: Directus has no atomic conditional update, but a unique index
    // on insert is atomic — exactly one of two racing inserts succeeds.
    schema: { is_nullable: false, is_unique: true },
    meta: { interface: "select-dropdown-m2o", special: ["m2o"], width: "half", note: "The email this lease locks. Unique." },
  });
  try {
    await api("/relations", {
      method: "POST",
      body: JSON.stringify({ collection: LEASES, field: "email", related_collection: "hoa_emails", schema: { on_delete: "CASCADE" } }),
    });
    console.log(`   ✅ ${LEASES}.email → hoa_emails`);
  } catch (e: any) {
    if (/already|409/.test(e.message)) console.log(`   ⏭️  ${LEASES}.email relation exists`);
    else throw e;
  }
  await ensureField(LEASES, {
    field: "token",
    type: "string",
    schema: { is_nullable: false, max_length: 36 },
    meta: { interface: "input", readonly: true, width: "half", note: "The holding run's UUID." },
  });
  await ensureField(LEASES, {
    field: "purpose",
    type: "string",
    schema: { is_nullable: true, max_length: 8 },
    meta: { interface: "select-dropdown", display: "labels", readonly: true, width: "half", options: { choices: choices([["prepare", "Prepare"], ["send", "Send"]]) } },
  });
  await ensureField(LEASES, {
    field: "worker",
    type: "string",
    schema: { is_nullable: true, max_length: 8 },
    meta: { interface: "select-dropdown", display: "labels", readonly: true, width: "half", options: { choices: choices([["inline", "Inline"], ["cron", "Cron"], ["manual", "Manual"]]) } },
  });
  await ensureField(LEASES, {
    field: "started_at",
    type: "timestamp",
    schema: { is_nullable: false },
    meta: { interface: "datetime", readonly: true, width: "half", note: "A lease older than 3 minutes belongs to a dead run and may be broken." },
  });
}

// ── status choices + permissions ─────────────────────────────────────────────

async function extendRecipientStatus(): Promise<void> {
  const field = (await api("/fields/hoa_email_recipients/status"))?.data;
  const current: Array<{ value: string }> = field?.meta?.options?.choices || [];
  const have = new Set(current.map((c) => c.value));
  if (RECIPIENT_STATUS_CHOICES.every((c) => have.has(c.value))) {
    console.log("   ⏭️  status already has the queue's values");
    return;
  }
  await api("/fields/hoa_email_recipients/status", {
    method: "PATCH",
    body: JSON.stringify({
      meta: {
        options: { ...(field?.meta?.options || {}), choices: RECIPIENT_STATUS_CHOICES },
        note: "The send queue's state: queued → claimed → sent | failed | suppressed | unknown. Delivery events live in delivery_status.",
      },
    }),
  });
  console.log("   ✅ status: + queued, claimed, suppressed, unknown");
}

async function narrowRecipientReadPermissions(): Promise<void> {
  const fields = ((await api("/fields/hoa_email_recipients"))?.data || []).map((f: any) => f.field as string);
  const keep = fields.filter((f: string) => !SENSITIVE_RECIPIENT_FIELDS.includes(f));
  const perms =
    (
      await api(
        "/permissions?filter[collection][_eq]=hoa_email_recipients&filter[action][_eq]=read&fields=id,fields,policy.name,policy.admin_access&limit=-1"
      )
    )?.data || [];

  for (const p of perms) {
    const name = p.policy?.name || "(no policy)";
    if (p.policy?.admin_access) {
      console.log(`   ⏭️  ${name}: admin access, untouched`);
      continue;
    }
    const current: string[] = Array.isArray(p.fields) ? p.fields : [];
    const next = current.includes("*") ? keep : current.filter((f) => !SENSITIVE_RECIPIENT_FIELDS.includes(f));
    const same = next.length === current.length && next.every((f, i) => f === current[i]);
    if (same) {
      console.log(`   ⏭️  ${name}: already excludes claim and member_fields`);
      continue;
    }
    await api(`/permissions/${p.id}`, { method: "PATCH", body: JSON.stringify({ fields: next }) });
    console.log(`   ✅ ${name}: read narrowed to ${next.length} fields (was ${current.includes("*") ? "*" : current.length})`);
  }
}

async function main() {
  console.log("📬 Email send queue (Phase 3b)\n");

  console.log("hoa_email_recipients:");
  await extendRecipientStatus();
  for (const def of RECIPIENT_FIELDS) await ensureField("hoa_email_recipients", def);

  console.log("\nhoa_emails:");
  for (const def of EMAIL_FIELDS) await ensureField("hoa_emails", def);

  console.log(`\n${LEASES}:`);
  await ensureLeaseCollection();

  console.log("\nhoa_email_recipients read permissions (non-admin policies):");
  await narrowRecipientReadPermissions();

  console.log("\n✅ Done. Run `pnpm generate:types` to refresh Directus types.");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
