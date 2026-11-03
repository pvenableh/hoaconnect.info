/**
 * Email compliance fields (Earnest parity round 3, Phase 3a) — ONE idempotent
 * script for all of them:
 *
 *   hoa_members.email_community_opt_out        boolean, default false
 *   hoa_members.email_community_opt_out_at     timestamp
 *   hoa_members.email_community_opt_out_source link | one_click | spam | admin
 *   hoa_members.email_bounced                  boolean, default false
 *   hoa_members.email_bounced_at               timestamp
 *   hoa_members.email_bounced_reason           string
 *   hoa_members.unsubscribe_token              string, UNIQUE (the lookup index); hidden
 *   hoa_emails.email_class                     essential | community (null = the type's default)
 *
 * And one permission change, because the token is a credential: every
 * non-admin-access policy's READ permission on hoa_members is narrowed to
 * "every field except these seven". Before this, the HOA Member, HOA Admin and
 * Property Manager policies read hoa_members with `*`, which would hand every
 * resident their neighbours' unsubscribe tokens (and bounce status) through the
 * items proxy. The app never reads these fields with a user's token — only in
 * server routes with the admin token — so nothing in the app loses anything.
 * The narrowed list is today's fields; a field added later must be added to
 * those policies explicitly (fail closed). Create/update permissions are left
 * alone.
 *
 * Until this runs the app degrades (core/server/utils/email-compliance.ts):
 * sends go out without suppression or a List-Unsubscribe header, the
 * preference reads say `available: false`, and the writes 503.
 *
 * Run with: pnpm add:email-compliance   (then `pnpm generate:types` — expect no
 * diff on these fields; they were hand-added to core/types/directus.ts with
 * these exact notes)
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL and/or DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function api(endpoint: string, options: RequestInit = {}): Promise<any> {
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

async function fieldExists(collection: string, field: string): Promise<boolean> {
  try {
    await api(`/fields/${collection}/${field}`);
    return true;
  } catch {
    return false;
  }
}

async function ensureField(collection: string, def: Record<string, any>): Promise<void> {
  if (await fieldExists(collection, def.field)) {
    console.log(`   ⏭️  ${collection}.${def.field} exists`);
    return;
  }
  await api(`/fields/${collection}`, { method: "POST", body: JSON.stringify(def) });
  console.log(`   ✅ ${collection}.${def.field}`);
}

const MEMBER_FIELDS: Array<Record<string, any>> = [
  {
    field: "email_community_opt_out",
    type: "boolean",
    schema: { default_value: false, is_nullable: true },
    meta: {
      interface: "boolean",
      special: ["cast-boolean"],
      width: "half",
      note: "Opted out of community email (newsletters, announcements). Essential mail — dues, meetings, governance — still arrives.",
    },
  },
  {
    field: "email_community_opt_out_at",
    type: "timestamp",
    schema: { is_nullable: true },
    meta: { interface: "datetime", readonly: true, width: "half", note: "When the member opted out of community email." },
  },
  {
    field: "email_community_opt_out_source",
    type: "string",
    schema: { is_nullable: true, max_length: 32 },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      readonly: true,
      width: "half",
      options: {
        choices: [
          { text: "Unsubscribe page", value: "link" },
          { text: "One-click unsubscribe", value: "one_click" },
          { text: "Spam report", value: "spam" },
          { text: "Admin", value: "admin" },
        ],
      },
      note: "Where the opt-out came from: the unsubscribe page, a one-click unsubscribe, a spam report, or an admin.",
    },
  },
  {
    field: "email_bounced",
    type: "boolean",
    schema: { default_value: false, is_nullable: true },
    meta: {
      interface: "boolean",
      special: ["cast-boolean"],
      width: "half",
      note: "The address hard-bounced. No email is sent to it until an admin clears this on the Members page.",
    },
  },
  {
    field: "email_bounced_at",
    type: "timestamp",
    schema: { is_nullable: true },
    meta: { interface: "datetime", readonly: true, width: "half", note: "When the address bounced." },
  },
  {
    field: "email_bounced_reason",
    type: "string",
    schema: { is_nullable: true, max_length: 255 },
    meta: { interface: "input", readonly: true, width: "full", note: "The bounce classification and SendGrid's reason." },
  },
  {
    field: "unsubscribe_token",
    type: "string",
    // Unique: the one-click route looks members up by it, and two rows sharing
    // a token would make an unsubscribe ambiguous (the route refuses that).
    schema: { is_nullable: true, is_unique: true, max_length: 64 },
    meta: {
      interface: "input",
      hidden: true,
      readonly: true,
      width: "full",
      note: "Credential in this member's unsubscribe links: 24 random bytes, base64url. Minted at send time; never shown in the app.",
    },
  },
];

const SENSITIVE = MEMBER_FIELDS.map((f) => f.field as string);

const EMAIL_CLASS_FIELD = {
  field: "email_class",
  type: "string",
  schema: { is_nullable: true, max_length: 16 },
  meta: {
    interface: "select-dropdown",
    display: "labels",
    width: "half",
    options: {
      choices: [
        { text: "Essential", value: "essential" },
        { text: "Community", value: "community" },
      ],
    },
    note: "essential: dues, meetings, governance — cannot be unsubscribed. community: newsletters, announcements — members can opt out. A newsletter is always community.",
  },
};

async function narrowMemberReadPermissions(): Promise<void> {
  const fields = ((await api("/fields/hoa_members"))?.data || []).map((f: any) => f.field as string);
  const keep = fields.filter((f: string) => !SENSITIVE.includes(f));
  const perms =
    (
      await api(
        "/permissions?filter[collection][_eq]=hoa_members&filter[action][_eq]=read&fields=id,fields,policy.name,policy.admin_access&limit=-1"
      )
    )?.data || [];

  for (const p of perms) {
    const name = p.policy?.name || "(no policy)";
    if (p.policy?.admin_access) {
      console.log(`   ⏭️  ${name}: admin access, untouched`);
      continue;
    }
    const current: string[] = Array.isArray(p.fields) ? p.fields : [];
    const next = current.includes("*") ? keep : current.filter((f) => !SENSITIVE.includes(f));
    const same = next.length === current.length && next.every((f, i) => f === current[i]);
    if (same) {
      console.log(`   ⏭️  ${name}: already excludes the email fields`);
      continue;
    }
    await api(`/permissions/${p.id}`, { method: "PATCH", body: JSON.stringify({ fields: next }) });
    console.log(`   ✅ ${name}: read narrowed to ${next.length} fields (was ${current.includes("*") ? "*" : current.length})`);
  }
}

async function main() {
  console.log("✉️  Email compliance fields (Phase 3a)\n");

  console.log("hoa_members:");
  for (const def of MEMBER_FIELDS) await ensureField("hoa_members", def);

  console.log("\nhoa_emails:");
  await ensureField("hoa_emails", EMAIL_CLASS_FIELD);

  console.log("\nhoa_members read permissions (non-admin policies):");
  await narrowMemberReadPermissions();

  console.log("\n✅ Done. Run `pnpm generate:types` to refresh Directus types.");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
