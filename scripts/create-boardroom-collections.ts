/**
 * Create the Board Room's three collections (Round 2, Phase 6).
 *
 *   · hoa_director_briefings — one saved plan per section: the narrative, the
 *     TL;DR bullets, the money snapshot, and the `plan_id` that links to the
 *     proposed steps. Read back inside the TTL so reopening the Board Room
 *     costs nothing instead of re-billing the wallet for the same answer.
 *   · hoa_director_sessions  — one live meeting. `revision` is the sync clock:
 *     the steps live in `ai_actions`, which is admin-only and therefore cannot
 *     push, so every step decision bumps the session row instead and attendees
 *     re-fetch.
 *   · hoa_director_minutes   — the durable decision record of a finished
 *     meeting: what was briefed, what was proposed, and how each step was
 *     decided. A board keeps minutes; so does this.
 *
 * It also does two small things to collections that already exist:
 *
 *   · adds `ai_actions.session_id` — the plan's shared thread. `plan_id ===
 *     ai_actions.session_id` is how a briefing finds its own steps, and it is a
 *     plain string rather than a relation precisely because a plan id is minted
 *     before any row exists to point at.
 *   · adds "plan" to `ai_transactions.feature`'s dropdown choices, so a Board
 *     Room debit reads as what it is in the admin UI. Metering already writes
 *     the string; this only stops the label showing as raw text.
 *
 * PERMISSIONS: none, deliberately. All three are read and written exclusively
 * through the server's admin client — the same posture `ai_actions` and
 * `ai_notice_history` already take. Nothing in the browser touches them
 * directly, so there is no policy to get wrong. (If a later phase wants live
 * multiplayer push on the session row, that is when a scoped read policy gets
 * added — and Directus's create-rule trap documented in the parity plan applies
 * there, not here.)
 *
 * Run with: pnpm run create:boardroom
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing collections/fields/relations/choices are skipped.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function collectionExists(collection: string): Promise<boolean> {
  try {
    await directusFetch(`/collections/${collection}`);
    return true;
  } catch {
    return false;
  }
}

async function createCollection(collection: string, meta: Record<string, any>): Promise<void> {
  if (await collectionExists(collection)) {
    console.log(`   ⏭️  Collection ${collection} already exists, skipping...`);
    return;
  }
  await directusFetch("/collections", {
    method: "POST",
    body: JSON.stringify({
      collection,
      meta,
      schema: { name: collection },
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
  console.log(`   ✅ Created collection: ${collection}`);
}

async function createField(
  collection: string,
  field: string,
  fieldConfig: Record<string, any>
): Promise<void> {
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    console.log(`   ⏭️  Field ${collection}.${field} already exists, skipping...`);
    return;
  } catch {
    /* create below */
  }
  await directusFetch(`/fields/${collection}`, {
    method: "POST",
    body: JSON.stringify({ field, ...fieldConfig }),
  });
  console.log(`   ✅ Created field: ${collection}.${field}`);
}

async function createRelation(relationConfig: Record<string, any>): Promise<void> {
  try {
    await directusFetch("/relations", { method: "POST", body: JSON.stringify(relationConfig) });
    console.log(
      `   ✅ Created relation: ${relationConfig.collection}.${relationConfig.field} → ${relationConfig.related_collection}`
    );
  } catch (error: any) {
    const m = String(error.message);
    if (
      m.includes("already exists") ||
      m.includes("already has an associated relationship") ||
      m.includes("409")
    ) {
      console.log(
        `   ⏭️  Relation ${relationConfig.collection}.${relationConfig.field} already exists, skipping...`
      );
    } else {
      throw error;
    }
  }
}

/** Tenant isolation — every Board Room row belongs to exactly one community. */
async function addOrgField(collection: string): Promise<void> {
  await createField(collection, "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: {
      interface: "select-dropdown-m2o",
      required: true,
      width: "half",
      display: "related-values",
      display_options: { template: "{{name}}" },
    },
  });
  await createRelation({
    collection,
    field: "organization",
    related_collection: "hoa_organizations",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });
}

async function addUserField(collection: string, field: string, note: string): Promise<void> {
  await createField(collection, field, {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", display: "user", width: "half", note },
  });
  await createRelation({
    collection,
    field,
    related_collection: "directus_users",
    schema: { on_delete: "SET NULL" },
  });
}

