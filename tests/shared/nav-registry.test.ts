/**
 * The nav registry (docs/spec-capability-nav.md): one source of entries, and
 * every entry's gate matches the middleware on its route. If an entry shows,
 * its page opens for that person; if the nav hides an entry for a module, the
 * route refuses it too (module.global reads the registry's table).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NAV_ENTRIES,
  NAV_LAYOUTS,
  ROUTE_ONLY_GATES,
  coveredPrefixes,
  entriesForPath,
  homePathFor,
  isHub,
  layoutFor,
  meets,
  moduleForPath,
  moduleRoutePrefixes,
  navEntriesFor,
  pillsOf,
  previewContext,
  routeAllowed,
  visiblePills,
  type NavContext,
  type NavEntry,
} from "#core/shared/nav/registry";
import { AREAS, AREA_KEYS, MANAGER_GRANT_KEYS, type AreaKey } from "#core/shared/transition/grants";
import { capabilitiesFor, type Actor } from "#core/shared/permissions";
import { ALL_MODULE_KEYS } from "#core/app/composables/useModules";

const PAGES = join(process.cwd(), "app/pages/[slug]");

function pageFile(path: string): string | null {
  const rel = path.split("?")[0];
  const candidates = rel === "/" ? [join(PAGES, "index.vue")] : [join(PAGES, `${rel}.vue`), join(PAGES, rel, "index.vue")];
  return candidates.find((f) => existsSync(f)) ?? null;
}

interface PageGate {
  middleware: string[];
  managerCapability: string | null;
}

function pageGate(file: string): PageGate {
  const src = readFileSync(file, "utf8");
  const mw = src.match(/middleware:\s*\[([^\]]*)\]/);
  const names = mw ? [...mw[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]) : [];
  const capm = src.match(/managerCapability:\s*["']([a-z_]+)["']/);
  return { middleware: names, managerCapability: capm?.[1] ?? null };
}

const allOn = () => true;

function ctx(over: Partial<NavContext> & { areas?: AreaKey[]; actors?: Actor[] } = {}): NavContext {
  const areas = new Set(over.areas ?? []);
  return {
    admin: over.admin ?? false,
    capabilities: over.capabilities ?? capabilitiesFor(over.actors ?? ["member"]),
    canWork: over.canWork ?? ((k) => (over.admin ?? false) || areas.has(k)),
    residency: over.residency ?? "owner",
    isEnabled: over.isEnabled ?? allOn,
    orgFlag: over.orgFlag ?? (() => true),
  };
}

const PERSONAS: Record<string, NavContext> = {
  admin: ctx({ admin: true, actors: ["admin"] }),
  owner: ctx(),
  tenant: ctx({ residency: "tenant" }),
  director: ctx({ actors: ["member", "board_member"] }),
  treasurer: ctx({ actors: ["member", "board_treasurer"] }),
  president: ctx({ actors: ["member", "board_president"] }),
  fullService: ctx({ residency: "none", actors: ["property_manager"], areas: [...MANAGER_GRANT_KEYS] }),
  ...Object.fromEntries(
    MANAGER_GRANT_KEYS.map((k) => [`manager:${k}`, ctx({ residency: "none", actors: ["property_manager"], areas: [k] })])
  ),
};

const relOf = (e: NavEntry) => e.path.split("?")[0];

/** What each page middleware admits, modelled on core/app/middleware/*. */
function admits(gate: PageGate, rel: string, c: NavContext): boolean {
  const anyArea = AREA_KEYS.some((k) => c.canWork(k));
  return gate.middleware.every((m) => {
    switch (m) {
      case "admin":
        return c.admin;
      case "manager":
        return c.admin || (anyArea && (!gate.managerCapability || c.canWork(gate.managerCapability as AreaKey)));
      case "nav-gate":
        return routeAllowed(rel, c);
      case "channel-access": // admins, the board, and anyone invited to a channel
      case "admin-or-board":
      case "auth":
      case "subscription":
      case "section-home":
        return true;
      default:
        throw new Error(`unmodelled middleware "${m}"`);
    }
  });
}

