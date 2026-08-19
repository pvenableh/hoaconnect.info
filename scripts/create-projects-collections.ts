/**
 * Script to create the project-management collections (Phase 2 of the master
 * plan) — an Earnest-style model adapted to HOAs:
 *
 *   hoa_projects        — board/committee projects (capital works, events…)
 *                         nesting via parent_project, spawning via parent_event,
 *                         simple budget tracking (budget_amount / actual_spend),
 *                         per-project member visibility (member_visible)
 *   hoa_project_events  — milestones/phases on a project timeline (dates,
 *                         business-day durations, dependencies, approvals)
 *   hoa_tasks           — polymorphic NESTED tasks (parent_task subtasks) that
 *                         attach to a project, event, request, or team
 *   junctions           — hoa_projects_users / hoa_tasks_users (multi-assignee),
 *                         hoa_projects_files / hoa_project_events_files,
 *                         hoa_projects_vendors (vendor assignment)
 *   hoa_requests.project — any request/ticket can attach to a project
 *                         ("promote to project" lives in the server API)
 *
 * Deliberately NOT ported from Earnest: clients/services/billing/retainers —
 * HOA budgeting stays simple (a budget number and actual spend, not QuickBooks).
 *
 * Comments need no schema here: hoa_comments is polymorphic
 * (target_collection + target_id).
 *
 * Run with: pnpm run create:projects
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: existing collections/fields/relations/permissions are skipped.
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
        { field: "id", type: "uuid", meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] }, schema: { is_primary_key: true, has_auto_increment: false } },
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
  await directusFetch(`/fields/${collection}`, { method: "POST", body: JSON.stringify({ field, ...fieldConfig }) });
  console.log(`   ✅ Created field: ${collection}.${field}`);
}

async function createRelation(relationConfig: Record<string, any>): Promise<void> {
  try {
    await directusFetch("/relations", { method: "POST", body: JSON.stringify(relationConfig) });
    console.log(`   ✅ Created relation: ${relationConfig.collection}.${relationConfig.field} → ${relationConfig.related_collection}`);
  } catch (error: any) {
    if (error.message.includes("already exists") || error.message.includes("already has an associated relationship") || error.message.includes("409")) {
      console.log(`   ⏭️  Relation ${relationConfig.collection}.${relationConfig.field} already exists, skipping...`);
    } else {
      throw error;
    }
  }
}

// ── Shared field helpers ─────────────────────────────────────────────────────

async function addOrgField(collection: string): Promise<void> {
  await createField(collection, "organization", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection, field: "organization", related_collection: "hoa_organizations", meta: { sort_field: null }, schema: { on_delete: "CASCADE" } });
}

async function addAuditFields(collection: string): Promise<void> {
  await createField(collection, "date_created", { type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true } });
  await createField(collection, "date_updated", { type: "timestamp", meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true } });
  await createField(collection, "user_created", { type: "uuid", meta: { special: ["user-created"], interface: "select-dropdown-m2o", display: "user", readonly: true, hidden: true } });
  await createRelation({ collection, field: "user_created", related_collection: "directus_users" });
}

// ── Choice lists ─────────────────────────────────────────────────────────────

const PROJECT_STATUS_CHOICES = [
  { text: "Planning", value: "planning", color: "var(--theme--primary)" },
  { text: "Active", value: "active", color: "var(--theme--success)" },
  { text: "On Hold", value: "on_hold", color: "var(--theme--warning)" },
  { text: "Completed", value: "completed", color: "var(--theme--foreground-subdued)" },
  { text: "Archived", value: "archived", color: "var(--theme--foreground-subdued)" },
];

const EVENT_STATUS_CHOICES = [
  { text: "Draft", value: "draft" },
  { text: "Scheduled", value: "scheduled" },
  { text: "Active", value: "active", color: "var(--theme--success)" },
  { text: "Completed", value: "completed" },
  { text: "Archived", value: "archived" },
];

const EVENT_TYPE_CHOICES = [
  { text: "Phase", value: "phase" },
  { text: "Milestone", value: "milestone" },
  { text: "Meeting", value: "meeting" },
  { text: "Inspection", value: "inspection" },
  { text: "Payment", value: "payment" },
  { text: "Other", value: "other" },
];

const APPROVAL_CHOICES = [
  { text: "No approval needed", value: "none_needed" },
  { text: "Needs approval", value: "needs_approval", color: "var(--theme--warning)" },
  { text: "Approved", value: "approved", color: "var(--theme--success)" },
];

const TASK_STATUS_CHOICES = [
  { text: "New", value: "new" },
  { text: "Approved", value: "approved" },
  { text: "In Progress", value: "in_progress", color: "var(--theme--primary)" },
  { text: "Completed", value: "completed", color: "var(--theme--success)" },
];

const TASK_PRIORITY_CHOICES = [
  { text: "Low", value: "low" },
  { text: "Medium", value: "medium" },
  { text: "High", value: "high", color: "var(--theme--warning)" },
  { text: "Urgent", value: "urgent", color: "var(--theme--danger)" },
];

const TASK_SCHEDULE_CHOICES = [
  { text: "Today", value: "today" },
  { text: "This week", value: "this_week" },
  { text: "Later", value: "later" },
  { text: "Unscheduled", value: "unscheduled" },
];

const TASK_CATEGORY_CHOICES = [
  { text: "Quick (personal)", value: "quick" },
  { text: "Project", value: "project" },
  { text: "Event/Milestone", value: "event" },
  { text: "Request", value: "request" },
  { text: "Team", value: "team" },
];

// ── hoa_projects ─────────────────────────────────────────────────────────────

async function createProjectsCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_projects collection...");

  await createCollection("hoa_projects", {
    collection: "hoa_projects",
    icon: "rocket_launch",
    note: "Board/committee projects — nesting (parent_project), spawning (parent_event), simple budget, member visibility.",
    display_template: "{{title}}",
    sort_field: "sort",
    archive_field: "status",
    archive_value: "archived",
    unarchive_value: "active",
  });

  await createField("hoa_projects", "sort", { type: "integer", meta: { interface: "input", hidden: true } });

  await createField("hoa_projects", "status", {
    type: "string",
    schema: { default_value: "planning" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: PROJECT_STATUS_CHOICES } },
  });

  await createField("hoa_projects", "title", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "full" },
  });

  await createField("hoa_projects", "description", {
    type: "text",
    meta: { interface: "input-rich-text-html", width: "full" },
  });

  await addOrgField("hoa_projects");

  await createField("hoa_projects", "team", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{name}}" }, note: "Committee/team that owns this project" },
  });
  await createRelation({ collection: "hoa_projects", field: "team", related_collection: "hoa_teams", meta: { one_field: "projects", sort_field: null }, schema: { on_delete: "SET NULL" } });

  await createField("hoa_projects", "parent_project", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{title}}" }, note: "Parent project (sub-project nesting)" },
  });
  await createRelation({ collection: "hoa_projects", field: "parent_project", related_collection: "hoa_projects", meta: { one_field: "children", sort_field: null }, schema: { on_delete: "SET NULL" } });

  await createField("hoa_projects", "children", {
    type: "alias",
    meta: { interface: "list-o2m", special: ["o2m"], width: "full", options: { template: "{{title}}" } },
  });

  await createField("hoa_projects", "start_date", { type: "date", meta: { interface: "datetime", width: "half" } });
  await createField("hoa_projects", "due_date", { type: "date", meta: { interface: "datetime", width: "half" } });
  await createField("hoa_projects", "completion_date", { type: "date", meta: { interface: "datetime", width: "half" } });

  await createField("hoa_projects", "color", { type: "string", meta: { interface: "select-color", width: "half", note: "Timeline line color" } });
  await createField("hoa_projects", "icon", { type: "string", meta: { interface: "select-icon", width: "half" } });

  await createField("hoa_projects", "member_visible", {
    type: "boolean",
    schema: { default_value: false },
    meta: { interface: "boolean", width: "half", note: "Residents can see this project (read-only)" },
  });

  await createField("hoa_projects", "budget_amount", {
    type: "decimal",
    schema: { numeric_precision: 12, numeric_scale: 2 },
    meta: { interface: "input", width: "half", note: "Planned budget (board-only)" },
  });
  await createField("hoa_projects", "actual_spend", {
    type: "decimal",
    schema: { numeric_precision: 12, numeric_scale: 2 },
    meta: { interface: "input", width: "half", note: "Actual spend (manual; expense rollup comes later)" },
  });

  await createField("hoa_projects", "events", {
    type: "alias",
    meta: { interface: "list-o2m", special: ["o2m"], width: "full", options: { template: "{{title}}" } },
  });
  await createField("hoa_projects", "tasks", {
    type: "alias",
    meta: { interface: "list-o2m", special: ["o2m"], width: "full", options: { template: "{{title}}" } },
  });
  await createField("hoa_projects", "requests", {
    type: "alias",
    meta: { interface: "list-o2m", special: ["o2m"], width: "full", options: { template: "{{title}}" } },
  });

  await addAuditFields("hoa_projects");
}

// ── hoa_project_events ───────────────────────────────────────────────────────

async function createProjectEventsCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_project_events collection...");

  await createCollection("hoa_project_events", {
    collection: "hoa_project_events",
    icon: "timeline",
    note: "Milestones/phases on a project timeline — dates, business-day durations, dependencies, approvals.",
    display_template: "{{title}}",
    sort_field: "sort",
  });

  await createField("hoa_project_events", "sort", { type: "integer", meta: { interface: "input", hidden: true } });

  await createField("hoa_project_events", "status", {
    type: "string",
    schema: { default_value: "scheduled" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: EVENT_STATUS_CHOICES } },
  });

  await createField("hoa_project_events", "project", {
    type: "uuid",
    schema: { is_nullable: false },
    meta: { interface: "select-dropdown-m2o", required: true, width: "half", display: "related-values", display_options: { template: "{{title}}" } },
  });
  await createRelation({ collection: "hoa_project_events", field: "project", related_collection: "hoa_projects", meta: { one_field: "events", sort_field: "sort" }, schema: { on_delete: "CASCADE" } });

  await createField("hoa_project_events", "title", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "full" },
  });
  await createField("hoa_project_events", "description", { type: "text", meta: { interface: "input-multiline", width: "full" } });

  await createField("hoa_project_events", "type", {
    type: "string",
    schema: { default_value: "phase" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: EVENT_TYPE_CHOICES } },
  });

  await createField("hoa_project_events", "event_date", { type: "date", meta: { interface: "datetime", width: "half" } });
  await createField("hoa_project_events", "duration_days", {
    type: "integer",
    meta: { interface: "input", width: "half", note: "Business days; end_date is computed app-side" },
  });
  await createField("hoa_project_events", "end_date", { type: "date", meta: { interface: "datetime", width: "half" } });
  await createField("hoa_project_events", "is_milestone", {
    type: "boolean",
    schema: { default_value: false },
    meta: { interface: "boolean", width: "half" },
  });

  await createField("hoa_project_events", "depends_on", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{title}}" }, note: "Upstream event this one waits on" },
  });
  await createRelation({ collection: "hoa_project_events", field: "depends_on", related_collection: "hoa_project_events", schema: { on_delete: "SET NULL" } });

  await createField("hoa_project_events", "assigned_to", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "user" },
  });
  await createRelation({ collection: "hoa_project_events", field: "assigned_to", related_collection: "directus_users", schema: { on_delete: "SET NULL" } });

  await createField("hoa_project_events", "approval", {
    type: "string",
    schema: { default_value: "none_needed" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: APPROVAL_CHOICES } },
  });
  await createField("hoa_project_events", "approved_by", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "user", readonly: true },
  });
  await createRelation({ collection: "hoa_project_events", field: "approved_by", related_collection: "directus_users", schema: { on_delete: "SET NULL" } });
  await createField("hoa_project_events", "approved_at", { type: "timestamp", meta: { interface: "datetime", width: "half", readonly: true } });
  await createField("hoa_project_events", "approval_token", {
    type: "string",
    meta: { interface: "input", hidden: true, note: "Single-purpose shareable approval link token" },
  });

  await createField("hoa_project_events", "cost_amount", {
    type: "decimal",
    schema: { numeric_precision: 12, numeric_scale: 2 },
    meta: { interface: "input", width: "half", note: "Optional per-phase cost (board-only)" },
  });

  await addOrgField("hoa_project_events");

  await createField("hoa_project_events", "tasks", {
    type: "alias",
    meta: { interface: "list-o2m", special: ["o2m"], width: "full", options: { template: "{{title}}" } },
  });
  await createField("hoa_project_events", "spawned_projects", {
    type: "alias",
    meta: { interface: "list-o2m", special: ["o2m"], width: "full", options: { template: "{{title}}" } },
  });

  await addAuditFields("hoa_project_events");
}

/** parent_event lives on hoa_projects but relates to hoa_project_events, so it
 * is added after both collections exist. */
