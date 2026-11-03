/**
 * The reminder engine's schema (Earnest parity round 3, Phase 5a) — ONE
 * idempotent script:
 *
 *   hoa_reminder_log                  one row per reminder per recipient
 *     organization                    m2o hoa_organizations (cascade)
 *     rule                            dues | meeting | request | violation | poll | coverage
 *     stage                           the rule's stage: before | due | overdue | week | day |
 *                                     hour | status | stale | opened | closing | closed | expired
 *                                     (not `offset`: a reserved word, and a REST query param)
 *     reminder_key                    string(255), UNIQUE — `<rule>:<entity>:<stage>@<anchor>:<user>`.
 *                                     The tick INSERTS this row before it sends: the unique
 *                                     index, not any read, is what stops two overlapping
 *                                     ticks sending one reminder twice (a Directus
 *                                     filter-update is read-then-write, so it can't be the
 *                                     claim; an insert that loses gets RECORD_NOT_UNIQUE).
 *     recipient                       m2o directus_users (set null)
 *     entity_collection / entity_id   what the reminder is about
 *     channels                        what it asked for: "bell,push,email", "push", "bell"
 *     result                          claimed → sent | failed (a crash leaves `claimed`:
 *                                     missed, never doubled)
 *     detail                          the counts, or the error
 *     sent_at                         when the send returned
 *     date_created                    the claim
 *   hoa_organizations.timezone        string(64), IANA, default America/New_York — what the
 *                                     digest and billing workers already used for everyone
 *                                     (DIGEST_TZ / BILLING_TZ), so no org's times move
 *   block_settings.reminders          json — `organization.settings.reminders`, the shape in
 *                                     core/shared/reminders/settings.ts. Every rule is off
 *                                     until the board turns it on (Phase 5b's Settings →
 *                                     Reminders, which is also where it approves the copy).
 *
 * Until this runs, `reminderSchema()` says no and GET/POST /api/reminders/run
 * answers `{ provisioned: false }`; the digest keeps New York.
 *
 * No permission rows: only admin-access policies read the log (the tick and
 * 5b's routes use the server's admin client).
 *
 * Run with: pnpm create:reminder-log   (then `pnpm generate:types` — expect no
 * diff on these fields; they were hand-added to core/types/directus.ts)
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

async function ensureRelation(collection: string, field: string, related: string, onDelete: "CASCADE" | "SET NULL"): Promise<void> {
  try {
    await api("/relations", {
      method: "POST",
      body: JSON.stringify({ collection, field, related_collection: related, schema: { on_delete: onDelete } }),
    });
    console.log(`   ✅ ${collection}.${field} → ${related}`);
  } catch (e: any) {
    if (/already|409|exists/i.test(e.message)) console.log(`   ⏭️  ${collection}.${field} relation exists`);
    else throw e;
  }
}

async function collectionExists(collection: string): Promise<boolean> {
  try {
    await api(`/collections/${collection}`);
    return true;
  } catch {
    return false;
  }
}

const choices = (pairs: Array<[string, string]>) => pairs.map(([value, text]) => ({ text, value }));

// ── hoa_reminder_log ─────────────────────────────────────────────────────────

const LOG = "hoa_reminder_log";

const RULE_CHOICES = choices([
  ["dues", "Dues"],
  ["meeting", "Meeting"],
  ["request", "Request"],
  ["violation", "Violation"],
  ["poll", "Poll"],
  ["coverage", "Vendor coverage"],
]);

const RESULT_CHOICES = choices([
  ["claimed", "Claimed (not sent yet)"],
  ["sent", "Sent"],
  ["failed", "Failed"],
]);

const LOG_FIELDS: Record<string, any>[] = [
  {
    field: "organization",
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", special: ["m2o"], width: "half", options: { template: "{{name}}" } },
  },
  {
    field: "rule",
    type: "string",
    schema: { is_nullable: false, max_length: 16 },
    meta: { interface: "select-dropdown", options: { choices: RULE_CHOICES }, display: "labels", width: "half" },
  },
  {
    field: "stage",
    type: "string",
    schema: { is_nullable: true, max_length: 16 },
    meta: { interface: "input", width: "half", note: "The rule's stage: before, due, overdue, week, day, hour, status, stale, opened, closing, closed, expired." },
  },
  {
    field: "reminder_key",
    type: "string",
    // THE claim: a unique index on insert is atomic — of two racing ticks,
    // exactly one insert succeeds and only that one sends.
    schema: { is_nullable: false, is_unique: true, max_length: 255 },
    meta: {
      interface: "input",
      readonly: true,
      width: "full",
      note: "<rule>:<entity>:<stage>@<anchor>:<user>. UNIQUE — written BEFORE the send, so a second tick's insert is refused (RECORD_NOT_UNIQUE) rather than sent.",
    },
  },
  {
    field: "recipient",
    type: "uuid",
    schema: { is_nullable: true },
    meta: { interface: "select-dropdown-m2o", special: ["m2o"], width: "half", options: { template: "{{first_name}} {{last_name}}" } },
  },
  {
    field: "entity_collection",
    type: "string",
    schema: { is_nullable: true, max_length: 64 },
    meta: { interface: "input", width: "half" },
  },
  {
    field: "entity_id",
    type: "string",
    schema: { is_nullable: true, max_length: 64 },
    meta: { interface: "input", width: "half" },
  },
  {
    field: "channels",
    type: "string",
    schema: { is_nullable: true, max_length: 32 },
    meta: { interface: "input", width: "half", note: "What the reminder asked for (bell,push,email); each member's preferences decide what they got." },
  },
  {
    field: "result",
    type: "string",
    schema: { is_nullable: false, max_length: 16, default_value: "claimed" },
    meta: { interface: "select-dropdown", options: { choices: RESULT_CHOICES }, display: "labels", width: "half" },
  },
  {
    field: "detail",
    type: "text",
    schema: { is_nullable: true },
    meta: { interface: "input-multiline", width: "full", note: "The channel counts, or the error." },
  },
  {
    field: "sent_at",
    type: "timestamp",
    schema: { is_nullable: true },
    meta: { interface: "datetime", width: "half" },
  },
  {
    field: "date_created",
    type: "timestamp",
    schema: { is_nullable: true },
    meta: { interface: "datetime", special: ["date-created"], readonly: true, width: "half", note: "The claim." },
  },
];

async function ensureLogCollection(): Promise<void> {
  if (await collectionExists(LOG)) {
    console.log(`   ⏭️  ${LOG} exists`);
  } else {
    await api("/collections", {
      method: "POST",
      body: JSON.stringify({
        collection: LOG,
        meta: {
          icon: "notifications_active",
          hidden: false,
          display_template: "{{reminder_key}}",
          note: "Every reminder the engine sent (Phase 5a). One row per reminder per person; `reminder_key` is unique, so a reminder is sent at most once.",
          sort_field: null,
        },
        schema: { name: LOG },
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
    console.log(`   ✅ ${LOG}`);
  }
  for (const def of LOG_FIELDS) await ensureField(LOG, def);
  await ensureRelation(LOG, "organization", "hoa_organizations", "CASCADE");
  await ensureRelation(LOG, "recipient", "directus_users", "SET NULL");
}

// ── hoa_organizations.timezone, block_settings.reminders ────────────────────

const US_ZONES = choices([
  ["America/New_York", "Eastern (New York)"],
  ["America/Chicago", "Central (Chicago)"],
  ["America/Denver", "Mountain (Denver)"],
  ["America/Phoenix", "Mountain, no DST (Phoenix)"],
  ["America/Los_Angeles", "Pacific (Los Angeles)"],
  ["America/Anchorage", "Alaska (Anchorage)"],
  ["Pacific/Honolulu", "Hawaii (Honolulu)"],
  ["America/Puerto_Rico", "Atlantic (Puerto Rico)"],
]);

const ORG_TIMEZONE = {
  field: "timezone",
  type: "string",
  // Postgres fills existing rows with the default when the column is added.
  schema: { is_nullable: true, max_length: 64, default_value: "America/New_York" },
  meta: {
    interface: "select-dropdown",
    options: { choices: US_ZONES, allowOther: true },
    width: "half",
    note: "The community's time zone (IANA). Reminders fire on its wall clock and the digest goes out at each member's hour in it.",
  },
};

const SETTINGS_REMINDERS = {
  field: "reminders",
  type: "json",
  schema: { is_nullable: true },
  meta: {
    interface: "input-code",
    options: { language: "json" },
    special: ["cast-json"],
    width: "full",
    note: "Reminder settings (core/shared/reminders/settings.ts): send_hour, and per rule enabled / stages / days / tenants / approved_at. Every rule is off until turned on.",
  },
};

async function verifyUnique(): Promise<void> {
  const f = (await api(`/fields/${LOG}/reminder_key`))?.data;
  if (f?.schema?.is_unique === true) console.log("   ✅ reminder_key is UNIQUE");
  else {
    console.error("   ❌ reminder_key is NOT unique — the tick would double-send. Fix the column before enabling any rule.");
    process.exitCode = 1;
  }
}

async function main() {
  console.log("⏰ Reminder engine (Phase 5a)\n");

  console.log(`${LOG}:`);
  await ensureLogCollection();
  await verifyUnique();

  console.log("\nhoa_organizations:");
  await ensureField("hoa_organizations", ORG_TIMEZONE);

  console.log("\nblock_settings:");
  await ensureField("block_settings", SETTINGS_REMINDERS);

  console.log("\n✅ Done. Run `pnpm generate:types` to refresh Directus types.");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
