/**
 * Member management, Phase 1 — invitations carry residency.
 *
 * Adds `hoa_invitations.member_type` (`owner` | `tenant`), mirroring
 * `hoa_members.member_type` exactly so the value can be copied straight across
 * on accept.
 *
 * Why this field has to exist: `accept-invitation.post.ts` currently writes
 *
 *     member_type: "owner", // Default to owner, can be changed later
 *
 * for EVERY invitee, because the invitation has nowhere to carry the real
 * answer. Role is already carried and applied correctly; residency was the one
 * value being fabricated. 1033 Lenox alone has 22 known tenants who would each
 * be recorded as an owner on accept.
 *
 * Nullable with no default, on purpose. An existing pending invitation has no
 * residency and must not be given a fake one — `accept-invitation` keeps its
 * `owner` fallback for exactly that case, and says so. New invitations set it
 * explicitly.
 *
 * `hoa_invitations` permissions are all `fields: ["*"]`, so this needs no
 * permission change.
 *
 * ⚠️ `hoa_invitations` holds acceptance tokens in cleartext. It must never gain
 * a public read grant — `pnpm run audit:public-policy` guards that and now runs
 * daily in CI.
 *
 * Idempotent: the field is created only when absent.
 *
 * Run with: pnpm add:invitation-member-type
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

async function ensureMemberType(): Promise<void> {
  console.log("\n🏠 hoa_invitations.member_type");
  let exists = false;
  try {
    await directusFetch("/fields/hoa_invitations/member_type");
    exists = true;
  } catch {
    exists = false;
  }
  if (exists) {
    console.log("   ⏭️  member_type already exists, skipping");
    return;
  }
  await directusFetch("/fields/hoa_invitations", {
    method: "POST",
    body: JSON.stringify({
      field: "member_type",
      type: "string",
      // Mirrors hoa_members.member_type: nullable string, max_length 255,
      // no default. Same shape means the value copies across without coercion.
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
        note: "Residency the invitee is being invited as. Copied to hoa_members.member_type on accept; null falls back to owner there.",
      },
    }),
  });
  console.log("   ✅ Created member_type");
}

async function main(): Promise<void> {
  console.log("🚀 Invitations carry residency (Member management, Phase 1)...");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await ensureMemberType();
    console.log("\n✅ Done. Remember to run: pnpm generate:types");
  } catch (error: any) {
    console.error("\n❌ Failed:", error.message);
    process.exit(1);
  }
}

main();