describe("registry shape", () => {
  it("has unique ids, and every layout names a real entry", () => {
    const ids = NAV_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const list of Object.values(NAV_LAYOUTS)) for (const id of list) expect(ids, id).toContain(id);
  });

  it("puts every pill under a hub, and no pill directly in a layout", () => {
    const top = new Set<string>(Object.values(NAV_LAYOUTS).flat());
    for (const e of NAV_ENTRIES.filter((e) => e.section)) {
      expect(NAV_ENTRIES.some((h) => h.id === e.section && !h.section), e.id).toBe(true);
      expect(top.has(e.id), `${e.id} is a pill and a dock slot`).toBe(false);
    }
  });

  it("names only real module keys", () => {
    // `projects` is a ModuleKey that Settings → Modules has no switch for yet.
    const known = new Set([...ALL_MODULE_KEYS, "projects", ...ROUTE_ONLY_GATES.map((g) => g.module)]);
    for (const e of NAV_ENTRIES)
      for (const n of e.needs)
        if ("module" in n) for (const k of typeof n.module === "string" ? [n.module] : n.module) expect(known.has(k), `${e.id}: ${k}`).toBe(true);
  });
});

describe("every entry's gate matches the middleware on its route", () => {
  for (const e of NAV_ENTRIES) {
    it(`${e.id} → ${e.path}`, () => {
      const file = pageFile(e.path);
      expect(file, `no page for ${e.path}`).not.toBeNull();
      const gate = pageGate(file!);
      for (const [who, c] of Object.entries(PERSONAS)) {
        if (!meets(e, c)) continue;
        expect(admits(gate, relOf(e), c), `${who} sees ${e.id} but ${gate.middleware.join(",")} refuses`).toBe(true);
      }
    });
  }

  it("an area entry on an open page is backed by that area's server gate", () => {
    for (const e of NAV_ENTRIES) {
      const areaNeed = e.needs.find((n): n is { area: AreaKey } => "area" in n && n.area !== "any");
      if (!areaNeed) continue;
      const gate = pageGate(pageFile(e.path)!);
      if (gate.middleware.includes("manager") || gate.middleware.includes("nav-gate")) continue;
      expect(AREAS.find((a) => a.key === areaNeed.area)?.gate, e.id).toBeTruthy();
    }
  });
});

describe("module gates: module.global reads the registry", () => {
  it("gates each single-module entry's route on its module", () => {
    for (const e of NAV_ENTRIES) {
      const keys = e.needs.flatMap((n) => ("module" in n && typeof n.module === "string" ? [n.module] : []));
      if (keys.length !== 1) continue;
      for (const p of coveredPrefixes(e)) expect(moduleForPath(p), `${e.id} ${p}`).toBe(keys[0]);
    }
  });

  it("never maps one prefix to two modules", () => {
    const seen = new Map<string, string>();
    for (const e of NAV_ENTRIES) {
      const keys = e.needs.flatMap((n) => ("module" in n && typeof n.module === "string" ? [n.module] : []));
      if (keys.length !== 1) continue;
      for (const p of coveredPrefixes(e)) {
        if (seen.has(p)) expect(seen.get(p), p).toBe(keys[0]);
        seen.set(p, keys[0]);
      }
    }
  });

  it("drops none of the gates the old route-prefix table had", () => {
    const OLD: [string, string[]][] = [
      ["feed", ["/feed"]],
      ["meetings", ["/meetings", "/admin/meetings"]],
      ["polls", ["/polls", "/admin/polls"]],
      ["documents", ["/documents", "/admin/documents"]],
      ["rules", ["/rules"]],
      ["governing", ["/governing"]],
      ["board", ["/board"]],
      ["payments", ["/payments", "/admin/payments"]],
      ["expenses", ["/admin/expenses"]],
      ["requests", ["/requests", "/admin/requests"]],
      ["projects", ["/projects", "/admin/projects"]],
      ["moderation", ["/admin/moderation"]],
      ["email", ["/admin/communications", "/admin/email"]],
      ["directory", ["/admin/members", "/admin/units", "/admin/teams"]],
      ["channels", ["/admin/channels"]],
      ["vendors", ["/vendors"]],
    ];
    for (const [module, prefixes] of OLD) for (const p of prefixes) expect(moduleForPath(`${p}/x`), p).toBe(module);
    // Gates the old table lacked, now that the table comes from the pills:
    expect(moduleForPath("/admin/files")).toBe("files");
    expect(moduleForPath("/admin/vendors")).toBe("vendors");
    // Still not module routes:
    expect(moduleForPath("/announcements/email/abc")).toBeNull();
    expect(moduleForPath("/admin/ledger")).toBeNull();
    expect(moduleRoutePrefixes().some((r) => r.prefix === "/")).toBe(false);
  });
});

