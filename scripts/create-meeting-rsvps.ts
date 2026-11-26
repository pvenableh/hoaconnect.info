/**
 * Creates hoa_meeting_rsvps: a member's answer to "are you coming?" for an
 * upcoming meeting (docs/plan-unified-experience.md §5, owner "RSVP").
 *
 * Not hoa_meeting_attendees: those rows record who actually attended (present,
 * absent, excused, proxy) and feed the minutes. An RSVP is intent, given before
 * the meeting, and changes as often as the member likes.
 *
 * Run with: pnpm run create:meeting-rsvps
 * Idempotent. Needs DIRECTUS_URL + DIRECTUS_STATIC_TOKEN (admin token).
 *
 * Permissions: none for any role. GET and POST /api/org/meetings/[id]/rsvp
 * read and write with the app token after checking the caller is a member of
 * the meeting's community, and set `rsvp_key` ("<meeting>:<member>", unique).
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
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
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

async function createField(collection: string, field: string, fieldConfig: Record<string, any>): Promise<void> {
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
    console.log(`   ✅ Created relation: ${relationConfig.collection}.${relationConfig.field} → ${relationConfig.related_collection}`);
  } catch (error: any) {
    if (
      error.message.includes("already exists") ||
      error.message.includes("already has an associated relationship") ||
      error.message.includes("409")
    ) {
      console.log(`   ⏭️  Relation ${relationConfig.collection}.${relationConfig.field} already exists, skipping...`);
    } else {
      throw error;
    }
  }
}

async function addSystemFields(collection: string): Promise<void> {
  await createField(collection, "user_created", {
    type: "uuid",
    meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true, width: "half" },
  });
  await createRelation({ collection, field: "user_created", related_collection: "directus_users" });
  await createField(collection, "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", display: "datetime", readonly: true, hidden: true, width: "half" },
  });
  await createField(collection, "user_updated", {
    type: "uuid",
    meta: { special: ["user-updated"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true, width: "half" },
  });
  await createRelation({ collection, field: "user_updated", related_collection: "directus_users" });
  await createField(collection, "date_updated", {
    type: "timestamp",
    meta: { special: ["date-updated"], interface: "datetime", display: "datetime", readonly: true, hidden: true, width: "half" },
  });
}


async function main() {
  console.log("\n📁 Creating hoa_meeting_rsvps...");
  const C = "hoa_meeting_rsvps";
  await createCollection(C, { collection: C, icon: "event_available", note: "A member's RSVP to an upcoming meeting", display_template: "{{meeting.title}} · {{response}}" });
  await createField(C, "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: C, field: "organization", related_collection: "hoa_organizations", schema: { on_delete: "CASCADE" } });
  await createField(C, "meeting", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{title}}" } },
  });
  await createRelation({ collection: C, field: "meeting", related_collection: "hoa_meetings", schema: { on_delete: "CASCADE" } });
  await createField(C, "member", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{first_name}} {{last_name}}" } },
  });
  await createRelation({ collection: C, field: "member", related_collection: "hoa_members", schema: { on_delete: "CASCADE" } });
  await createField(C, "response", {
    type: "string",
    schema: { is_nullable: false, default_value: "going" },
    meta: {
      interface: "select-dropdown",
      required: true,
      width: "half",
      options: { choices: [{ text: "Going", value: "going" }, { text: "Maybe", value: "maybe" }, { text: "Not going", value: "not_going" }] },
    },
  });
  await createField(C, "rsvp_key", {
    type: "string",
    schema: { is_nullable: false, is_unique: true },
    meta: { interface: "input", readonly: true, hidden: true, note: "<meeting>:<member>, one RSVP each" },
  });
  await addSystemFields(C);
  console.log("\nDone. Run `pnpm generate:types` next.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