async function addProjectParentEventField(): Promise<void> {
  console.log("\n🔗 Adding hoa_projects.parent_event (spawn-from-milestone)...");
  await createField("hoa_projects", "parent_event", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{title}}" }, note: "Milestone this project was spawned from" },
  });
  await createRelation({ collection: "hoa_projects", field: "parent_event", related_collection: "hoa_project_events", meta: { one_field: "spawned_projects", sort_field: null }, schema: { on_delete: "SET NULL" } });
}

// ── hoa_tasks ────────────────────────────────────────────────────────────────

async function createTasksCollection(): Promise<void> {
  console.log("\n📁 Creating hoa_tasks collection...");

  await createCollection("hoa_tasks", {
    collection: "hoa_tasks",
    icon: "check_circle",
    note: "Polymorphic nested tasks — attach to a project, event, request, or team; parent_task = subtasks.",
    display_template: "{{title}}",
    sort_field: "sort",
  });

  await createField("hoa_tasks", "sort", { type: "integer", meta: { interface: "input", hidden: true } });

  await createField("hoa_tasks", "status", {
    type: "string",
    schema: { default_value: "new" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: TASK_STATUS_CHOICES } },
  });

  await createField("hoa_tasks", "title", {
    type: "string",
    schema: { is_nullable: false },
    meta: { interface: "input", required: true, width: "full" },
  });
  await createField("hoa_tasks", "description", { type: "text", meta: { interface: "input-multiline", width: "full" } });

  await createField("hoa_tasks", "priority", {
    type: "string",
    schema: { default_value: "medium" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: TASK_PRIORITY_CHOICES } },
  });

  await createField("hoa_tasks", "schedule", {
    type: "string",
    schema: { default_value: "unscheduled" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: TASK_SCHEDULE_CHOICES } },
  });

  await createField("hoa_tasks", "due_date", { type: "date", meta: { interface: "datetime", width: "half" } });
  await createField("hoa_tasks", "date_completed", { type: "timestamp", meta: { interface: "datetime", width: "half", readonly: true } });

  await createField("hoa_tasks", "parent_task", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{title}}" }, note: "Parent task (subtask nesting)" },
  });
  await createRelation({ collection: "hoa_tasks", field: "parent_task", related_collection: "hoa_tasks", meta: { one_field: "subtasks", sort_field: "sort" }, schema: { on_delete: "CASCADE" } });
  await createField("hoa_tasks", "subtasks", {
    type: "alias",
    meta: { interface: "list-o2m", special: ["o2m"], width: "full", options: { template: "{{title}}" } },
  });

  await createField("hoa_tasks", "category", {
    type: "string",
    schema: { default_value: "quick" },
    meta: { interface: "select-dropdown", display: "labels", width: "half", options: { choices: TASK_CATEGORY_CHOICES }, note: "Denormalized discriminator for where this task lives" },
  });

  await createField("hoa_tasks", "project", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{title}}" } },
  });
  await createRelation({ collection: "hoa_tasks", field: "project", related_collection: "hoa_projects", meta: { one_field: "tasks", sort_field: null }, schema: { on_delete: "SET NULL" } });

  await createField("hoa_tasks", "project_event", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{title}}" } },
  });
  await createRelation({ collection: "hoa_tasks", field: "project_event", related_collection: "hoa_project_events", meta: { one_field: "tasks", sort_field: null }, schema: { on_delete: "SET NULL" } });

  await createField("hoa_tasks", "request", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{title}}" } },
  });
  await createRelation({ collection: "hoa_tasks", field: "request", related_collection: "hoa_requests", meta: { one_field: "tasks", sort_field: null }, schema: { on_delete: "SET NULL" } });

  await createField("hoa_tasks", "team", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{name}}" } },
  });
  await createRelation({ collection: "hoa_tasks", field: "team", related_collection: "hoa_teams", schema: { on_delete: "SET NULL" } });

  await addOrgField("hoa_tasks");
  await addAuditFields("hoa_tasks");
}

