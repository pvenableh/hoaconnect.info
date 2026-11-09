/**
 * The **Platform Support** Directus role (docs/plan-operator-console.md §6, §9.2).
 *
 * HOA Connect staff who read the operator console (/ops) and work the support
 * inbox, with no money actions. Everything they see comes through the app's
 * `/api/ops/*` routes, which check this role's id on the server
 * (`requireOpsPermission`) and read with the admin token. So the role itself is
 * given NO collection access in Directus:
 *
 *  - One policy, `app_access: true`, `admin_access: false`, no permissions.
 *    `app_access` is what lets Directus answer `/users/me` for the user (its
 *    minimal app permissions), which the app's sign-in needs. It grants no
 *    collection; in Data Studio they see an empty app.
 *  - Fixed UUIDs, so nuxt.config (`directusRolePlatformSupport`) can name the
 *    role without an environment variable.
 *
 * Read-only by default: prints what exists and what it would create.
 *   pnpm run create:platform-support            # look
 *   pnpm run create:platform-support -- --apply # create (hosted Directus: Peter's yes first)
 *
 * Idempotent. It never edits or deletes an existing role or policy; if one with
 * these ids exists but looks different, it says so and stops.
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const APPLY = process.argv.includes("--apply");

// Keep in sync with core/nuxt.config.ts (directusRolePlatformSupport).
export const PLATFORM_SUPPORT_ROLE = "85410c80-18b7-40eb-b066-4393b969add4";
export const PLATFORM_SUPPORT_POLICY = "2179dbbd-42ef-497f-9ea3-2ab8699c0893";

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("Missing DIRECTUS_URL or DIRECTUS_STATIC_TOKEN");
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
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status} on ${endpoint}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const q = (filter: unknown) => encodeURIComponent(JSON.stringify(filter));

async function main() {
  console.log(`Directus: ${new URL(DIRECTUS_URL!).host} · ${APPLY ? "APPLY" : "read-only (pass --apply to create)"}`);

  const policy = (await directusFetch(`/policies/${PLATFORM_SUPPORT_POLICY}?fields=id,admin_access,app_access`))?.data;
  const role = (await directusFetch(`/roles/${PLATFORM_SUPPORT_ROLE}?fields=id,name`))?.data;
  const sameName = (await directusFetch(`/roles?filter=${q({ name: { _eq: "Platform Support" } })}&fields=id`))?.data ?? [];

  if (policy && (policy.admin_access !== false || policy.app_access !== true)) {
    console.error("Policy exists with different access flags. Stopping; fix it in Data Studio.");
    process.exit(1);
  }
  const otherSameName = sameName.filter((r: { id: string }) => r.id !== PLATFORM_SUPPORT_ROLE);
  if (otherSameName.length) {
    console.error(`${otherSameName.length} other role(s) already named "Platform Support". Stopping.`);
    process.exit(1);
  }

  const permissions = policy
    ? (await directusFetch(`/permissions?filter=${q({ policy: { _eq: PLATFORM_SUPPORT_POLICY } })}&aggregate[count]=*`))?.data?.[0]?.count ?? "?"
    : 0;
  const linked = policy && role
    ? ((await directusFetch(`/access?filter=${q({ role: { _eq: PLATFORM_SUPPORT_ROLE }, policy: { _eq: PLATFORM_SUPPORT_POLICY } })}&fields=id&limit=1`))?.data?.length ?? 0) > 0
    : false;

  console.log(`policy: ${policy ? "exists" : "missing"} · permissions on it: ${permissions}`);
  console.log(`role:   ${role ? "exists" : "missing"} · linked to policy: ${linked}`);
  if (Number(permissions) > 0) console.warn("The policy has collection permissions. Platform Support should have none.");

  if (!APPLY) return;

  if (!policy) {
    await directusFetch("/policies", {
      method: "POST",
      body: JSON.stringify({
        id: PLATFORM_SUPPORT_POLICY,
        name: "Platform Support Policy",
        icon: "support_agent",
        description: "HOA Connect staff. No collection access: the app's /api/ops routes do the reading.",
        admin_access: false,
        app_access: true,
      }),
    });
    console.log("created policy");
  }
  if (!role) {
    await directusFetch("/roles", {
      method: "POST",
      body: JSON.stringify({
        id: PLATFORM_SUPPORT_ROLE,
        name: "Platform Support",
        icon: "support_agent",
        description: "HOA Connect staff: read-only operator console and the support inbox. No money actions.",
      }),
    });
    console.log("created role");
  }
  if (!linked) {
    await directusFetch("/access", {
      method: "POST",
      body: JSON.stringify({ role: PLATFORM_SUPPORT_ROLE, policy: PLATFORM_SUPPORT_POLICY }),
    });
    console.log("linked policy to role");
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
