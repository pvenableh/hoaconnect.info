/**
 * useCurrentDomainAccess, re-pointed at the RoleContext resolver
 * (docs/spec-role-context.md), must return what it returned before.
 *
 * `before()` is the pre-RoleContext logic, copied verbatim in substance from
 * the composable as it stood at 2ceb0de^ (five-key grants and all). The test
 * runs both over a matrix of global role × membership role × status × board
 * terms × grants and compares every output a caller can read.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useCurrentDomainAccess } from "#core/app/composables/useCurrentDomainAccess";

const CFG = {
  directusRoleAppAdmin: "r-app-admin",
  directusRoleHoaAdmin: "r-hoa-admin",
  directusRoleAdmin: "r-legacy-admin",
  directusRoleMember: "r-member",
  directusRoleUser: "r-user",
  directusRolePropertyManager: "r-pm",
};
const ORG = "org-1";
const FIVE = ["inquiries", "violations", "directory", "documents", "communications"] as const;

type Membership = Record<string, any> | null;

/** The rules as they were. */
function before(globalRole: string | null, m: Membership) {
  const roleId = m?.role ? (typeof m.role === "string" ? m.role : m.role.id) : null;
  const terms = Array.isArray(m?.board_member_terms) ? m!.board_member_terms : [];
  const now = new Date();
  const current = terms.filter((t: any) => {
    if (t.status !== "published") return false;
    const s = t.term_start ? new Date(t.term_start) : null;
    const e = t.term_end ? new Date(t.term_end) : null;
    if (s && now < s) return false;
    if (e && now > e) return false;
    return true;
  });
  let isAdmin = false;
  if (globalRole === CFG.directusRoleAppAdmin) isAdmin = true;
  else if (globalRole === CFG.directusRoleHoaAdmin && m) isAdmin = true;
  else if (roleId) {
    isAdmin = [CFG.directusRoleAppAdmin, CFG.directusRoleHoaAdmin, CFG.directusRoleAdmin].includes(roleId);
  }
  const isPM = roleId === CFG.directusRolePropertyManager;
  const raw = m?.manager_permissions;
  const obj = raw && typeof raw === "object" ? raw : {};
  const perms = Object.fromEntries(FIVE.map((k) => [k, obj[k] === true]));
  return {
    isAdminOfCurrentDomain: isAdmin,
    isMemberOfCurrentDomain: !!m,
    isRegularMemberOfCurrentDomain: !!roleId && [CFG.directusRoleMember, CFG.directusRoleUser].includes(roleId),
    isBoardMemberOfCurrentDomain: current.length > 0,
    currentDomainBoardTerms: current,
    isPropertyManagerOfCurrentDomain: isPM,
    perms,
    managerCan: Object.fromEntries(FIVE.map((k) => [k, isAdmin ? true : isPM ? perms[k] : false])),
    currentDomainMemberType: m?.member_type || null,
  };
}

let globalRole: string | null;
let memberships: any[] | null;

beforeEach(() => {
  vi.stubGlobal("useActiveHoa", () => ({ activeHoa: ref({ id: ORG }) }));
  vi.stubGlobal("useUserSession", () => ({ loggedIn: ref(true), user: ref({ role: globalRole }) }));
  vi.stubGlobal("useRuntimeConfig", () => ({ public: CFG }));
  vi.stubGlobal("useRoute", () => ({ params: { slug: "lenox" } }));
  vi.stubGlobal("useNuxtData", () => ({ data: ref(memberships) }));
});

const day = 86_400_000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString().split("T")[0];

const GLOBAL_ROLES = [null, CFG.directusRoleAppAdmin, CFG.directusRoleHoaAdmin, CFG.directusRoleMember];
const MEMBER_ROLES = [
  null,
  CFG.directusRoleAppAdmin,
  CFG.directusRoleHoaAdmin,
  CFG.directusRoleAdmin,
  CFG.directusRolePropertyManager,
  CFG.directusRoleMember,
  CFG.directusRoleUser,
  { id: CFG.directusRolePropertyManager },
];
const STATUSES = ["active", "pending", "archived", "inactive"];
const TERMS = [
  [],
  [{ status: "published", title: "treasurer", term_start: iso(-30 * day), term_end: iso(30 * day) }],
  [{ status: "published", title: "director", term_start: iso(-60 * day), term_end: iso(-30 * day) }],
  [{ status: "draft", title: "president", term_start: null, term_end: null }],
];
const GRANTS = [null, "garbage", { inquiries: true, communications: true, projects: true }, { violations: true, directory: "yes" }];

describe("useCurrentDomainAccess returns what it returned before the RoleContext", () => {
  it("across global role × membership role × status × terms × grants", () => {
    let cases = 0;
    for (const g of GLOBAL_ROLES) {
      for (const role of [...MEMBER_ROLES, "no-membership"]) {
        for (const status of STATUSES) {
          for (const terms of TERMS) {
            for (const grants of GRANTS) {
              const m: Membership =
                role === "no-membership"
                  ? null
                  : {
                      id: "m-1",
                      organization: { id: ORG },
                      role,
                      status,
                      member_type: status === "inactive" ? "tenant" : "owner",
                      manager_permissions: grants,
                      board_member_terms: terms,
                    };
              globalRole = g;
              memberships = m ? [{ organization: { id: "org-other" }, role: CFG.directusRoleHoaAdmin }, m] : [];
              const a = useCurrentDomainAccess();
              const b = before(g, m);
              const label = JSON.stringify({ g, role, status, terms: terms.length, grants });
              expect(a.isAdminOfCurrentDomain.value, label).toBe(b.isAdminOfCurrentDomain);
              expect(a.isMemberOfCurrentDomain.value, label).toBe(b.isMemberOfCurrentDomain);
              expect(a.isRegularMemberOfCurrentDomain.value, label).toBe(b.isRegularMemberOfCurrentDomain);
              expect(a.isBoardMemberOfCurrentDomain.value, label).toBe(b.isBoardMemberOfCurrentDomain);
              expect(a.currentDomainBoardTerms.value, label).toEqual(b.currentDomainBoardTerms);
              expect(a.isPropertyManagerOfCurrentDomain.value, label).toBe(b.isPropertyManagerOfCurrentDomain);
              expect(a.currentDomainMemberType.value, label).toBe(b.currentDomainMemberType);
              for (const k of FIVE) {
                expect(a.currentDomainManagerPermissions.value[k], `${label} perms.${k}`).toBe(b.perms[k]);
                expect(a.managerCan(k), `${label} managerCan(${k})`).toBe(b.managerCan[k]);
              }
              cases++;
            }
          }
        }
      }
    }
    expect(cases).toBe(GLOBAL_ROLES.length * (MEMBER_ROLES.length + 1) * STATUSES.length * TERMS.length * GRANTS.length);
  });

  it("not logged in: nothing", () => {
    vi.stubGlobal("useUserSession", () => ({ loggedIn: ref(false), user: ref(null) }));
    memberships = [{ organization: { id: ORG }, role: CFG.directusRoleHoaAdmin, status: "active" }];
    const a = useCurrentDomainAccess();
    expect(a.isAdminOfCurrentDomain.value).toBe(false);
    expect(a.isMemberOfCurrentDomain.value).toBe(false);
    expect(a.managerCan("inquiries")).toBe(false);
  });
});