/** hoa_requests.tasks alias so a request shows its checklist. */
async function addRequestTasksAlias(): Promise<void> {
  await createField("hoa_requests", "tasks", {
    type: "alias",
    meta: { interface: "list-o2m", special: ["o2m"], width: "full", options: { template: "{{title}}" } },
  });
}

// ── Junctions ────────────────────────────────────────────────────────────────

async function createUserJunction(collection: string, parentCollection: string, oneField: string): Promise<void> {
  console.log(`\n📁 Creating ${collection} junction...`);
  await createCollection(collection, {
    collection,
    icon: "people",
    note: `Junction: ${parentCollection} ↔ directus_users (assignees)`,
    hidden: true,
  });
  const parentField = parentCollection === "hoa_projects" ? "hoa_projects_id" : "hoa_tasks_id";
  await createField(collection, parentField, { type: "uuid", schema: {}, meta: { hidden: true } });
  await createRelation({
    collection,
    field: parentField,
    related_collection: parentCollection,
    meta: { one_field: oneField, junction_field: "directus_users_id", sort_field: null },
    schema: { on_delete: "CASCADE" },
  });
  await createField(collection, "directus_users_id", { type: "uuid", schema: {}, meta: { hidden: true } });
  await createRelation({
    collection,
    field: "directus_users_id",
    related_collection: "directus_users",
    meta: { junction_field: parentField },
    schema: { on_delete: "CASCADE" },
  });
}

