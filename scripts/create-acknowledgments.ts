/**
 * Creates hoa_acknowledgments and the two acknowledgment fields on
 * hoa_announcements (docs/scope-notices-and-forms.md, build step 1).
 *
 * Run with: pnpm run create:acknowledgments
 * Idempotent. Needs DIRECTUS_URL + DIRECTUS_STATIC_TOKEN (admin token).
 *
 * Permissions (every rule is scoped to the person's own organization):
 *   HOA Member: create and read ONLY their own rows (member.user = $CURRENT_USER).
 *   HOA Admin:  read every row of their organization. No create, update or delete.
 * Board members use the HOA Member policy, so their read-all list goes through a
 * server route that checks the board hat for the same organization (step 2).
 *
 * Uniqueness: Directus's fields API cannot make a composite unique, so `ack_key`
 * ("<announcement>:<member>", set by the step 2 route) carries a unique index.
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

interface Role { id: string; name: string; }
interface Policy { id: string; name: string; }

async function getRoles(): Promise<Role[]> {
  const response = await directusFetch(
    `/roles?filter=${JSON.stringify({ name: { _in: ["HOA Admin", "HOA Member"] } })}&fields=id,name`
  );
  return response.data as Role[];
}

async function getRolePolicy(roleId: string, roleName: string): Promise<Policy | null> {
  try {
    const response = await directusFetch(
      `/access?filter=${JSON.stringify({ role: { _eq: roleId } })}&fields=id,policy&limit=1`
    );
    if (response.data && response.data.length > 0) {
      const policyId =
        typeof response.data[0].policy === "string" ? response.data[0].policy : response.data[0].policy?.id;
      if (policyId) return { id: policyId, name: roleName };
    }
    return null;
  } catch {
    return null;
  }
}

async function postPermission(policy: string, collection: string, action: string, config: any): Promise<void> {
  // Upsert, don't skip: a row that already exists may hold a STALE filter (this
  // script shipped `$CURRENT_USER.organization` once, which 500s every read —
  // see the orgFilter note above). Skipping on conflict left prod broken and
  // un-repairable by re-running, so patch the existing row instead.
  const existing = await directusFetch(
    `/permissions?filter[policy][_eq]=${policy}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&fields=id&limit=1`
  );
  const current = existing?.data?.[0];

  try {
    if (current) {
      await directusFetch(`/permissions/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify(config),
      });
      console.log(`      ♻️  ${action} (updated)`);
      return;
    }
    await directusFetch("/permissions", {
      method: "POST",
      body: JSON.stringify({ policy, collection, action, ...config }),
    });
    console.log(`      ✅ ${action}`);
  } catch (error: any) {
    console.log(`      ❌ ${action}: ${error.message}`);
  }
}


async function createAnnouncementFields(): Promise<void> {
  console.log("\n📁 hoa_announcements fields...");
  await createField("hoa_announcements", "requires_acknowledgment", {
    type: "boolean",
    schema: { default_value: false, is_nullable: false },
    meta: { interface: "boolean", special: ["cast-boolean"], width: "half", sort: 20, note: "Members must confirm they have seen this notice." },
  });
  await createField("hoa_announcements", "ack_due", {
    type: "date",
    meta: { interface: "datetime", width: "half", sort: 21, note: "Acknowledge by this date (reminders key off it)." },
  });
}

async function createAcknowledgments(): Promise<void> {
  console.log("\n📁 Creating hoa_acknowledgments...");
  await createCollection("hoa_acknowledgments", {
    collection: "hoa_acknowledgments",
    icon: "task_alt",
    note: "One row per member who acknowledged a notice",
    display_template: "{{announcement.title}}",
  });
  await createField("hoa_acknowledgments", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: "hoa_acknowledgments", field: "organization", related_collection: "hoa_organizations", schema: { on_delete: "CASCADE" } });
  await createField("hoa_acknowledgments", "announcement", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{title}}" } },
  });
  await createRelation({ collection: "hoa_acknowledgments", field: "announcement", related_collection: "hoa_announcements", schema: { on_delete: "CASCADE" } });
  await createField("hoa_acknowledgments", "member", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{first_name}} {{last_name}}" } },
  });
  await createRelation({ collection: "hoa_acknowledgments", field: "member", related_collection: "hoa_members", schema: { on_delete: "CASCADE" } });
  await createField("hoa_acknowledgments", "acknowledged_at", {
    type: "timestamp",
    schema: { is_nullable: false },
    meta: { interface: "datetime", display: "datetime", required: true, width: "half" },
  });
  await createField("hoa_acknowledgments", "method", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown", display: "labels", required: true, width: "half", options: { choices: [{ text: "Swipe", value: "swipe" }, { text: "Button", value: "button" }] } },
  });
  await createField("hoa_acknowledgments", "ack_key", {
    type: "string",
    schema: { is_nullable: false, is_unique: true },
    meta: { interface: "input", required: true, hidden: true, width: "half", note: "<announcement>:<member>. Unique: one acknowledgment per member per notice." },
  });
  await addSystemFields("hoa_acknowledgments");
}

async function setupPermissions(): Promise<void> {
  console.log("\n🔐 Permissions...");
  const roles = await getRoles();
  const adminRole = roles.find((r) => r.name === "HOA Admin");
  const memberRole = roles.find((r) => r.name === "HOA Member");
  const adminPolicy = adminRole ? await getRolePolicy(adminRole.id, adminRole.name) : null;
  const memberPolicy = memberRole ? await getRolePolicy(memberRole.id, memberRole.name) : null;
  if (!adminPolicy || !memberPolicy) throw new Error("HOA Admin or HOA Member policy not found");

  const orgFilter = { organization: { _in: "$CURRENT_USER.hoa_members.organization" } };
  const own = { _and: [orgFilter, { member: { user: { _eq: "$CURRENT_USER" } } }] };
  // The notice must belong to the same organization as the row.
  const sameOrgAnnouncement = { announcement: { organization: { _in: "$CURRENT_USER.hoa_members.organization" } } };

  await postPermission(memberPolicy.id, "hoa_acknowledgments", "create", {
    permissions: {},
    validation: { _and: [orgFilter, sameOrgAnnouncement, { member: { user: { _eq: "$CURRENT_USER" } } }, { method: { _in: ["swipe", "button"] } }] },
    fields: ["organization", "announcement", "member", "acknowledged_at", "method", "ack_key"],
  });
  await postPermission(memberPolicy.id, "hoa_acknowledgments", "read", { permissions: own, validation: null, fields: ["*"] });
  await postPermission(adminPolicy.id, "hoa_acknowledgments", "read", { permissions: orgFilter, validation: null, fields: ["*"] });
}

async function main(): Promise<void> {
  console.log(`📡 ${DIRECTUS_URL}`);
  try {
    await createAnnouncementFields();
    await createAcknowledgments();
    await setupPermissions();
    console.log("\n✅ Done. Run `pnpm generate:types` next.");
  } catch (error: any) {
    console.error("\n❌", error.message);
    process.exit(1);
  }
}

main();