/** The scope a briefing / session / minutes row is about. Shared by all three. */
async function addScopeFields(collection: string): Promise<void> {
  await createField(collection, "scope_type", {
    type: "string",
    schema: { default_value: "org" },
    meta: {
      interface: "select-dropdown",
      width: "half",
      options: {
        choices: [
          { text: "Whole association", value: "org" },
          { text: "One record", value: "entity" },
        ],
      },
    },
  });
  await createField(collection, "entity_type", {
    type: "string",
    meta: { interface: "input", width: "half", note: "Singular: request | member | project | …" },
  });
  await createField(collection, "entity_id", {
    type: "string",
    meta: { interface: "input", width: "half" },
  });
  await createField(collection, "subject", {
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note: "Agenda subject: requests | money | projects | community | vendors | meetings | operations.",
    },
  });
  await createField(collection, "topic", {
    type: "string",
    meta: { interface: "input", note: "Free-text steer the person typed, if any." },
  });
  await createField(collection, "plan_id", {
    type: "string",
    schema: { is_indexed: true },
    meta: {
      interface: "input",
      width: "half",
      note: "The plan's shared thread — equals ai_actions.session_id for its steps.",
    },
  });
}

async function addCreatedStamp(collection: string, hidden = true): Promise<void> {
  await createField(collection, "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden },
  });
}

async function briefings(): Promise<void> {
  const C = "hoa_director_briefings";
  console.log(`\n🧠 ${C}`);
  await createCollection(C, {
    icon: "psychology",
    note: "One saved Board Room briefing per section — reopened inside the TTL instead of re-billing the model.",
    display_template: "{{subject}} — {{cache_key}}",
    sort_field: "date_created",
  });
  await addOrgField(C);
  await addUserField(C, "user", "Who asked for this briefing.");
  await addScopeFields(C);

  // The cache key. Indexed because every Board Room open queries on it, and
  // derived by ONE shared function (server/utils/director-briefings.ts) so the
  // writer and the reader cannot drift into disagreeing about what "the same
  // section" means.
  await createField(C, "cache_key", {
    type: "string",
    schema: { is_indexed: true },
    meta: {
      interface: "input",
      readonly: true,
      note: "scope::subject::topic — derived by directorBriefingCacheKey(); do not hand-edit.",
    },
  });

  await createField(C, "intro", {
    type: "text",
    meta: { interface: "input-multiline", note: "The briefing prose, TL;DR line already split off." },
  });
  await createField(C, "points", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, note: "TL;DR bullets, in order." },
  });
  await createField(C, "money", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, note: "Money-mode snapshot, when the subject was money." },
  });
  await createField(C, "agenda", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, note: "Compact agenda the plan was grounded in." },
  });
  await createField(C, "step_count", {
    type: "integer",
    schema: { default_value: 0 },
    meta: { interface: "input", width: "half", note: "How many steps this plan proposed." },
  });
  await addCreatedStamp(C, false);
}

async function sessions(): Promise<void> {
  const C = "hoa_director_sessions";
  console.log(`\n🪑 ${C}`);
  await createCollection(C, {
    icon: "groups",
    note: "One live Board Room meeting. `revision` is the sync clock — ai_actions is admin-only and cannot push.",
    display_template: "{{title}} — {{status}}",
    archive_field: "status",
    archive_value: "ended",
    sort_field: "date_created",
  });
  await addOrgField(C);
  await addUserField(C, "host", "Who convened the meeting.");
  await addUserField(C, "presenter", "Whose screen everyone is following.");
  await addScopeFields(C);

  await createField(C, "title", {
    type: "string",
    meta: { interface: "input", note: "What this meeting is called." },
  });
  await createField(C, "status", {
    type: "string",
    schema: { is_nullable: false, default_value: "live" },
    meta: {
      interface: "select-dropdown",
      required: true,
      width: "half",
      options: {
        choices: [
          { text: "Live", value: "live" },
          { text: "Ended", value: "ended" },
        ],
      },
      display: "labels",
    },
  });
  await createField(C, "current_slide", {
    type: "integer",
    schema: { default_value: 0 },
    meta: { interface: "input", width: "half", note: "Which step the presenter is on." },
  });

  // The sync clock. Every step decision bumps this; attendees watching the row
  // re-fetch the steps they cannot be pushed directly.
  await createField(C, "revision", {
    type: "integer",
    schema: { is_nullable: false, default_value: 0 },
    meta: {
      interface: "input",
      width: "half",
      readonly: true,
      note: "Bumped on every step decision — the signal to re-fetch ai_actions.",
    },
  });
  await createField(C, "last_activity", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, note: "What caused the last revision bump." },
  });

  // Attendance is a small, bounded list that only ever matters alongside its
  // session, so it rides on the row rather than earning a fourth collection.
  await createField(C, "attendees", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, note: "[{ userId, name, role, status, lastSeen }]" },
  });
  await createField(C, "view_only", {
    type: "boolean",
    schema: { default_value: false },
    meta: { interface: "boolean", width: "half", note: "Attendees follow along but cannot decide steps." },
  });

  await addCreatedStamp(C, false);
  await createField(C, "date_updated", {
    type: "timestamp",
    meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true },
  });
}