async function createFileJunction(collection: string, parentCollection: string, parentField: string): Promise<void> {
  console.log(`\n📁 Creating ${collection} junction...`);
  await createCollection(collection, {
    collection,
    icon: "folder",
    note: `Junction: ${parentCollection} ↔ directus_files (attachments)`,
    hidden: true,
  });
  await createField(collection, parentField, { type: "uuid", schema: {}, meta: { hidden: true } });
  await createRelation({
    collection,
    field: parentField,
    related_collection: parentCollection,
    meta: { one_field: "files", junction_field: "directus_files_id", sort_field: null },
    schema: { on_delete: "CASCADE" },
  });
  await createField(collection, "directus_files_id", { type: "uuid", schema: {}, meta: { hidden: true } });
  await createRelation({
    collection,
    field: "directus_files_id",
    related_collection: "directus_files",
    meta: { junction_field: parentField },
    schema: { on_delete: "CASCADE" },
  });
}

async function createAssigneeAndFileJunctions(): Promise<void> {
  // Assignees (M2M) — alias fields on the parents
  await createField("hoa_projects", "assigned_to", {
    type: "alias",
    meta: { interface: "list-m2m", special: ["m2m"], width: "full", options: { template: "{{directus_users_id.first_name}} {{directus_users_id.last_name}}" } },
  });
  await createUserJunction("hoa_projects_users", "hoa_projects", "assigned_to");

  await createField("hoa_tasks", "assigned_to", {
    type: "alias",
    meta: { interface: "list-m2m", special: ["m2m"], width: "full", options: { template: "{{directus_users_id.first_name}} {{directus_users_id.last_name}}" } },
  });
  await createUserJunction("hoa_tasks_users", "hoa_tasks", "assigned_to");

  // Files (M2M)
  await createField("hoa_projects", "files", {
    type: "alias",
    meta: { interface: "files", special: ["files"], width: "full" },
  });
  await createFileJunction("hoa_projects_files", "hoa_projects", "hoa_projects_id");

  await createField("hoa_project_events", "files", {
    type: "alias",
    meta: { interface: "files", special: ["files"], width: "full" },
  });
  await createFileJunction("hoa_project_events_files", "hoa_project_events", "hoa_project_events_id");

  // Vendors (M2M with a role note on the junction)
  console.log("\n📁 Creating hoa_projects_vendors junction...");
  await createField("hoa_projects", "vendors", {
    type: "alias",
    meta: { interface: "list-m2m", special: ["m2m"], width: "full", options: { template: "{{hoa_vendors_id.name}}" } },
  });
  await createCollection("hoa_projects_vendors", {
    collection: "hoa_projects_vendors",
    icon: "storefront",
    note: "Junction: hoa_projects ↔ hoa_vendors (vendor assignment, with a role note)",
    hidden: true,
  });
  await createField("hoa_projects_vendors", "hoa_projects_id", { type: "uuid", schema: {}, meta: { hidden: true } });
  await createRelation({
    collection: "hoa_projects_vendors",
    field: "hoa_projects_id",
    related_collection: "hoa_projects",
    meta: { one_field: "vendors", junction_field: "hoa_vendors_id", sort_field: null },
    schema: { on_delete: "CASCADE" },
  });
  await createField("hoa_projects_vendors", "hoa_vendors_id", { type: "uuid", schema: {}, meta: { hidden: true } });
  await createRelation({
    collection: "hoa_projects_vendors",
    field: "hoa_vendors_id",
    related_collection: "hoa_vendors",
    meta: { junction_field: "hoa_projects_id" },
    schema: { on_delete: "CASCADE" },
  });
  await createField("hoa_projects_vendors", "role", {
    type: "string",
    meta: { interface: "input", width: "half", note: "What this vendor does on the project" },
  });
}

