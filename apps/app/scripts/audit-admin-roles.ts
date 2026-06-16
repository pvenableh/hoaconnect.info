/**
 * Audit (and optionally fix) Directus users wrongly assigned the HOA Admin role.
 *
 * register.post.ts used to hardcode the HOA Admin role id for every self-signup
 * (a privilege-escalation bug, now fixed to assign Member). This finds users who
 * hold the HOA Admin Directus role but are NOT a genuine admin anywhere
 * (no hoa_members record with an admin role), i.e. escalated self-signups, and
 * with --fix downgrades them to the Member role.
 *
 *   pnpm run audit:admin-roles          # report only (safe, read-only)
 *   pnpm run audit:admin-roles -- --fix # downgrade the flagged users to Member
 *
 * Safety: App Administrators are never touched (different role). A small
 * allowlist of emails is never downgraded. Users with a genuine admin
 * hoa_members record are treated as legitimate and skipped.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const HOA_ADMIN_ROLE =
  process.env.NUXT_PUBLIC_DIRECTUS_ROLE_HOA_ADMIN || "38494e81-9b49-4c64-a197-fcb8097cd433";
const APP_ADMIN_ROLE =
  process.env.NUXT_PUBLIC_DIRECTUS_ROLE_APP_ADMIN || "c4903b32-db6f-4479-a627-55be7f328321";
const MEMBER_ROLE =
  process.env.NUXT_PUBLIC_DIRECTUS_ROLE_MEMBER || "558b04ed-fdcc-48c2-9cd0-977cccf988b9";

// Never downgrade these, even if flagged.
const PROTECT_EMAILS = new Set(["peter@huestudios.com"]);

const FIX = process.argv.includes("--fix");

async function df(endpoint: string, options: RequestInit = {}): Promise<any> {
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

async function main(): Promise<void> {
  console.log(`🔐 Auditing HOA Admin role assignments${FIX ? " (FIX MODE)" : " (report only)"}\n`);

  // 1) Users holding the HOA Admin Directus role.
  const adminUsers =
    (await df(
      `/users?filter[role][_eq]=${HOA_ADMIN_ROLE}&fields=id,email,first_name,last_name,status&limit=-1`
    ))?.data || [];

  // 2) Genuine admins: users with an hoa_members record whose role is admin.
  const adminMembers =
    (await df(
      `/items/hoa_members?filter[role][_in]=${HOA_ADMIN_ROLE},${APP_ADMIN_ROLE}&fields=user&limit=-1`
    ))?.data || [];
  const legitAdminUserIds = new Set(
    adminMembers
      .map((m: any) => (typeof m.user === "object" ? m.user?.id : m.user))
      .filter(Boolean)
  );

  // 3) Any hoa_members at all, per user (context for the report).
  const allMembers =
    (await df(`/items/hoa_members?fields=user,organization,status,role&limit=-1`))?.data || [];
  const membershipsByUser = new Map<string, any[]>();
  for (const m of allMembers) {
    const uid = typeof m.user === "object" ? m.user?.id : m.user;
    if (!uid) continue;
    if (!membershipsByUser.has(uid)) membershipsByUser.set(uid, []);
    membershipsByUser.get(uid)!.push(m);
  }

  const candidates = adminUsers.filter(
    (u: any) => !legitAdminUserIds.has(u.id) && !PROTECT_EMAILS.has((u.email || "").toLowerCase())
  );
  const legit = adminUsers.filter((u: any) => legitAdminUserIds.has(u.id));

  console.log(`Users with HOA Admin role: ${adminUsers.length}`);
  console.log(`  • Legitimate (have an admin membership): ${legit.length}`);
  console.log(`  • Flagged (no admin membership → likely self-signup): ${candidates.length}\n`);

  if (!candidates.length) {
    console.log("✅ Nothing to fix — no escalated self-signups found.");
    return;
  }

  for (const u of candidates) {
    const memberships = membershipsByUser.get(u.id) || [];
    console.log(
      `  ⚠️  ${u.email || u.id} (${[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}) · status=${u.status} · memberships=${memberships.length}`
    );
  }

  if (!FIX) {
    console.log(`\nℹ️  Report only. Re-run with \`-- --fix\` to downgrade these ${candidates.length} user(s) to Member.`);
    return;
  }

  console.log(`\n🛠  Downgrading ${candidates.length} user(s) to Member...`);
  let fixed = 0;
  for (const u of candidates) {
    try {
      await df(`/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: MEMBER_ROLE }),
      });
      console.log(`   ✅ ${u.email || u.id} → Member`);
      fixed++;
    } catch (e: any) {
      console.warn(`   ❌ ${u.email || u.id}: ${e.message}`);
    }
  }
  console.log(`\nDone. Downgraded ${fixed}/${candidates.length}.`);
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});
