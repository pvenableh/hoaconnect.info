/**
 * Member management, Phase 2 — residency on the unit link, and stop dropping `unitId`.
 *
 * Adds two fields:
 *
 *   1. `hoa_member_units.member_type` (`owner` | `tenant`)
 *      Residency belongs on the LINK, not on the person: someone can own one
 *      unit and rent another, and the junction already carries the
 *      move-in/move-out window (`start_date` / `end_date`) that makes
 *      "owner of #302 until March" expressible at all.
 *
 *   2. `hoa_invitations.unit` (M2O → `hoa_units`)
 *      `InviteMemberForm.vue` has always sent a `unitId` and
 *      `invite-member.post.ts` has always thrown it away — the same bug shape
 *      as Phase 1's `personType`. The invitation needs somewhere to park it so
 *      `accept-invitation` can create the unit link with the right residency.
 *
 * Both nullable with no default, on purpose — same reasoning as Phase 1's
 * `hoa_invitations.member_type`. An existing link has no recorded residency and
 * must not be handed a fabricated one; `residencyFor()` falls back to
 * `hoa_members.member_type` for exactly that case.
 *
 * ⚠️ Why the fallback is not optional: 605 Lincoln Road is LIVE with 33 active
 * members and ZERO unit links, and both demo orgs have none either. Only 1033
 * Lenox (55 of 59 active) and 11 Lincoln are linked at all. A clean cutover to
 * junction-only residency would blank residency for 40+ real members.
 *
 * ⚠️ Directus does NOT enforce `choices` — proved on production, a write of
 * member_type "COMPLETE-GARBAGE" was accepted. The dropdown is a UI affordance;
 * `normalizeResidency()` server-side is the only real guard.
 *
 * ⚠️ `hoa_invitations` holds acceptance tokens in cleartext. It must never gain
 * a public read grant — `pnpm run audit:public-policy` guards that daily in CI.
 *
 * Idempotent: each field and relation is created only when absent.
 *
 * Run with: pnpm add:unit-link-residency
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin token). Then run
 * `pnpm generate:types`.
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
  if (response.status === 204) return null;
  return response.json();
}

async function fieldExists(collection: string, field: string): Promise<boolean> {
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    return true;
  } catch {
    return false;
  }
}

async function ensureUnitLinkMemberType(): Promise<void> {
  console.log("\n🏠 hoa_member_units.member_type");
  if (await fieldExists("hoa_member_units", "member_type")) {
    console.log("   ⏭️  member_type already exists, skipping");
    return;
  }
  await directusFetch("/fields/hoa_member_units", {
    method: "POST",
    body: JSON.stringify({
      field: "member_type",
      type: "string",
      // Mirrors hoa_members.member_type and hoa_invitations.member_type
      // exactly: nullable string, max_length 255, no default. Same shape means
      // the value copies between all three without coercion.
      schema: { is_nullable: true, default_value: null, max_length: 255 },
      meta: {
        interface: "select-dropdown",
        options: {
          choices: [
            { text: "Owner", value: "owner" },
            { text: "Tenant", value: "tenant" },
          ],
        },
        width: "half",
        note: "Residency on THIS unit. Preferred over hoa_members.member_type by residencyFor(); null falls back to the member's own value while unit links are still being filled in.",
      },
    }),
  });
  console.log("   ✅ Created member_type");
}

async function ensureInvitationUnit(): Promise<void> {
  console.log("\n🏢 hoa_invitations.unit");
  if (await fieldExists("hoa_invitations", "unit")) {
    console.log("   ⏭️  unit already exists, skipping");
  } else {
    await directusFetch("/fields/hoa_invitations", {
      method: "POST",
      body: JSON.stringify({
        field: "unit",
        type: "uuid",
        schema: { is_nullable: true, default_value: null },
        meta: {
          interface: "select-dropdown-m2o",
          display: "related-values",
          width: "half",
          note: "The unit this person is being invited to. Used to create their hoa_member_units link on accept. Optional — an invitation with no unit still works.",
        },
      }),
    });
    console.log("   ✅ Created unit");
  }

  // ON DELETE SET NULL, not CASCADE: deleting a unit must not silently delete
  // a pending invitation and with it the recipient's only acceptance token.
  try {
    await directusFetch("/relations", {
      method: "POST",
      body: JSON.stringify({
        collection: "hoa_invitations",
        field: "unit",
        related_collection: "hoa_units",
        schema: { on_delete: "SET NULL" },
      }),
    });
    console.log("   ✅ Created relation hoa_invitations.unit → hoa_units");
  } catch (e: any) {
    if (/already|409/i.test(e.message)) {
      console.log("   ⏭️  relation already exists, skipping");
    } else {
      throw e;
    }
  }
}

async function main(): Promise<void> {
  console.log("🚀 Residency on the unit link (Member management, Phase 2)...");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await ensureUnitLinkMemberType();
    await ensureInvitationUnit();
    console.log("\n✅ Done. Remember to run: pnpm generate:types");
  } catch (error: any) {
    console.error("\n❌ Failed:", error.message);
    process.exit(1);
  }
}

main();