// ── hoa_requests.project ─────────────────────────────────────────────────────

async function addRequestProjectField(): Promise<void> {
  console.log("\n🔗 Adding hoa_requests.project (attach request to project)...");
  await createField("hoa_requests", "project", {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", width: "half", display: "related-values", display_options: { template: "{{title}}" }, note: "Project this request is attached to" },
  });
  await createRelation({ collection: "hoa_requests", field: "project", related_collection: "hoa_projects", meta: { one_field: "requests", sort_field: null }, schema: { on_delete: "SET NULL" } });
}

// ── Permissions ──────────────────────────────────────────────────────────────

interface Role { id: string; name: string; }
interface Policy { id: string; name: string; }

async function getRoles(): Promise<Role[]> {
  const response = await directusFetch(`/roles?filter=${JSON.stringify({ name: { _in: ["HOA Admin", "HOA Member"] } })}&fields=id,name`);
  return response.data as Role[];
}
async function getRolePolicy(roleId: string, roleName: string): Promise<Policy | null> {
  try {
    const response = await directusFetch(`/access?filter=${JSON.stringify({ role: { _eq: roleId } })}&fields=id,policy&limit=1`);
    if (response.data?.length) {
      const policyId = typeof response.data[0].policy === "string" ? response.data[0].policy : response.data[0].policy?.id;
      if (policyId) return { id: policyId, name: roleName };
    }
    return null;
  } catch {
    return null;
  }
}
async function postPermission(policy: string, collection: string, action: string, config: any): Promise<void> {
  // Upsert, don't skip: a row that already exists may hold a STALE filter (this
  // script shipped `$CURRENT_USER.organization` once, which 500s every read for
  // the whole policy — see the orgFilter note above). Skipping on conflict left
  // prod broken and un-repairable by re-running, so patch the existing row.
  const existing = await directusFetch(
    `/permissions?filter[policy][_eq]=${policy}&filter[collection][_eq]=${collection}&filter[action][_eq]=${action}&fields=id&limit=1`
  );
  const current = existing?.data?.[0];

  try {
    if (current) {
      await directusFetch(`/permissions/${current.id}`, { method: "PATCH", body: JSON.stringify(config) });
      console.log(`      ♻️  ${action} (updated)`);
      return;
    }
    await directusFetch("/permissions", { method: "POST", body: JSON.stringify({ policy, collection, action, ...config }) });
    console.log(`      ✅ ${action}`);
  } catch (error: any) {
    console.log(`      ❌ ${action}: ${error.message}`);
  }
}

