/**
 * A throwaway community for driving ONE real management transition end to end.
 *
 * The unit suite pins the plan and the executor. What it cannot tell you is
 * whether a human can actually complete a handover — whether the wizard shows
 * the right people, whether the writes land, whether the community keeps
 * working afterwards. That needs a real org with a real shape, so this builds
 * the awkward case on purpose:
 *
 *   Transition Test HOA
 *     billed through "Transition Test Agency" (no Stripe — nothing is charged)
 *     ├─ the demo user      HOA Admin, and ON the agency's roster  ← isAgencyStaff
 *     ├─ Dana Reyes         Property Manager, full-service grants
 *     └─ Nina Alvarez       Member, board president                ← the successor
 *     + Acme Property Management in the vendor list, no end date
 *
 * That is the state `add-property.post.ts` used to create and the board-admin
 * guarantee now prevents: the community's only administrator works for the
 * management company. The transition has to promote Nina before it takes
 * anything away, and it has to refuse if she is not there.
 *
 *   pnpm tsx --env-file=.env scripts/seed-transition-test-org.ts
 *   pnpm tsx --env-file=.env scripts/seed-transition-test-org.ts --cleanup
 *
 * Cleanup deletes the org (CASCADE takes the members, vendors and audit rows
 * with it) and the billing account. It is a test fixture, not a community —
 * never point this at a real slug.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL;

const ORG_SLUG = "transition-test";
const ORG_NAME = "Transition Test HOA";
const ACCOUNT_NAME = "Transition Test Agency";

if (!DIRECTUS_URL || !TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function dx(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${endpoint}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const qs = (o: Record<string, unknown>) =>
  "?" +
  Object.entries(o)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : encodeURIComponent(JSON.stringify(v))}`)
    .join("&");

async function roleId(name: string): Promise<string> {
  const r = await dx(`/roles${qs({ filter: { name: { _eq: name } }, fields: "id", limit: 1 })}`);
  const id = r?.data?.[0]?.id;
  if (!id) throw new Error(`Role not found: ${name}`);
  return id;
}

async function findOrg(): Promise<any | null> {
  const r = await dx(
    `/items/hoa_organizations${qs({ filter: { slug: { _eq: ORG_SLUG } }, fields: "id,name,slug", limit: 1 })}`
  );
  return r?.data?.[0] ?? null;
}

async function findAccount(): Promise<any | null> {
  const r = await dx(
    `/items/billing_accounts${qs({ filter: { name: { _eq: ACCOUNT_NAME } }, fields: "id,name", limit: 1 })}`
  );
  return r?.data?.[0] ?? null;
}

async function cleanup() {
  console.log("🧹 Removing the transition test fixture\n");
  const org = await findOrg();
  if (org) {
    await dx(`/items/hoa_organizations/${org.id}`, { method: "DELETE" });
    console.log(`   ✅ Deleted org ${org.name} (${org.id})`);
  } else {
    console.log("   ⏭️  No test org found");
  }

  const account = await findAccount();
  if (account) {
    const members = await dx(
      `/items/billing_account_members${qs({ filter: { billing_account: { _eq: account.id } }, fields: "id", limit: -1 })}`
    );
    for (const m of members?.data ?? []) {
      await dx(`/items/billing_account_members/${m.id}`, { method: "DELETE" });
    }
    await dx(`/items/billing_accounts/${account.id}`, { method: "DELETE" });
    console.log(`   ✅ Deleted billing account ${account.name} (${account.id})`);
  } else {
    console.log("   ⏭️  No test billing account found");
  }
  console.log("\n✅ Done.");
}

async function seed() {
  console.log("🌱 Seeding the transition test fixture\n");

  if (await findOrg()) {
    console.error(`❌ /${ORG_SLUG} already exists. Run with --cleanup first.`);
    process.exit(1);
  }
  if (!DEMO_EMAIL) {
    console.error("❌ DEMO_USER_EMAIL is not set — the wizard needs a session to drive it with.");
    process.exit(1);
  }

  const [hoaAdminRole, pmRole, memberRole] = await Promise.all([
    roleId("HOA Admin"),
    roleId("Property Manager"),
    roleId("HOA Member"),
  ]);

  const demoUser = (
    await dx(`/users${qs({ filter: { email: { _eq: DEMO_EMAIL } }, fields: "id,email", limit: 1 })}`)
  )?.data?.[0];
  if (!demoUser) throw new Error(`Demo user ${DEMO_EMAIL} not found — run pnpm seed:demo first`);

  // 1. The agency, with no Stripe subscription: seat syncing mirrors the count
  //    and charges nothing (see syncBillingAccountSeats).
  const account = (
    await dx(`/items/billing_accounts`, {
      method: "POST",
      body: JSON.stringify({
        name: ACCOUNT_NAME,
        status: "active",
        subscription_status: "active",
        owner: demoUser.id,
        seats_purchased: 1,
      }),
    })
  ).data;
  console.log(`   ✅ Billing account ${account.id}`);

  await dx(`/items/billing_account_members`, {
    method: "POST",
    body: JSON.stringify({ billing_account: account.id, user: demoUser.id, role: "owner" }),
  });
  console.log("   ✅ Demo user is on the agency roster (this is what makes them agency staff)");

  // 2. The community, billed through the agency. Its own status is `canceled`
  //    because it has never had its own subscription — entitlement resolves up
  //    to the account until the moment it is detached.
  const org = (
    await dx(`/items/hoa_organizations`, {
      method: "POST",
      body: JSON.stringify({
        name: ORG_NAME,
        slug: ORG_SLUG,
        status: "active",
        city: "Miami Beach",
        state: "FL",
        billing_account: account.id,
        subscription_status: "canceled",
        is_free_account: false,
      }),
    })
  ).data;
  console.log(`   ✅ Organization ${org.id} → /${ORG_SLUG}`);

  // 3a. The agency's admin seat on the community — the lock-in this phase exists
  //     to undo.
  const agencyMember = (
    await dx(`/items/hoa_members`, {
      method: "POST",
      body: JSON.stringify({
        user: demoUser.id,
        organization: org.id,
        role: hoaAdminRole,
        first_name: "Agency",
        last_name: "Admin",
        email: demoUser.email,
        member_type: "owner",
        status: "active",
      }),
    })
  ).data;
  console.log(`   ✅ Agency HOA Admin member ${agencyMember.id}`);

  // 3b. The property manager, with everything switched on.
  const pm = (
    await dx(`/items/hoa_members`, {
      method: "POST",
      body: JSON.stringify({
        organization: org.id,
        role: pmRole,
        first_name: "Dana",
        last_name: "Reyes",
        email: "dana@transition-test.example",
        member_type: "owner",
        status: "active",
        manager_permissions: {
          inquiries: true,
          violations: true,
          directory: true,
          documents: true,
          communications: true,
          projects: true,
          activity: true,
        },
      }),
    })
  ).data;
  console.log(`   ✅ Property manager ${pm.id} (full-service grants)`);

  // 3c. The board president — the only person the plan can hand the account to.
  const board = (
    await dx(`/items/hoa_members`, {
      method: "POST",
      body: JSON.stringify({
        organization: org.id,
        role: memberRole,
        first_name: "Nina",
        last_name: "Alvarez",
        email: "nina@transition-test.example",
        member_type: "owner",
        status: "active",
      }),
    })
  ).data;
  await dx(`/items/hoa_board_members`, {
    method: "POST",
    body: JSON.stringify({
      hoa_member: board.id,
      title: "president",
      status: "published",
      term_start: "2026-01-01",
    }),
  });
  console.log(`   ✅ Board president ${board.id} (Nina Alvarez)`);

  // 4. The management company in the community's own vendor list, still current.
  await dx(`/items/hoa_vendors`, {
    method: "POST",
    body: JSON.stringify({
      organization: org.id,
      category: "management",
      company: "Acme Property Management",
      name: "Dana Reyes",
      email: "dana@transition-test.example",
      status: "active",
      active_since: "2024-03-01",
      management_role: "general",
      show_to_members: true,
    }),
  });
  console.log("   ✅ Management vendor (Acme Property Management), no end date");

  console.log(`\n✅ Seeded. Sign in with the demo login, then open:`);
  console.log(`   /${ORG_SLUG}/admin/settings/property-management → Transition`);
  console.log(`\n   org=${org.id}  account=${account.id}  successor=${board.id}`);
}

const run = process.argv.includes("--cleanup") ? cleanup : seed;
run().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
