/**
 * useCurrentDomainAccess answers with the SERVER's rules
 * (docs/spec-capability-nav.md, "Client context"). Session 1 kept four
 * client-only rules so nothing changed; Session 2 retired them:
 *  - every cached membership counted as live, whatever its status;
 *  - the legacy Administrator membership role counted as admin;
 *  - the HOA Admin global role plus any membership counted as admin;
 *  - board terms used the client's own date filter.
 *
 * `server()` is the server's rule set (checkAdminAccess, getBoardPosition,
 * getManagerGrants), written out by hand. The test runs it and the composable
 * over a matrix of global role × membership role × status × terms × grants,
 * then names each retired rule as its own case, and checks that the server's
 * context wins once it is loaded for the org on screen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { useCurrentDomainAccess } from "#core/app/composables/useCurrentDomainAccess";
import { emptyRoleContext } from "#core/shared/roles/role-context";

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

const today = () => new Date().toISOString().split("T")[0];

/** The server's rules. */
function server(globalRole: string | null, m: Membership) {
  const roleId = m?.role ? (typeof m.role === "string" ? m.role : m.role.id) : null;
  const status = m?.status ?? null;
  const terms = Array.isArray(m?.board_member_terms) ? m!.board_member_terms : [];
  const t = today();
  const current = terms.filter((x: any) => {
    if (x.status !== "published") return false;
    if (x.term_start && String(x.term_start).slice(0, 10) > t) return false;
    if (x.term_end && String(x.term_end).slice(0, 10) < t) return false;
    return true;
  });
  const isAdmin =
    globalRole === CFG.directusRoleAppAdmin ||
    (!!m && roleId === CFG.directusRoleHoaAdmin && (status === "active" || status === "pending"));
  const isPM = roleId === CFG.directusRolePropertyManager;
  const raw = m?.manager_permissions;
  const obj = raw && typeof raw === "object" ? raw : {};
  const perms = Object.fromEntries(FIVE.map((k) => [k, obj[k] === true]));
  return {
    isAdminOfCurrentDomain: isAdmin,
    isMemberOfCurrentDomain: !!m,
    isRegularMemberOfCurrentDomain: !!roleId && [CFG.directusRoleMember, CFG.directusRoleUser].includes(roleId),
    isBoardMemberOfCurrentDomain: status === "active" && current.length > 0,
    currentDomainBoardTerms: current,
    isPropertyManagerOfCurrentDomain: isPM,
    perms,
    managerCan: Object.fromEntries(FIVE.map((k) => [k, isAdmin || (status === "active" && isPM && perms[k])])),
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
  vi.stubGlobal("useRequestFetch", () => async () => ({}));
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
  // Ends today: current, both ends inclusive.
  [{ status: "published", title: "secretary", term_start: iso(-30 * day), term_end: iso(0) }],
];
const GRANTS = [null, "garbage", { inquiries: true, communications: true, projects: true }, { violations: true, directory: "yes" }];

const row = (role: any, over: Record<string, any> = {}) => ({
  id: "m-1",
  organization: { id: ORG },
  role,
  status: "active",
  member_type: "owner",
  manager_permissions: null,
  board_member_terms: [],
  ...over,
});

describe("useCurrentDomainAccess answers with the server's rules", () => {
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
                  : row(role, {
                      status,
                      member_type: status === "inactive" ? "tenant" : "owner",
                      manager_permissions: grants,
                      board_member_terms: terms,
                    });
              globalRole = g;
              memberships = m ? [{ organization: { id: "org-other" }, role: CFG.directusRoleHoaAdmin, status: "active" }, m] : [];
              const a = useCurrentDomainAccess();
              const b = server(g, m);
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

  it("retired: the legacy Administrator membership role is not admin", () => {
    globalRole = CFG.directusRoleMember;
    memberships = [row(CFG.directusRoleAdmin)];
    expect(useCurrentDomainAccess().isAdminOfCurrentDomain.value).toBe(false);
  });

  it("retired: the HOA Admin global role does not make a member row admin", () => {
    globalRole = CFG.directusRoleHoaAdmin;
    memberships = [row(CFG.directusRoleMember)];
    expect(useCurrentDomainAccess().isAdminOfCurrentDomain.value).toBe(false);
  });

  it("retired: an archived or inactive row carries no hats or areas", () => {
    globalRole = CFG.directusRoleMember;
    for (const status of ["archived", "inactive"]) {
      memberships = [row(CFG.directusRoleHoaAdmin, { status })];
      expect(useCurrentDomainAccess().isAdminOfCurrentDomain.value, status).toBe(false);
      memberships = [row(CFG.directusRolePropertyManager, { status, manager_permissions: { inquiries: true } })];
      expect(useCurrentDomainAccess().managerCan("inquiries"), status).toBe(false);
    }
    // A row cached before `status` was read has none, and counts as active.
    memberships = [row(CFG.directusRoleHoaAdmin, { status: undefined })];
    expect(useCurrentDomainAccess().isAdminOfCurrentDomain.value).toBe(true);
  });

  it("retired: a board term is current through its last day", () => {
    globalRole = CFG.directusRoleMember;
    memberships = [row(CFG.directusRoleMember, { board_member_terms: [{ status: "published", term_start: iso(-30 * day), term_end: iso(0) }] })];
    expect(useCurrentDomainAccess().isBoardMemberOfCurrentDomain.value).toBe(true);
  });

  it("the server's context wins once it is loaded for this org", () => {
    globalRole = CFG.directusRoleMember;
    memberships = [row(CFG.directusRoleHoaAdmin)];
    const server = emptyRoleContext(ORG);
    server.hats.manager = true;
    useState("orgRoleContext", () => null).value = { orgId: ORG, context: server, actors: [], capabilities: [], loaded: true };
    const a = useCurrentDomainAccess();
    expect(a.isAdminOfCurrentDomain.value).toBe(false);
    expect(a.hasManagerHat.value).toBe(true);
  });

  it("ignores a server context for another org", () => {
    globalRole = CFG.directusRoleMember;
    memberships = [row(CFG.directusRoleHoaAdmin)];
    useState("orgRoleContext", () => null).value = { orgId: "org-other", context: emptyRoleContext("org-other"), actors: [], capabilities: [], loaded: true };
    expect(useCurrentDomainAccess().isAdminOfCurrentDomain.value).toBe(true);
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
