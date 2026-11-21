/**
 * One demo login per role on the Harborview Lofts demo community (slug `demo`)
 * so each role home in docs/plan-unified-experience.md §5 can be looked at:
 * tenant, owner, board member, team member, property manager. The admin login
 * is the existing demo admin (scripts/seed-demo.ts) and is not touched here.
 *
 * DEMO DATA ONLY. These accounts live in the demo community, hold no real
 * person's data, and their passwords below are throwaway values.
 *
 * Idempotent: a user, membership, board term or grant that is there is kept; a
 * password is reset to the one below.
 *
 * Target: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN. Run: pnpm tsx scripts/seed-demo-roles.ts [--dry]
 */
const DEMO_SLUG = "demo";
const DOMAIN = "hoaconnect.info";

type Persona = {
  key: "tenant" | "owner" | "board" | "team" | "manager";
  first: string;
  last: string;
  password: string;
  member_type: "tenant" | "owner" | null;
  directusRole: "HOA Member" | "Property Manager";
};

export const PERSONAS: Persona[] = [
  { key: "tenant", first: "Tessa", last: "Tenant", password: "IPnjkRvXWOLUBp43Aa1!", member_type: "tenant", directusRole: "HOA Member" },
  { key: "owner", first: "Owen", last: "Owner", password: "rNv5btf0g7iU2jHaAa1!", member_type: "owner", directusRole: "HOA Member" },
  { key: "board", first: "Bea", last: "Board", password: "2pFAUMQtk5dnEOnvAa1!", member_type: "owner", directusRole: "HOA Member" },
  { key: "team", first: "Terry", last: "Team", password: "lgBXzIrpn8nWw3NtAa1!", member_type: "owner", directusRole: "HOA Member" },
  { key: "manager", first: "Max", last: "Manager", password: "Z3FJENmiACP670OWAa1!", member_type: null, directusRole: "Property Manager" },
];

const email = (p: Persona) => `demo-${p.key}@${DOMAIN}`;
const url = process.env.DIRECTUS_URL;
const token = process.env.DIRECTUS_STATIC_TOKEN;
const dry = process.argv.includes("--dry");
if (!url || !token) {
  console.error("Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

async function dx(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}
const q = (f: unknown) => encodeURIComponent(JSON.stringify(f));
const first = async (coll: string, filter: unknown, fields = "id") =>
  (await dx(`/items/${coll}?filter=${q(filter)}&fields=${fields}&limit=1`)).data?.[0] ?? null;
const write = async (label: string, method: string, path: string, body: unknown) => {
  console.log(`${dry ? "(dry) " : ""}+ ${label}`);
  return dry ? { data: { id: "DRY" } } : dx(path, { method, body: JSON.stringify(body) });
};

async function main() {
  const org = (await dx(`/items/hoa_organizations?filter=${q({ slug: { _eq: DEMO_SLUG } })}&fields=id,name&limit=1`)).data?.[0];
  if (!org) throw new Error("demo community not found");
  const roles = (await dx(`/roles?fields=id,name&limit=50`)).data as Array<{ id: string; name: string }>;
  const roleId = (n: string) => {
    const r = roles.find((x) => x.name === n);
    if (!r) throw new Error(`role ${n} not found`);
    return r.id;
  };
  const adminUser = (await dx(`/users?filter=${q({ email: { _eq: "demo@hoaconnect.info" } })}&fields=id&limit=1`)).data?.[0]?.id ?? null;

  for (const p of PERSONAS) {
    const e = email(p);
    let user = (await dx(`/users?filter=${q({ email: { _eq: e } })}&fields=id&limit=1`)).data?.[0] ?? null;
    const dRole = roleId(p.directusRole);
    if (!user) user = (await write(`user ${e}`, "POST", "/users", { email: e, password: p.password, first_name: p.first, last_name: p.last, role: dRole, status: "active" })).data;
    else await write(`reset password ${e}`, "PATCH", `/users/${user.id}`, { password: p.password });

    const manager = p.key === "manager";
    const memberBody = {
      organization: org.id, user: user.id, role: dRole, first_name: p.first, last_name: p.last, email: e,
      member_type: p.member_type, status: "active",
      ...(manager
        ? { is_manager: true, manager_title: "Property Manager", manager_permissions: { inquiries: true, violations: true, directory: true, documents: true, communications: true, feedback: true, projects: true, responsibilities: true } }
        : {}),
    };
    let member = await first("hoa_members", { organization: { _eq: org.id }, email: { _eq: e } }, "id,member_type");
    if (member && !dry && member.member_type !== p.member_type) await write(`member_type of ${e}`, "PATCH", `/items/hoa_members/${member.id}`, { member_type: p.member_type });
    if (!member) member = (await write(`member ${e}`, "POST", "/items/hoa_members", memberBody)).data;

    if (p.key === "board" && (dry || !(await first("hoa_board_members", { hoa_member: { _eq: member.id } }))))
      await write("board term (director)", "POST", "/items/hoa_board_members", { hoa_member: member.id, title: "director", status: "published", term_start: "2026-01-01" });

    if (p.key === "team")
      for (const area of ["documents", "feedback"]) {
        if (!dry && await first("hoa_area_grants", { organization: { _eq: org.id }, member: { _eq: member.id }, area: { _eq: area }, ends_at: { _null: true } })) continue;
        await write(`area grant ${area}`, "POST", "/items/hoa_area_grants", { organization: org.id, member: member.id, area, starts_at: "2026-01-01T00:00:00.000Z", granted_by: adminUser, holder_name: `${p.first} ${p.last}` });
      }
  }
  console.log(`${dry ? "Dry run" : "Done"}: ${PERSONAS.map(email).join(", ")}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