async function minutes(): Promise<void> {
  const C = "hoa_director_minutes";
  console.log(`\n📜 ${C}`);
  await createCollection(C, {
    icon: "history_edu",
    note: "The durable decision record of a finished Board Room meeting — what was briefed, proposed, and decided.",
    display_template: "{{title}} — {{status}}",
    sort_field: "date_created",
  });
  await addOrgField(C);
  await addUserField(C, "author", "Who recorded these minutes.");
  await addScopeFields(C);

  await createField(C, "session", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", display: "related-values", display_options: { template: "{{title}}" } },
  });
  await createRelation({
    collection: C,
    field: "session",
    related_collection: "hoa_director_sessions",
    schema: { on_delete: "SET NULL" },
  });

  await createField(C, "title", { type: "string", meta: { interface: "input" } });
  await createField(C, "summary", {
    type: "text",
    meta: { interface: "input-multiline", note: "One-paragraph recap." },
  });
  await createField(C, "intro", {
    type: "text",
    meta: { interface: "input-multiline", note: "The briefing as it stood when the meeting ended." },
  });
  await createField(C, "points", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, note: "TL;DR bullets." },
  });
  await createField(C, "money", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" } },
  });
  await createField(C, "steps", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, note: "Each proposed step and how it was decided." },
  });
  await createField(C, "captured", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, note: "Action items captured in the room." },
  });
  await createField(C, "qa", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, note: "The shared question thread." },
  });
  await createField(C, "stats", {
    type: "json",
    meta: { interface: "input-code", options: { language: "json" }, note: "{ done, skipped, failed, open, total, captured }" },
  });
  await createField(C, "status", {
    type: "string",
    schema: { is_nullable: false, default_value: "recorded" },
    meta: {
      interface: "select-dropdown",
      required: true,
      width: "half",
      options: {
        choices: [
          { text: "Recorded", value: "recorded" },
          { text: "Shared", value: "shared" },
        ],
      },
      display: "labels",
    },
  });

  await addCreatedStamp(C, false);
}

/**
 * `ai_actions.session_id` — the thread a plan's steps share. A plain string,
 * not a relation: the plan id is minted before the briefing row exists, and the
 * steps must carry it from the moment they are proposed.
 */
async function aiActionsSessionId(): Promise<void> {
  console.log("\n🔗 ai_actions.session_id");
  await createField("ai_actions", "session_id", {
    type: "string",
    schema: { is_indexed: true },
    meta: {
      interface: "input",
      width: "half",
      note: "Board Room plan id — every step of one plan shares it (plan_id).",
    },
  });
}

/**
 * Teach `ai_transactions.feature` the word "plan". The column is a plain string
 * and the metering already writes it; without the choice the admin UI shows a
 * bare value where every other feature shows a label.
 */
async function aiTransactionsPlanFeature(): Promise<void> {
  console.log("\n💳 ai_transactions.feature += plan");
  let field: any;
  try {
    field = await directusFetch("/fields/ai_transactions/feature");
  } catch {
    console.log("   ⏭️  ai_transactions.feature not found — skipping (wallet script not run?).");
    return;
  }
  const meta = field?.data?.meta ?? {};
  const choices: any[] = meta?.options?.choices ?? [];
  if (choices.some((c) => c?.value === "plan")) {
    console.log("   ⏭️  Choice already present, skipping...");
    return;
  }
  await directusFetch("/fields/ai_transactions/feature", {
    method: "PATCH",
    body: JSON.stringify({
      meta: {
        ...meta,
        options: { ...(meta.options ?? {}), choices: [...choices, { text: "Plan", value: "plan" }] },
      },
    }),
  });
  console.log("   ✅ Added choice: plan");
}

async function main() {
  console.log("🚀 Creating the Board Room collections...");

  await briefings();
  await sessions();
  await minutes();
  await aiActionsSessionId();
  await aiTransactionsPlanFeature();

  console.log("\n✅ Done. Next: pnpm generate:types");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