async function setupPermissions(): Promise<void> {
  console.log("\n🔐 Setting up permissions...");
  const roles = await getRoles();
  if (!roles.length) {
    console.log("   ⚠️  No HOA roles found. Skipping permissions setup.");
    return;
  }
  const adminRole = roles.find((r) => r.name === "HOA Admin");
  const memberRole = roles.find((r) => r.name === "HOA Member");
  const adminPolicy = adminRole ? await getRolePolicy(adminRole.id, adminRole.name) : null;
  const memberPolicy = memberRole ? await getRolePolicy(memberRole.id, memberRole.name) : null;

  // `directus_users` has NO `organization` field — membership lives in
  // hoa_members. `$CURRENT_USER.organization` therefore resolves to nothing and
  // Directus 500s, and because it resolves dynamic variables per POLICY (not per
  // collection) one bad path breaks EVERY read for the role. Always use the
  // reverse relation. See scripts/fix-org-filter-permissions.ts.
  const orgFilter = { organization: { _in: "$CURRENT_USER.hoa_members.organization" } };

  const ALL_COLLECTIONS = [
    "hoa_projects",
    "hoa_project_events",
    "hoa_tasks",
    "hoa_projects_users",
    "hoa_tasks_users",
    "hoa_projects_files",
    "hoa_project_events_files",
    "hoa_projects_vendors",
  ];

  if (adminPolicy) {
    for (const collection of ALL_COLLECTIONS) {
      console.log(`\n   📋 ${collection} for HOA Admin...`);
      const filter = collection.includes("_users") || collection.includes("_files") || collection.includes("_vendors") ? {} : orgFilter;
      await postPermission(adminPolicy.id, collection, "create", { permissions: {}, validation: filter, fields: ["*"] });
      await postPermission(adminPolicy.id, collection, "read", { permissions: filter, validation: null, fields: ["*"] });
      await postPermission(adminPolicy.id, collection, "update", { permissions: filter, validation: filter, fields: ["*"] });
      await postPermission(adminPolicy.id, collection, "delete", { permissions: filter, validation: null, fields: ["*"] });
    }
  }

  if (memberPolicy) {
    // Members: read-only, member_visible projects only, never budget fields.
    // (PM/team-lead writes go through elevated server routes, not policies.)
    const PROJECT_MEMBER_FIELDS = [
      "id", "status", "title", "description", "organization", "team",
      "parent_project", "parent_event", "children", "start_date", "due_date",
      "completion_date", "color", "icon", "member_visible", "events", "tasks",
      "date_created", "date_updated",
    ];
    console.log(`\n   📋 hoa_projects for HOA Member (read-only, member_visible, no budget)...`);
    await postPermission(memberPolicy.id, "hoa_projects", "read", {
      permissions: { _and: [orgFilter, { member_visible: { _eq: true } }] },
      validation: null,
      fields: PROJECT_MEMBER_FIELDS,
    });

    console.log(`\n   📋 hoa_project_events for HOA Member (via visible project, no cost)...`);
    await postPermission(memberPolicy.id, "hoa_project_events", "read", {
      permissions: { _and: [orgFilter, { project: { member_visible: { _eq: true } } }] },
      validation: null,
      fields: [
        "id", "status", "project", "title", "description", "type", "event_date",
        "duration_days", "end_date", "is_milestone", "depends_on", "approval",
        "organization", "tasks", "date_created", "date_updated", "sort",
      ],
    });

    console.log(`\n   📋 hoa_tasks for HOA Member (via visible project)...`);
    await postPermission(memberPolicy.id, "hoa_tasks", "read", {
      permissions: { _and: [orgFilter, { project: { member_visible: { _eq: true } } }] },
      validation: null,
      fields: ["id", "status", "title", "priority", "due_date", "parent_task", "subtasks", "project", "project_event", "organization", "sort"],
    });
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🚀 Creating project-management collections...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await createProjectsCollection();
    await createProjectEventsCollection();
    await addProjectParentEventField();
    await createTasksCollection();
    await addRequestTasksAlias();
    await createAssigneeAndFileJunctions();
    await addRequestProjectField();
    await setupPermissions();
    console.log("\n✅ Project collections + permissions complete!");
    console.log("\n📌 Next: run `pnpm generate:types`.");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
