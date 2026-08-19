/**
 * Repair the org-scoping used by every HOA permission filter.
 *
 * Two separate defects, both of which make Directus answer a plain
 * `GET /items/<anything>` with a bare 500 for the role in question:
 *
 * 1. THE MISSING ALIASES (the one that actually breaks admin). Almost every
 *    policy scopes rows with `$CURRENT_USER.hoa_members.organization`. That path
 *    only resolves if `directus_users` exposes a reverse O2M alias named
 *    `hoa_members` — i.e. the `hoa_members.user` relation carries
 *    `meta.one_field = "hoa_members"`. It does not: the relation was created
 *    without a one_field, so the alias never existed and the whole filter blows
 *    up. Same story for `$CURRENT_USER.billing_account_members.billing_account`.
 *    This hits HOA Admin, HOA Member AND Property Manager — every non-admin
 *    role — so it is not demo-specific.
 *
 * 2. THE STALE `$CURRENT_USER.organization` ROWS. `directus_users` has no
 *    `organization` field either; membership lives in hoa_members. A few
 *    create-* scripts shipped that path and skipped-on-conflict, so re-running
 *    them never repaired it. Rewrite to the reverse relation (`_eq` becomes
 *    `_in` — a user can belong to several orgs).
 *
 * Run with: pnpm run fix:org-filters   (add --apply to write; default is a dry run)
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Idempotent: aliases that exist and rows already in the correct form are left
 * alone. The aliases are pure metadata — no table column is added or changed.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

/** The broken path and the reverse-relation path that replaces it. */
const BAD_PATH = "$CURRENT_USER.organization";
const GOOD_PATH = "$CURRENT_USER.hoa_members.organization";

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`, ...options.headers },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Rewrite every `$CURRENT_USER.organization` reference in a filter tree.
 *
 * `_eq` becomes `_in`: the reverse relation yields a LIST of org ids (a user can
 * belong to several), so equality would never match a multi-org user.
 */
function rewrite(node: any): { value: any; changed: boolean } {
  if (typeof node === "string") {
    return node === BAD_PATH ? { value: GOOD_PATH, changed: true } : { value: node, changed: false };
  }
  if (Array.isArray(node)) {
    let changed = false;
    const value = node.map((entry) => {
      const result = rewrite(entry);
      changed ||= result.changed;
      return result.value;
    });
    return { value, changed };
  }
  if (node && typeof node === "object") {
    let changed = false;
    const value: Record<string, any> = {};
    for (const [key, child] of Object.entries(node)) {
      // `{ _eq: "$CURRENT_USER.organization" }` → `{ _in: "...hoa_members.organization" }`
      if (key === "_eq" && child === BAD_PATH) {
        value._in = GOOD_PATH;
        changed = true;
        continue;
      }
      const result = rewrite(child);
      changed ||= result.changed;
      value[key] = result.value;
    }
    return { value, changed };
  }
  return { value: node, changed: false };
}

/**
 * Reverse O2M aliases that permission filters traverse from `$CURRENT_USER`.
 * `field` is the alias to expose on directus_users; `collection`/`relationField`
 * name the many-side FK that points back at the user.
 */
const REQUIRED_ALIASES = [
  { field: "hoa_members", collection: "hoa_members", relationField: "user", note: "org membership" },
  { field: "billing_account_members", collection: "billing_account_members", relationField: "user", note: "agency billing membership" },
] as const;

async function fieldExists(collection: string, field: string): Promise<boolean> {
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure one reverse alias exists on directus_users. Returns true if it was
 * missing (i.e. this run had something to repair).
 */
async function ensureAlias(alias: (typeof REQUIRED_ALIASES)[number]): Promise<boolean> {
  const relation = await directusFetch(`/relations/${alias.collection}/${alias.relationField}`);
  const oneField = relation?.data?.meta?.one_field;
  const hasField = await fieldExists("directus_users", alias.field);

  if (oneField === alias.field && hasField) {
    console.log(`   ✅ directus_users.${alias.field} (${alias.note}) already wired`);
    return false;
  }

  if (!APPLY) {
    console.log(`   🔍 directus_users.${alias.field} (${alias.note}) — missing alias, one_field=${JSON.stringify(oneField)}`);
    return true;
  }

  if (!hasField) {
    // Alias only: `type: "alias"` with `special: ["o2m"]` adds NO database column.
    await directusFetch("/fields/directus_users", {
      method: "POST",
      body: JSON.stringify({
        field: alias.field,
        type: "alias",
        schema: null,
        meta: {
          interface: "list-o2m",
          special: ["o2m"],
          // Nothing in the app edits memberships from the user form; keep the
          // Directus user detail page uncluttered.
          hidden: true,
          note: `Reverse of ${alias.collection}.${alias.relationField}. Required by permission filters that scope on $CURRENT_USER.${alias.field}.`,
        },
      }),
    });
  }
  if (oneField !== alias.field) {
    await directusFetch(`/relations/${alias.collection}/${alias.relationField}`, {
      method: "PATCH",
      body: JSON.stringify({ meta: { one_field: alias.field } }),
    });
  }
  console.log(`   ♻️  directus_users.${alias.field} (${alias.note}) wired`);
  return true;
}

async function main(): Promise<void> {
  console.log("🔧 Repairing org-scoped permission filters...\n");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  console.log(APPLY ? "   Mode: APPLY (writing changes)\n" : "   Mode: DRY RUN (pass --apply to write)\n");

  console.log("1️⃣  Reverse aliases on directus_users");
  let aliasesRepaired = 0;
  for (const alias of REQUIRED_ALIASES) {
    if (await ensureAlias(alias)) aliasesRepaired++;
  }

  console.log("\n2️⃣  Stale $CURRENT_USER.organization filters");

  const policies = await directusFetch("/policies?fields=id,name&limit=-1");
  const policyName = new Map<string, string>((policies?.data ?? []).map((p: any) => [p.id, p.name]));

  const permissions = await directusFetch(
    "/permissions?fields=id,policy,collection,action,permissions,validation&limit=-1"
  );

  let broken = 0;
  let repaired = 0;

  for (const permission of permissions?.data ?? []) {
    const patch: Record<string, any> = {};
    for (const field of ["permissions", "validation"] as const) {
      const result = rewrite(permission[field]);
      if (result.changed) patch[field] = result.value;
    }
    if (!Object.keys(patch).length) continue;

    broken++;
    const where = `${policyName.get(permission.policy) ?? permission.policy} · ${permission.collection}.${permission.action}`;
    if (!APPLY) {
      console.log(`   🔍 ${where}`);
      continue;
    }
    try {
      await directusFetch(`/permissions/${permission.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      repaired++;
      console.log(`   ♻️  ${where}`);
    } catch (error: any) {
      console.log(`   ❌ ${where}: ${error.message}`);
    }
  }

  if (!broken) console.log("   ✅ No permission rows reference $CURRENT_USER.organization.");
  else if (APPLY) console.log(`\n   ✅ Repaired ${repaired}/${broken} permission rows.`);
  else console.log(`\n   ⚠️  ${broken} permission rows need repair.`);

  if (!APPLY && (broken || aliasesRepaired)) {
    console.log("\n⚠️  Re-run with --apply to write these changes.");
    return;
  }
  if (APPLY && (repaired || aliasesRepaired)) {
    // Directus caches the resolved permission set; without this the old,
    // broken filters keep 500ing until the container restarts.
    await directusFetch("/utils/cache/clear", { method: "POST" });
    console.log("\n🧹 Cleared the Directus cache.");
  }
  console.log("\n✅ Done.");
}

main().catch((error: any) => {
  console.error("\n❌ Error:", error.message);
  console.error(error);
  process.exit(1);
});
