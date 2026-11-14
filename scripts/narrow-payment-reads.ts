/**
 * Narrow the HOA Member policy's READ on charges, recurring charges and
 * transactions to the member's OWN rows (plan decision 16; Session 2 operator
 * TODO 1).
 *
 * Until now the Member policy read `payment_requests`, `payment_schedules` and
 * `payment_transactions` with the org-wide filter, so any member could read
 * every charge in their community straight from the Directus API. The app no
 * longer needs that: org-wide money is read only through server routes that
 * check `money:read` (/api/org/money/*, /api/org/expenses), and a member's own
 * Payments page and home read only their own rows. So the Member read becomes
 * `member.user = $CURRENT_USER`, the filter `payment_methods` already uses.
 *
 * Touches only the HOA Member policy's `read` rows on those three collections.
 * Admin policies are untouched. Every other policy that can read them is LISTED
 * (not changed) so the operator can decide.
 *
 * DRY RUN BY DEFAULT. Prints what it would change; `--apply` writes it.
 * Idempotent: a policy already narrowed is reported and left alone.
 *
 *   pnpm narrow:payment-reads            # dry run
 *   pnpm narrow:payment-reads --apply    # write
 *
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin token).
 */
const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const APPLY = process.argv.includes("--apply");

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL or DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

export const PAYMENT_READ_COLLECTIONS = ["payment_requests", "payment_schedules", "payment_transactions"] as const;
export const OWN_ROWS_FILTER = { member: { user: { _eq: "$CURRENT_USER" } } } as const;

async function api(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${endpoint}: ${await res.text()}`);
  if (res.status === 204) return null;
  return (await res.json()).data;
}

const q = (o: unknown) => encodeURIComponent(JSON.stringify(o));
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function memberPolicyId(): Promise<string> {
  const roles = await api(`/roles?filter=${q({ name: { _eq: "HOA Member" } })}&fields=id,name&limit=1`);
  if (!roles?.[0]) throw new Error("HOA Member role not found");
  const access = await api(`/access?filter=${q({ role: { _eq: roles[0].id } })}&fields=id,policy&limit=5`);
  const ids = (access || []).map((a: any) => (typeof a.policy === "string" ? a.policy : a.policy?.id)).filter(Boolean);
  if (ids.length !== 1) throw new Error(`Expected one HOA Member policy, found ${ids.length}: ${ids.join(", ")}`);
  return ids[0];
}

async function main() {
  console.log(APPLY ? "✍️  APPLY — writing changes" : "🔎 DRY RUN — nothing is written (pass --apply to write)");
  const memberPolicy = await memberPolicyId();
  const policies = await api(`/policies?fields=id,name,admin_access&limit=-1`);
  const policyName = new Map<string, string>((policies || []).map((p: any) => [p.id, p.name]));
  const adminPolicies = new Set<string>((policies || []).filter((p: any) => p.admin_access).map((p: any) => p.id));
  console.log(`   HOA Member policy: ${policyName.get(memberPolicy) ?? "?"} (${memberPolicy})`);

  let changed = 0;
  for (const collection of PAYMENT_READ_COLLECTIONS) {
    const rows = await api(
      `/permissions?filter=${q({ collection: { _eq: collection }, action: { _eq: "read" } })}&fields=id,policy,permissions,fields&limit=-1`
    );
    console.log(`\n📄 ${collection}: ${rows?.length ?? 0} read permission(s)`);
    let memberRows = 0;
    for (const row of rows || []) {
      const pid = typeof row.policy === "string" ? row.policy : row.policy?.id;
      const label = `${policyName.get(pid) ?? pid}`;
      if (pid !== memberPolicy) {
        const note = adminPolicies.has(pid) ? "admin access — left alone" : "NOT CHANGED — review";
        console.log(`   · ${label}: ${JSON.stringify(row.permissions)}  (${note})`);
        continue;
      }
      memberRows++;
      if (same(row.permissions, OWN_ROWS_FILTER)) {
        console.log(`   ✓ ${label}: already own rows`);
        continue;
      }
      console.log(`   → ${label}: ${JSON.stringify(row.permissions)}`);
      console.log(`     becomes   ${JSON.stringify(OWN_ROWS_FILTER)}`);
      if (APPLY) {
        await api(`/permissions/${row.id}`, { method: "PATCH", body: JSON.stringify({ permissions: OWN_ROWS_FILTER }) });
        console.log("     ✅ written");
      }
      changed++;
    }
    if (!memberRows) console.log("   (the HOA Member policy has no read here: nothing to narrow)");
  }

  console.log(
    `\n${APPLY ? "Done" : "Dry run done"}: ${changed} HOA Member read permission(s) ${APPLY ? "narrowed" : "would be narrowed"}.`
  );
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
