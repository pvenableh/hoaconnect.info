/**
 * Script to create Directus collections for the Meetings feature
 *
 * Creates:
 * - hoa_meetings: board/annual/special/committee meetings with notice, agenda,
 *   minutes, recording, attachments, audience targeting and publish flag.
 * - hoa_meeting_attendees: junction linking a meeting to a person (hoa_member),
 *   with a HARD link to the exact board term (hoa_board_members) active on the
 *   meeting date AND a frozen role snapshot (role_at_meeting) so historical
 *   minutes always show who attended as what they were that day.
 * - hoa_meetings_files: M2M junction for attachments (directus_files).
 *
 * Also: cleans up the hoa_board_members.title enum typos and migrates existing
 * rows to the canonical values used throughout the app
 * (president, vice_president, secretary, treasurer, director).
 *
 * Run with: pnpm run create:meetings
 *
 * Prerequisites:
 * - DIRECTUS_URL in .env file
 * - DIRECTUS_STATIC_TOKEN in .env file (admin token)
 *
 * Idempotent: existing collections/fields/relations are skipped.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

// Helper to make authenticated fetch requests
async function directusFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
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

  // Some endpoints (e.g. PATCH with no return) may have empty bodies
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

async function createCollection(
  collection: string,
  meta: Record<string, any>,
  collectionSchema: Record<string, any> = {}
): Promise<void> {
  if (await collectionExists(collection)) {
    console.log(`   ⏭️  Collection ${collection} already exists, skipping...`);
    return;
  }

  await directusFetch("/collections", {
    method: "POST",
    body: JSON.stringify({
      collection,
      meta,
      schema: { name: collection, ...collectionSchema },
      fields: [
        {
          field: "id",
          type: "uuid",
          meta: {
            hidden: true,
            readonly: true,
            interface: "input",
            special: ["uuid"],
          },
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
    // Field doesn't exist, create it
  }

  await directusFetch(`/fields/${collection}`, {
    method: "POST",
    body: JSON.stringify({ field, ...fieldConfig }),
  });

  console.log(`   ✅ Created field: ${collection}.${field}`);
}

async function createRelation(relationConfig: Record<string, any>): Promise<void> {
  try {
    await directusFetch("/relations", {
      method: "POST",
      body: JSON.stringify(relationConfig),
    });
    console.log(
      `   ✅ Created relation: ${relationConfig.collection}.${relationConfig.field} → ${relationConfig.related_collection}`
    );
  } catch (error: any) {
    if (
      error.message.includes("already exists") ||
      error.message.includes("already has an associated relationship") ||
      error.message.includes("409")
    ) {
      console.log(
        `   ⏭️  Relation ${relationConfig.collection}.${relationConfig.field} already exists, skipping...`
      );
    } else {
      throw error;
    }
  }
}

const STATUS_CHOICES = [
  { text: "Scheduled", value: "scheduled", color: "var(--theme--primary)" },
  { text: "In Progress", value: "in_progress", color: "var(--theme--warning)" },
  { text: "Completed", value: "completed", color: "var(--theme--success)" },
  { text: "Canceled", value: "canceled", color: "var(--theme--danger)" },
];

const TYPE_CHOICES = [
  { text: "Board Meeting", value: "board" },
  { text: "Annual Meeting", value: "annual" },
  { text: "Special Meeting", value: "special" },
  { text: "Committee Meeting", value: "committee" },
];

const AUDIENCE_CHOICES = [
  { text: "Everyone", value: "all" },
  { text: "Owners", value: "owners" },
  { text: "Tenants", value: "tenants" },
  { text: "Board Members", value: "board_members" },
];

// System audit fields shared by collections
async function addSystemFields(collection: string): Promise<void> {
  await createField(collection, "user_created", {
    type: "uuid",
    meta: {
      special: ["user-created"],
      interface: "select-dropdown-m2o",
      display: "user",
      readonly: true,
      hidden: true,
      width: "half",
    },
  });
  await createRelation({
    collection,
    field: "user_created",
    related_collection: "directus_users",
  });

  await createField(collection, "date_created", {
    type: "timestamp",
    meta: {
      special: ["date-created"],
      interface: "datetime",
      display: "datetime",
      readonly: true,
      hidden: true,
      width: "half",
    },
  });

  await createField(collection, "user_updated", {
    type: "uuid",
    meta: {
      special: ["user-updated"],
      interface: "select-dropdown-m2o",
      display: "user",
      readonly: true,
      hidden: true,
      width: "half",
    },
  });
  await createRelation({
    collection,
    field: "user_updated",
    related_collection: "directus_users",
  });

  await createField(collection, "date_updated", {
    type: "timestamp",
    meta: {
      special: ["date-updated"],
      interface: "datetime",
      display: "datetime",
      readonly: true,
      hidden: true,
      width: "half",
    },
  });
}

// ============================================
// hoa_meetings
// ============================================
async function createMeetingsCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_meetings collection...");

  await createCollection("hoa_meetings", {
    collection: "hoa_meetings",
    icon: "groups",
    note: "Board / association meetings: notice, agenda, minutes, recording",
    display_template: "{{title}} ({{meeting_date}})",
    sort_field: "sort",
  });

  await createField("hoa_meetings", "sort", {
    type: "integer",
    meta: { interface: "input", hidden: true },
  });

  await createField("hoa_meetings", "title", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "full" },
  });

  await createField("hoa_meetings", "type", {
    type: "string",
    schema: { default_value: "board" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: { choices: TYPE_CHOICES },
    },
  });

  await createField("hoa_meetings", "status", {
    type: "string",
    schema: { default_value: "scheduled" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: { choices: STATUS_CHOICES },
    },
  });

  await createField("hoa_meetings", "meeting_date", {
    type: "timestamp",
    meta: {
      interface: "datetime",
      display: "datetime",
      width: "half",
      note: "Date & time the meeting starts",
    },
  });

  await createField("hoa_meetings", "end_date", {
    type: "timestamp",
    meta: {
      interface: "datetime",
      display: "datetime",
      width: "half",
      note: "Optional end date/time",
    },
  });

  await createField("hoa_meetings", "location", {
    type: "string",
    meta: { interface: "input", width: "half", note: "Physical location" },
  });

  await createField("hoa_meetings", "virtual_url", {
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note: "Video conference / livestream link",
    },
  });

  // Notice file (single file M2O)
  await createField("hoa_meetings", "notice_file", {
    type: "uuid",
    meta: {
      interface: "file",
      special: ["file"],
      width: "half",
      note: "Meeting notice document",
    },
  });
  await createRelation({
    collection: "hoa_meetings",
    field: "notice_file",
    related_collection: "directus_files",
    schema: { on_delete: "SET NULL" },
  });

  await createField("hoa_meetings", "agenda", {
    type: "text",
    meta: {
      interface: "input-rich-text-html",
      width: "full",
      note: "Meeting agenda",
    },
  });

  await createField("hoa_meetings", "minutes", {
    type: "text",
    meta: {
      interface: "input-rich-text-html",
      width: "full",
      note: "Meeting minutes (published after the meeting)",
    },
  });

  await createField("hoa_meetings", "recording_url", {
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note: "Link to recording (YouTube, Vimeo, etc.)",
    },
  });

  // Recording file (single file M2O)
  await createField("hoa_meetings", "recording_file", {
    type: "uuid",
    meta: {
      interface: "file",
      special: ["file"],
      width: "half",
      note: "Uploaded recording file",
    },
  });
  await createRelation({
    collection: "hoa_meetings",
    field: "recording_file",
    related_collection: "directus_files",
    schema: { on_delete: "SET NULL" },
  });

  await createField("hoa_meetings", "is_published", {
    type: "boolean",
    schema: { default_value: false },
    meta: {
      interface: "boolean",
      width: "half",
      note: "Visible to members when true",
    },
  });

  await createField("hoa_meetings", "target_audience", {
    type: "string",
    schema: { default_value: "all" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: { choices: AUDIENCE_CHOICES },
    },
  });

  // Alias fields for the relations created in the junction/attendee collections
  await createField("hoa_meetings", "attendees", {
    type: "alias",
    meta: {
      interface: "list-o2m",
      special: ["o2m"],
      width: "full",
      options: {
        template: "{{hoa_member.first_name}} {{hoa_member.last_name}} — {{role_at_meeting}}",
      },
    },
  });

  await createField("hoa_meetings", "attachments", {
    type: "alias",
    meta: { interface: "files", special: ["m2m"], width: "full" },
  });

  // Organization (M2O, required)
  await createField("hoa_meetings", "organization", {
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
    collection: "hoa_meetings",
    field: "organization",
    related_collection: "hoa_organizations",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });

  await addSystemFields("hoa_meetings");
}

// ============================================
// hoa_meeting_attendees
// ============================================
async function createMeetingAttendeesCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_meeting_attendees collection...");

  await createCollection("hoa_meeting_attendees", {
    collection: "hoa_meeting_attendees",
    icon: "how_to_reg",
    note: "Who attended a meeting, with a frozen role snapshot for history",
    display_template: "{{hoa_member.first_name}} {{hoa_member.last_name}} — {{role_at_meeting}}",
  });

  // Meeting (M2O) — drives hoa_meetings.attendees (o2m)
  await createField("hoa_meeting_attendees", "meeting", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: {
      interface: "select-dropdown-m2o",
      required: true,
      width: "half",
      display: "related-values",
      display_options: { template: "{{title}}" },
    },
  });
  await createRelation({
    collection: "hoa_meeting_attendees",
    field: "meeting",
    related_collection: "hoa_meetings",
    meta: { one_field: "attendees", sort_field: null },
    schema: { on_delete: "CASCADE" },
  });

  // Person (hoa_member M2O)
  await createField("hoa_meeting_attendees", "hoa_member", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      width: "half",
      display: "related-values",
      display_options: { template: "{{first_name}} {{last_name}}" },
      note: "The person who attended",
    },
  });
  await createRelation({
    collection: "hoa_meeting_attendees",
    field: "hoa_member",
    related_collection: "hoa_members",
    schema: { on_delete: "SET NULL" },
  });

  // Hard link to the exact board term active at meeting time
  await createField("hoa_meeting_attendees", "board_term", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      width: "half",
      display: "related-values",
      display_options: { template: "{{title}} ({{term_start}})" },
      note: "The hoa_board_members term active on the meeting date",
    },
  });
  await createRelation({
    collection: "hoa_meeting_attendees",
    field: "board_term",
    related_collection: "hoa_board_members",
    schema: { on_delete: "SET NULL" },
  });

  // Frozen role snapshot
  await createField("hoa_meeting_attendees", "role_at_meeting", {
    type: "string",
    meta: {
      interface: "input",
      width: "half",
      note: "Role/title at the time of the meeting (frozen for history)",
    },
  });

  await createField("hoa_meeting_attendees", "is_board_member", {
    type: "boolean",
    schema: { default_value: false },
    meta: { interface: "boolean", width: "half" },
  });

  await createField("hoa_meeting_attendees", "attendance", {
    type: "string",
    schema: { default_value: "present" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: {
        choices: [
          { text: "Present", value: "present", color: "var(--theme--success)" },
          { text: "Absent", value: "absent", color: "var(--theme--danger)" },
          { text: "Excused", value: "excused", color: "var(--theme--warning)" },
          { text: "Proxy", value: "proxy", color: "var(--theme--primary)" },
        ],
      },
    },
  });

  await addSystemFields("hoa_meeting_attendees");
}

// ============================================
// hoa_meetings_files (M2M attachments junction)
// ============================================
async function createMeetingsFilesJunction(): Promise<void> {
  console.log("\n📁 Creating hoa_meetings_files junction...");

  await createCollection("hoa_meetings_files", {
    collection: "hoa_meetings_files",
    icon: "attach_file",
    hidden: true,
    note: "Junction: hoa_meetings ↔ directus_files (attachments)",
  });

  await createField("hoa_meetings_files", "hoa_meetings_id", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", hidden: true },
  });
  await createField("hoa_meetings_files", "directus_files_id", {
    type: "uuid",
    meta: { interface: "file", special: ["file"], hidden: true },
  });

  await createRelation({
    collection: "hoa_meetings_files",
    field: "hoa_meetings_id",
    related_collection: "hoa_meetings",
    meta: {
      one_field: "attachments",
      junction_field: "directus_files_id",
      sort_field: null,
    },
    schema: { on_delete: "CASCADE" },
  });

  await createRelation({
    collection: "hoa_meetings_files",
    field: "directus_files_id",
    related_collection: "directus_files",
    meta: { one_field: null, junction_field: "hoa_meetings_id", sort_field: null },
    schema: { on_delete: "CASCADE" },
  });
}

// ============================================
// Board title enum cleanup + data migration
// ============================================
const BOARD_TITLE_MAP: Record<string, string> = {
  "borad member": "director",
  "board member": "director",
  board_member: "director",
  director: "director",
  president: "president",
  "vice president": "vice_president",
  vice_president: "vice_president",
  secretary: "secretary",
  treasurer: "treasurer",
};

const BOARD_TITLE_CHOICES = [
  { text: "President", value: "president" },
  { text: "Vice President", value: "vice_president" },
  { text: "Secretary", value: "secretary" },
  { text: "Treasurer", value: "treasurer" },
  { text: "Director", value: "director" },
];

async function fixBoardTitles(): Promise<void> {
  console.log("\n🩹 Cleaning up hoa_board_members.title enum + data...");

  // 1) Migrate existing rows to canonical values
  let rows: any[] = [];
  try {
    const res = await directusFetch(
      `/items/hoa_board_members?fields=id,title&limit=-1`
    );
    rows = res?.data ?? [];
  } catch (e: any) {
    console.log(`   ⚠️  Could not read hoa_board_members: ${e.message}`);
    return;
  }

  let migrated = 0;
  for (const row of rows) {
    const raw = (row.title ?? "").toString().trim();
    if (!raw) continue;
    const mapped = BOARD_TITLE_MAP[raw.toLowerCase()] ?? BOARD_TITLE_MAP[raw];
    if (mapped && mapped !== raw) {
      await directusFetch(`/items/hoa_board_members/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: mapped }),
      });
      console.log(`   ↻ ${row.id}: "${raw}" → "${mapped}"`);
      migrated++;
    }
  }
  console.log(`   ✅ Migrated ${migrated} board title value(s)`);

  // 2) Update the field's select choices to the clean enum
  try {
    await directusFetch(`/fields/hoa_board_members/title`, {
      method: "PATCH",
      body: JSON.stringify({
        meta: {
          interface: "select-dropdown",
          display: "labels",
          options: { choices: BOARD_TITLE_CHOICES },
        },
      }),
    });
    console.log("   ✅ Updated hoa_board_members.title choices");
  } catch (e: any) {
    console.log(`   ⚠️  Could not update title field options: ${e.message}`);
  }
}

// ============================================
// Permissions
// ============================================
interface Role {
  id: string;
  name: string;
}
interface Policy {
  id: string;
  name: string;
}
interface RoleWithPolicy {
  role: Role;
  policy: Policy | null;
}

async function getRoles(): Promise<Role[]> {
  const response = await directusFetch(
    `/roles?filter=${JSON.stringify({
      name: { _in: ["HOA Admin", "HOA Member"] },
    })}&fields=id,name`
  );
  return response.data as Role[];
}

async function getRolePolicy(roleId: string, roleName: string): Promise<Policy | null> {
  try {
    const response = await directusFetch(
      `/access?filter=${JSON.stringify({ role: { _eq: roleId } })}&fields=id,policy&limit=1`
    );
    if (response.data && response.data.length > 0) {
      const accessEntry = response.data[0];
      const policyId =
        typeof accessEntry.policy === "string"
          ? accessEntry.policy
          : accessEntry.policy?.id;
      if (policyId) return { id: policyId, name: roleName };
    }
    return null;
  } catch {
    return null;
  }
}

async function setupPermissions(): Promise<void> {
  console.log("\n🔐 Setting up permissions...");

  const roles = await getRoles();
  if (roles.length === 0) {
    console.log("   ⚠️  No HOA roles found. Skipping permissions setup.");
    return;
  }

  const rolesWithPolicies: RoleWithPolicy[] = [];
  for (const role of roles) {
    const policy = await getRolePolicy(role.id, role.name);
    rolesWithPolicies.push({ role, policy });
    console.log(
      policy
        ? `   ✅ Found policy for role "${role.name}"`
        : `   ⚠️  No policy found for role "${role.name}"`
    );
  }

  const adminEntry = rolesWithPolicies.find((r) => r.role.name === "HOA Admin");
  const memberEntry = rolesWithPolicies.find((r) => r.role.name === "HOA Member");

  if (!adminEntry?.policy && !memberEntry?.policy) {
    console.log("\n   ⚠️  No policies found. Set up meeting permissions manually.");
    return;
  }

  const orgFilter = {
    organization: { _in: "$CURRENT_USER.hoa_members.organization" },
  };
  const publishedOrgFilter = {
    _and: [orgFilter, { is_published: { _eq: true } }],
  };
  const attendeeOrgFilter = {
    meeting: { organization: { _in: "$CURRENT_USER.hoa_members.organization" } },
  };
  const attendeePublishedFilter = {
    meeting: {
      _and: [
        { organization: { _in: "$CURRENT_USER.hoa_members.organization" } },
        { is_published: { _eq: true } },
      ],
    },
  };
  const filesOrgFilter = {
    hoa_meetings_id: {
      organization: { _in: "$CURRENT_USER.hoa_members.organization" },
    },
  };
  const filesPublishedFilter = {
    hoa_meetings_id: {
      _and: [
        { organization: { _in: "$CURRENT_USER.hoa_members.organization" } },
        { is_published: { _eq: true } },
      ],
    },
  };

  const collections = [
    {
      collection: "hoa_meetings",
      adminPermissions: {
        create: { permissions: {}, validation: orgFilter, fields: ["*"] },
        read: { permissions: orgFilter, validation: null, fields: ["*"] },
        update: { permissions: orgFilter, validation: orgFilter, fields: ["*"] },
        delete: { permissions: orgFilter, validation: null, fields: ["*"] },
      },
      memberPermissions: {
        read: { permissions: publishedOrgFilter, validation: null, fields: ["*"] },
      },
    },
    {
      collection: "hoa_meeting_attendees",
      adminPermissions: {
        create: { permissions: {}, validation: attendeeOrgFilter, fields: ["*"] },
        read: { permissions: attendeeOrgFilter, validation: null, fields: ["*"] },
        update: { permissions: attendeeOrgFilter, validation: null, fields: ["*"] },
        delete: { permissions: attendeeOrgFilter, validation: null, fields: ["*"] },
      },
      memberPermissions: {
        read: { permissions: attendeePublishedFilter, validation: null, fields: ["*"] },
      },
    },
    {
      collection: "hoa_meetings_files",
      adminPermissions: {
        create: { permissions: {}, validation: null, fields: ["*"] },
        read: { permissions: filesOrgFilter, validation: null, fields: ["*"] },
        update: { permissions: filesOrgFilter, validation: null, fields: ["*"] },
        delete: { permissions: filesOrgFilter, validation: null, fields: ["*"] },
      },
      memberPermissions: {
        read: { permissions: filesPublishedFilter, validation: null, fields: ["*"] },
      },
    },
  ];

  for (const { collection, adminPermissions, memberPermissions } of collections) {
    if (adminEntry?.policy) {
      console.log(`\n   📋 ${collection} permissions for HOA Admin...`);
      for (const [action, config] of Object.entries(adminPermissions)) {
        try {
          await directusFetch("/permissions", {
            method: "POST",
            body: JSON.stringify({
              policy: adminEntry.policy.id,
              collection,
              action,
              ...config,
            }),
          });
          console.log(`      ✅ ${action}`);
        } catch (error: any) {
          if (
            error.message.includes("already exists") ||
            error.message.includes("409") ||
            error.message.includes("unique")
          ) {
            console.log(`      ⏭️  ${action} (already exists)`);
          } else {
            console.log(`      ❌ ${action}: ${error.message}`);
          }
        }
      }
    }

    if (memberEntry?.policy) {
      console.log(`\n   📋 ${collection} permissions for HOA Member...`);
      for (const [action, config] of Object.entries(memberPermissions)) {
        try {
          await directusFetch("/permissions", {
            method: "POST",
            body: JSON.stringify({
              policy: memberEntry.policy.id,
              collection,
              action,
              ...config,
            }),
          });
          console.log(`      ✅ ${action}`);
        } catch (error: any) {
          if (
            error.message.includes("already exists") ||
            error.message.includes("409") ||
            error.message.includes("unique")
          ) {
            console.log(`      ⏭️  ${action} (already exists)`);
          } else {
            console.log(`      ❌ ${action}: ${error.message}`);
          }
        }
      }
    }
  }
}

// ============================================
// Main
// ============================================
async function main(): Promise<void> {
  console.log("🚀 Creating Directus collections for the Meetings feature...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);

  try {
    await createMeetingsCollection();
    await createMeetingAttendeesCollection();
    await createMeetingsFilesJunction();
    await fixBoardTitles();
    await setupPermissions();

    console.log("\n✅ Meetings collections, board-title cleanup, and permissions complete!");
    console.log("\n📌 Next steps:");
    console.log("   1. Review hoa_meetings in Directus Admin");
    console.log("   2. Run `pnpm generate:types` to refresh types/directus.ts");
    console.log("   3. Build / test the Meetings UI");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
