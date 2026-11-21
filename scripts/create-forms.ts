/**
 * Creates hoa_forms and hoa_form_signatures (docs/scope-notices-and-forms.md,
 * build step 3).
 *
 * Run with: pnpm run create:forms
 * Idempotent. Needs DIRECTUS_URL + DIRECTUS_STATIC_TOKEN (admin token).
 *
 * Permissions (every rule is scoped to the person's own organization):
 *   hoa_forms
 *     HOA Admin:  full CRUD on their organization's forms.
 *     HOA Member: read forms that are not drafts. Who a form is FOR (audience)
 *                 is applied by the pure helper, not by Directus.
 *   hoa_form_signatures
 *     HOA Member: read ONLY their own rows (member.user = $CURRENT_USER).
 *     HOA Admin:  read every row of their organization. No create/update/delete.
 *     Nobody creates through Directus: the signing route (step 4) writes with
 *     the server token so `ip` and `user_agent` come from the request, never from
 *     the client, which keeps the audit trail honest.
 * Board members use the HOA Member policy, so their read-all list goes through a
 * server route that checks the board hat for the same organization (step 4).
 *
 * Uniqueness: `sign_key` ("<form>:<member>") carries a unique index, because the
 * fields API cannot make a composite unique.
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


async function createForms(): Promise<void> {
  console.log("\n📁 Creating hoa_forms...");
  await createCollection("hoa_forms", {
    collection: "hoa_forms",
    icon: "draw",
    note: "Documents sent to members to sign",
    display_template: "{{title}}",
  });
  await createField("hoa_forms", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: "hoa_forms", field: "organization", related_collection: "hoa_organizations", schema: { on_delete: "CASCADE" } });
  await createField("hoa_forms", "title", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "full" },
  });
  await createField("hoa_forms", "description", {
    type: "text",
    meta: { interface: "input-multiline", width: "full" },
  });
  await createField("hoa_forms", "document", {
    type: "uuid",
    meta: { interface: "file", display: "file", width: "half", note: "The document to read and sign." },
  });
  await createRelation({ collection: "hoa_forms", field: "document", related_collection: "directus_files", schema: { on_delete: "SET NULL" } });
  await createField("hoa_forms", "audience", {
    type: "string",
    schema: { is_nullable: false, default_value: "owners" },
    meta: {
      interface: "select-dropdown", display: "labels", required: true, width: "half",
      options: { choices: [{ text: "Owners", value: "owners" }, { text: "Tenants", value: "tenants" }, { text: "Board members", value: "board" }, { text: "Everyone", value: "all" }] },
    },
  });
  await createField("hoa_forms", "due_date", {
    type: "date",
    meta: { interface: "datetime", width: "half", note: "Sign by this date (reminders key off it)." },
  });
  await createField("hoa_forms", "status", {
    type: "string",
    schema: { is_nullable: false, default_value: "draft" },
    meta: {
      interface: "select-dropdown", display: "labels", required: true, width: "half",
      options: { choices: [{ text: "Draft", value: "draft" }, { text: "Open", value: "open" }, { text: "Closed", value: "closed" }] },
    },
  });
  await createField("hoa_forms", "sent_at", {
    type: "timestamp",
    meta: { interface: "datetime", display: "datetime", width: "half", note: "Set when the form is opened; reminders count days from here." },
  });
  await addSystemFields("hoa_forms");
}

async function createFormSignatures(): Promise<void> {
  console.log("\n📁 Creating hoa_form_signatures...");
  await createCollection("hoa_form_signatures", {
    collection: "hoa_form_signatures",
    icon: "ink_pen",
    note: "One row per member who signed a form (typed name plus audit trail)",
    display_template: "{{form.title}}",
  });
  await createField("hoa_form_signatures", "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: "hoa_form_signatures", field: "organization", related_collection: "hoa_organizations", schema: { on_delete: "CASCADE" } });
  await createField("hoa_form_signatures", "form", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{title}}" } },
  });
  await createRelation({ collection: "hoa_form_signatures", field: "form", related_collection: "hoa_forms", schema: { on_delete: "CASCADE" } });
  await createField("hoa_form_signatures", "member", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{first_name}} {{last_name}}" } },
  });
  await createRelation({ collection: "hoa_form_signatures", field: "member", related_collection: "hoa_members", schema: { on_delete: "CASCADE" } });
  await createField("hoa_form_signatures", "signed_at", {
    type: "timestamp",
    schema: { is_nullable: false },
    meta: { interface: "datetime", display: "datetime", required: true, width: "half" },
  });
  await createField("hoa_form_signatures", "signed_name", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "half", note: "The name the person typed as their signature." },
  });
  await createField("hoa_form_signatures", "ip", {
    type: "string",
    meta: { interface: "input", width: "half", note: "Audit trail, set by the server." },
  });
  await createField("hoa_form_signatures", "user_agent", {
    type: "text",
    meta: { interface: "input-multiline", width: "full", note: "Audit trail, set by the server." },
  });
  await createField("hoa_form_signatures", "signed_file", {
    type: "uuid",
    meta: { interface: "file", display: "file", width: "half", note: "Optional signed copy." },
  });
  await createRelation({ collection: "hoa_form_signatures", field: "signed_file", related_collection: "directus_files", schema: { on_delete: "SET NULL" } });
  await createField("hoa_form_signatures", "sign_key", {
    type: "string",
    schema: { is_nullable: false, is_unique: true },
    meta: { interface: "input", required: true, hidden: true, width: "half", note: "<form>:<member>. Unique: one signature per member per form." },
  });
  await addSystemFields("hoa_form_signatures");
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

  console.log("   hoa_forms");
  await postPermission(adminPolicy.id, "hoa_forms", "create", { permissions: {}, validation: orgFilter, fields: ["*"] });
  await postPermission(adminPolicy.id, "hoa_forms", "read", { permissions: orgFilter, validation: null, fields: ["*"] });
  await postPermission(adminPolicy.id, "hoa_forms", "update", { permissions: orgFilter, validation: orgFilter, fields: ["*"] });
  await postPermission(adminPolicy.id, "hoa_forms", "delete", { permissions: orgFilter, validation: null });
  await postPermission(memberPolicy.id, "hoa_forms", "read", {
    permissions: { _and: [orgFilter, { status: { _neq: "draft" } }] }, validation: null, fields: ["*"],
  });

  console.log("   hoa_form_signatures");
  await postPermission(memberPolicy.id, "hoa_form_signatures", "read", { permissions: own, validation: null, fields: ["*"] });
  await postPermission(adminPolicy.id, "hoa_form_signatures", "read", { permissions: orgFilter, validation: null, fields: ["*"] });
}

async function main(): Promise<void> {
  console.log(`📡 ${DIRECTUS_URL}`);
  try {
    await createForms();
    await createFormSignatures();
    await setupPermissions();
    console.log("\n✅ Done. Run `pnpm generate:types` next.");
  } catch (error: any) {
    console.error("\n❌", error.message);
    process.exit(1);
  }
}

main();