describe("no grant without a gate", () => {
  it("never offers an area that cannot be granted", () => {
    for (const e of NAV_ENTRIES)
      for (const n of e.needs)
        if ("area" in n && n.area !== "any") expect(MANAGER_GRANT_KEYS as readonly string[], e.id).toContain(n.area);
  });

  it("gives every grantable area an entry, or says why it waits", () => {
    // violations is worked on the inquiries page; contact_platform is an action, not a destination.
    const WAITS = new Set(["violations", "contact_platform"]);
    for (const k of MANAGER_GRANT_KEYS) {
      if (WAITS.has(k)) continue;
      expect(NAV_ENTRIES.some((e) => e.needs.some((n) => "area" in n && n.area === k)), k).toBe(true);
    }
  });
});

const ids = (es: NavEntry[]) => es.map((e) => e.id);
const dock = (c: NavContext, managerHat = false, previewing = false) => {
  const view = previewing ? previewContext(c) : c;
  const anyArea = AREA_KEYS.some((k) => view.canWork(k));
  return ids(navEntriesFor(layoutFor({ admin: view.admin, anyArea, previewing }), view, { managerHat }));
};

describe("what each role's dock shows", () => {
  it("admin: the seven sections and the register; the queue only with the manager hat", () => {
    expect(dock(PERSONAS.admin)).toEqual(["dashboard", "people", "responsibilities-register", "comms", "records", "payments", "requests", "settings"]);
    expect(dock(PERSONAS.admin, true)[0]).toBe("queue");
  });

  it("owner and tenant: today's member apps", () => {
    const today = ["home", "meetings", "documents", "rules", "governing", "board", "responsibilities", "ledger", "pay", "my-requests", "projects", "polls"];
    expect(dock(PERSONAS.owner)).toEqual(today);
    expect(dock(PERSONAS.tenant)).toEqual(today);
  });

  it("board: every seat gets Money (oversight); residents and managers do not", () => {
    expect(dock(PERSONAS.treasurer)).toContain("payments");
    expect(dock(PERSONAS.president)).toContain("payments");
    expect(dock(PERSONAS.director)).toContain("payments");
    expect(dock(PERSONAS.owner)).not.toContain("payments");
    expect(dock(PERSONAS.fullService)).not.toContain("payments");
  });

  it("money approvals: every board seat after Money, admins as a Money pill; nobody else (docs/spec-money-approvals.md)", () => {
    for (const who of ["director", "treasurer", "president"] as const) {
      const d = dock(PERSONAS[who]);
      expect(d.indexOf("money-approvals"), who).toBe(d.indexOf("payments") + 1);
      expect(routeAllowed("/approvals", PERSONAS[who]), who).toBe(true);
    }
    for (const who of ["owner", "tenant", "fullService", "manager:projects"] as const) {
      expect(dock(PERSONAS[who]), who).not.toContain("money-approvals");
      expect(routeAllowed("/approvals", PERSONAS[who]), who).toBe(false);
    }
    expect(dock(PERSONAS.admin)).not.toContain("money-approvals");
    expect(visiblePills("payments", PERSONAS.admin).map((p) => p.id)).toContain("money-approvals-admin");
    expect(routeAllowed("/approvals", PERSONAS.admin)).toBe(true);
    expect(dock(PERSONAS.admin, true, true)).not.toContain("money-approvals");
  });

  it("the responsibilities register: admins and every board seat; a manager with the grant; no owner", () => {
    for (const who of ["admin", "director", "treasurer", "president"] as const) {
      expect(dock(PERSONAS[who]), who).toContain("responsibilities-register");
    }
    expect(dock(PERSONAS["manager:responsibilities"])).toEqual(["queue", "responsibilities-mgr"]);
    for (const who of ["owner", "tenant", "manager:inquiries", "manager:directory"] as const) {
      expect(dock(PERSONAS[who]), who).not.toContain("responsibilities-register");
      expect(dock(PERSONAS[who]), who).not.toContain("responsibilities-mgr");
    }
  });

  it("who handles what: every resident reads the published page, and a board seat has the register beside it", () => {
    for (const who of ["owner", "tenant", "director", "treasurer", "president"] as const) {
      expect(dock(PERSONAS[who]), who).toContain("responsibilities");
    }
    for (const who of ["director", "treasurer", "president"] as const) {
      const d = dock(PERSONAS[who]);
      expect(d.indexOf("responsibilities-register"), who).toBeGreaterThan(-1);
      expect(d.indexOf("responsibilities"), who).toBeGreaterThan(d.indexOf("responsibilities-register"));
    }
    // The module switch turns both off.
    const off = ctx({ isEnabled: (k) => k !== "responsibilities" });
    expect(dock(off)).not.toContain("responsibilities");
    expect(moduleForPath("/responsibilities")).toBe("responsibilities");
    expect(moduleForPath("/admin/responsibilities/abc")).toBe("responsibilities");
  });

  it("the register is one door for the gate: the area and the capability both admit /admin/responsibilities", () => {
    const rel = "/admin/responsibilities";
    expect(entriesForPath(rel).map((e) => e.id).sort()).toEqual(["responsibilities-mgr", "responsibilities-register"]);
    expect(routeAllowed(rel, PERSONAS.treasurer!)).toBe(true);
    expect(routeAllowed(rel, PERSONAS["manager:responsibilities"]!)).toBe(true);
    expect(routeAllowed(rel, PERSONAS.owner!)).toBe(false);
    expect(routeAllowed(rel, PERSONAS["manager:inquiries"]!)).toBe(false);
    // The record page gates exactly as the index does.
    expect(routeAllowed(`${rel}/abc`, PERSONAS.treasurer!)).toBe(true);
    expect(routeAllowed(`${rel}/abc`, PERSONAS.owner!)).toBe(false);
  });

  it("manager: the queue and exactly the areas they can work", () => {
    expect(dock(PERSONAS["manager:inquiries"])).toEqual(["queue", "inquiries"]);
    expect(dock(PERSONAS["manager:directory"])).toEqual(["queue", "directory", "approvals"]);
    expect(dock(PERSONAS.fullService)).toEqual([
      "queue", "inquiries", "directory", "approvals", "communications", "documents-mgr", "feedback", "projects-mgr", "responsibilities-mgr", "activity-mgr",
    ]);
  });

  it("an admin previewing sees the member dock, without Money", () => {
    expect(dock(PERSONAS.admin, true, true)).toEqual(dock(PERSONAS.owner));
  });

  it("follows the module toggles", () => {
    const off = (...m: string[]) => ctx({ admin: true, actors: ["admin"], isEnabled: (k) => !m.includes(k) });
    expect(dock(off("payments", "expenses"))).not.toContain("payments");
    expect(dock(off("email", "channels", "polls"))).not.toContain("comms");
    expect(dock(off("meetings", "documents", "rules", "governing", "files"))).not.toContain("records");
    expect(dock(ctx({ orgFlag: () => false }))).not.toContain("board");
  });

  it("opens a hub on its first visible pill", () => {
    const es = navEntriesFor("admin", ctx({ admin: true, actors: ["admin"], isEnabled: (k) => k !== "directory" }));
    expect(es.find((e) => e.id === "people")?.path).toBe("/board");
    expect(es.find((e) => e.id === "settings")?.path).toBe("/admin/settings");
    expect(pillsOf("payments").map((p) => p.id)).toEqual(["payments-admin", "expenses", "money-approvals-admin"]);
    expect(isHub("home")).toBe(false);
  });
});

describe("homePathFor", () => {
  it("sends a manager who can work something to the queue", () => {
    expect(homePathFor({ managerHat: true, anyArea: true })).toBe("/manage");
    expect(homePathFor({ managerHat: true, anyArea: false })).toBe("/");
    expect(homePathFor({ managerHat: false, anyArea: true })).toBe("/");
  });
});

describe("helpers and committees (docs/spec-delegation.md)", () => {
  // A helper's areas come from `helps`; they are never in the manager's dock.
  const helperDock = (c: NavContext, helps: AreaKey[]) => {
    const anyArea = AREA_KEYS.some((k) => c.canWork(k));
    const helperOnly = anyArea && AREA_KEYS.every((k) => !c.canWork(k) || helps.includes(k));
    return ids(navEntriesFor(layoutFor({ admin: c.admin, anyArea, helperOnly, previewing: false }), c, {}));
  };
  const owner = ["home", "meetings", "documents", "rules", "governing", "board", "responsibilities", "ledger", "pay", "my-requests", "projects", "polls"];

  it("a helper keeps the member layout, never the manager's", () => {
    expect(layoutFor({ admin: false, anyArea: true, helperOnly: true, previewing: false })).toBe("member");
    expect(layoutFor({ admin: false, anyArea: true, helperOnly: false, previewing: false })).toBe("manager");
    expect(layoutFor({ admin: false, anyArea: true, previewing: false })).toBe("manager");
  });

  it("projects: the managing entry takes the resident one's place, once", () => {
    const d = helperDock(ctx({ areas: ["projects"] }), ["projects"]);
    expect(d).toEqual(owner.map((id) => (id === "projects" ? "projects-mgr" : id)));
    expect(d.filter((id) => id.startsWith("projects"))).toHaveLength(1);
  });

  it("the register: the editing entry is added; a board seat who helps gets one slot, not two", () => {
    expect(helperDock(ctx({ areas: ["responsibilities"] }), ["responsibilities"])).toEqual([...owner, "responsibilities-mgr"]);
    const seat = helperDock(ctx({ areas: ["responsibilities"], actors: ["member", "board_treasurer"] }), ["responsibilities"]);
    expect(seat.filter((id) => id === "responsibilities-register" || id === "responsibilities-mgr")).toEqual(["responsibilities-register"]);
  });

  it("documents and feedback add nothing: those pages are already in the dock", () => {
    expect(helperDock(ctx({ areas: ["documents", "feedback"] }), ["documents", "feedback"])).toEqual(owner);
  });

  it("a plain owner, a tenant and an admin previewing are unchanged", () => {
    expect(helperDock(ctx(), [])).toEqual(owner);
    expect(helperDock(ctx({ residency: "tenant" }), [])).toEqual(owner);
    expect(dock(PERSONAS.admin, false, true)).not.toContain("projects-mgr");
  });

  it("a manager's dock is unchanged", () => {
    expect(dock(PERSONAS["manager:projects"])).toEqual(["queue", "projects-mgr"]);
    expect(dock(PERSONAS.fullService)).not.toContain("projects");
  });
});
