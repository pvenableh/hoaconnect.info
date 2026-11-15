/**
 * An in-memory Directus for the register's route tests: enough of readItems,
 * readItem, readUsers, createItem(s), updateItem and deleteItem, filters with
 * _eq/_in/_null/_nnull/_and/_or and one-hop relation filters, and dotted
 * field expansion. Plus the auto-imported globals the routes and utils use,
 * driven by a `who` persona.
 */
import { vi } from "vitest";

export const ORG = "org-lenox";
export const OTHER = "org-other";

export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const ID = {
  userAnn: uuid(1),
  userBob: uuid(2),
  userAdmin: uuid(3),
  memberAnn: uuid(11),
  memberBob: uuid(12),
  memberOther: uuid(13),
  memberAdmin: uuid(14),
  vendorAcme: uuid(21),
  vendorOther: uuid(22),
  teamGrounds: uuid(31),
  termAnn: uuid(41),
  termOld: uuid(42),
  termOther: uuid(43),
  jobBank: uuid(51),
  jobPest: uuid(52),
  jobHurricane: uuid(53),
  jobRetired: uuid(54),
  jobHidden: uuid(55),
  jobOther: uuid(56),
  aBank: uuid(61),
  aPest: uuid(62),
  aOldSuper: uuid(63),
  aHidden: uuid(64),
  aOther: uuid(65),
  project: uuid(71),
  fileOk: uuid(81),
  fileElsewhere: uuid(82),
};

const RELATIONS: Record<string, Record<string, string>> = {
  hoa_board_members: { hoa_member: "hoa_members" },
  hoa_members: { user: "directus_users", organization: "hoa_organizations" },
  hoa_responsibilities_files: { directus_files_id: "directus_files", hoa_responsibilities_id: "hoa_responsibilities" },
};

export type Db = Record<string, any[]>;

export function seed(): Db {
  return {
    hoa_organizations: [
      { id: ORG, name: "1033 Lenox", modules: { board: true }, responsibilities_published: false, responsibilities_show_unassigned: false },
      { id: OTHER, name: "Elsewhere", modules: null, responsibilities_published: true, responsibilities_show_unassigned: true },
    ],
    directus_users: [
      { id: ID.userAnn, first_name: "Ann", last_name: "Lee", email: "ann@example.test", avatar: "ava-ann" },
      { id: ID.userBob, first_name: "Bob", last_name: "Diaz", email: "bob@example.test", avatar: null },
      { id: ID.userAdmin, first_name: "Ada", last_name: "Min", email: "ada@example.test", avatar: null },
    ],
    directus_files: [{ id: ID.fileOk, title: "Management agreement", type: "application/pdf" }],
    hoa_members: [
      { id: ID.memberAnn, organization: ORG, user: ID.userAnn, first_name: "Ann", last_name: "Lee", status: "active" },
      { id: ID.memberBob, organization: ORG, user: ID.userBob, first_name: "Bob", last_name: "Diaz", status: "active" },
      { id: ID.memberAdmin, organization: ORG, user: ID.userAdmin, first_name: "Ada", last_name: "Min", status: "active" },
      { id: ID.memberOther, organization: OTHER, user: uuid(9), first_name: "Oz", last_name: "Out", status: "active" },
    ],
    hoa_vendors: [
      { id: ID.vendorAcme, organization: ORG, company: "Acme Pest", name: "Al Acme", email: "al@acme.test", phone: "555-0100" },
      { id: ID.vendorOther, organization: OTHER, company: "Other Co", name: "X" },
    ],
    hoa_teams: [{ id: ID.teamGrounds, organization: ORG, name: "Grounds", color: "green" }],
    hoa_projects: [{ id: ID.project, organization: ORG, title: "Roof" }],
    hoa_board_members: [
      { id: ID.termAnn, hoa_member: ID.memberAnn, title: "treasurer", status: "published", term_start: "2026-01-01", term_end: null, end_reason: null, holder_name: null },
      { id: ID.termOld, hoa_member: ID.memberBob, title: "secretary", status: "published", term_start: "2019-01-01", term_end: "2019-12-31", end_reason: null, holder_name: null },
      { id: ID.termOther, hoa_member: ID.memberOther, title: "president", status: "published", term_start: "2026-01-01", term_end: null },
    ],
    hoa_meeting_attendees: [],
    hoa_responsibilities: [
      { id: ID.jobBank, organization: ORG, title: "Reconciles bank statements", category: "finance", cadence: "monthly", basis: "contract", basis_reference: "Management agreement §4", notes: "Board unsure the CPA does it", status: "active", member_visible: true, last_verified: "2026-10-01", last_verified_by: ID.userAdmin, project: null, sort: 1, date_created: "2026-01-01T00:00:00Z" },
      { id: ID.jobPest, organization: ORG, title: "Pest control", category: "building", cadence: "monthly", basis: "unknown", notes: "Disputed with Acme", status: "disputed", member_visible: true, last_verified: null, sort: 2, date_created: "2026-01-01T00:00:00Z" },
      { id: ID.jobHurricane, organization: ORG, title: "Hurricane prep and shutdown", category: "mechanical_safety", cadence: "annual", basis: "unknown", status: "active", member_visible: true, sort: 3, date_created: "2025-06-01T00:00:00Z" },
      { id: ID.jobRetired, organization: ORG, title: "Old pool heater", category: "building", cadence: "annual", status: "retired", member_visible: true, sort: 4, date_created: "2025-01-01T00:00:00Z" },
      { id: ID.jobHidden, organization: ORG, title: "Keys, fobs, gate codes, access list", category: "mechanical_safety", cadence: "continuous", status: "active", member_visible: false, sort: 5, date_created: "2026-01-01T00:00:00Z" },
      { id: ID.jobOther, organization: OTHER, title: "Elsewhere job", category: "finance", status: "active", member_visible: true, date_created: "2026-01-01T00:00:00Z" },
    ],
    hoa_responsibility_assignees: [
      { id: ID.aBank, organization: ORG, responsibility: ID.jobBank, office: "treasurer", role: "owner", start_date: "2026-01-01", end_date: null },
      { id: ID.aPest, organization: ORG, responsibility: ID.jobPest, vendor: ID.vendorAcme, role: "owner", start_date: "2026-01-01", end_date: null },
      { id: ID.aOldSuper, organization: ORG, responsibility: ID.jobHurricane, label: "Old super", role: "owner", start_date: "2025-01-01", end_date: "2026-10-11", holder_name: "Old super" },
      { id: ID.aHidden, organization: ORG, responsibility: ID.jobHidden, member: ID.memberBob, role: "owner", start_date: "2026-01-01", end_date: null },
      { id: ID.aOther, organization: OTHER, responsibility: ID.jobOther, label: "Them", role: "owner", start_date: "2026-01-01", end_date: null },
    ],
    hoa_responsibilities_files: [],
    hoa_activity: [],
  };
}

const idOf = (v: any) => (v && typeof v === "object" ? v.id : v);
const OPS = ["_eq", "_neq", "_in", "_nin", "_null", "_nnull", "_lte", "_gte"];

function matches(db: Db, collection: string, row: any, filter: any): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([k, cond]: [string, any]) => {
    if (k === "_and") return cond.every((f: any) => matches(db, collection, row, f));
    if (k === "_or") return cond.some((f: any) => matches(db, collection, row, f));
    const v = idOf(row[k]);
    if (cond && typeof cond === "object" && Object.keys(cond).some((o) => OPS.includes(o))) {
      return Object.entries(cond).every(([op, x]: [string, any]) => {
        switch (op) {
          case "_eq": return v === x;
          case "_neq": return v !== x;
          case "_in": return (x as any[]).includes(v);
          case "_nin": return !(x as any[]).includes(v);
          case "_null": return x ? v == null : v != null;
          case "_nnull": return x ? v != null : v == null;
          case "_lte": return v != null && v <= x;
          case "_gte": return v != null && v >= x;
          default: return true;
        }
      });
    }
    const related = RELATIONS[collection]?.[k];
    if (!related) throw new Error(`fake directus: no relation ${collection}.${k}`);
    const target = (db[related] ?? []).find((r) => r.id === v);
    return !!target && matches(db, related, target, cond);
  });
}

function expand(db: Db, collection: string, row: any, fields: string[] | undefined): any {
  const out = { ...row };
  const nested = new Map<string, string[]>();
  for (const f of fields ?? []) {
    const [head, ...rest] = f.split(".");
    if (rest.length) nested.set(head!, [...(nested.get(head!) ?? []), rest.join(".")]);
  }
  for (const [head, sub] of nested) {
    const related = RELATIONS[collection]?.[head];
    if (!related) continue;
    const target = (db[related] ?? []).find((r) => r.id === idOf(row[head]));
    out[head] = target ? expand(db, related, target, sub) : null;
  }
  return out;
}

let seq = 1000;

export function fakeDirectus(state: { db: Db; fail?: { failCreate?: string } }) {
  const calls: any[] = [];
  const request = async (op: any) => {
    const db = state.db;
    const opts = state.fail ?? {};
    calls.push(op);
    const rows = (db[op.collection] ??= []);
    switch (op.op) {
      case "readItems":
        return rows.filter((r) => matches(db, op.collection, r, op.query?.filter)).map((r) => expand(db, op.collection, r, op.query?.fields));
      case "readItem": {
        const r = rows.find((x) => x.id === op.id);
        if (!r) throw Object.assign(new Error("not found"), { statusCode: 403 });
        return expand(db, op.collection, r, op.query?.fields);
      }
      case "createItem":
      case "createItems": {
        if (opts.failCreate === op.collection) throw new Error("boom");
        const list = op.op === "createItems" ? op.data : [op.data];
        const made = list.map((d: any) => {
          const { evidence, ...rest } = d;
          const row = { id: uuid(seq++), date_created: "2026-11-15T12:00:00Z", ...rest };
          rows.push(row);
          for (const e of evidence ?? []) db.hoa_responsibilities_files!.push({ id: seq++, hoa_responsibilities_id: row.id, ...e });
          return row;
        });
        return op.op === "createItems" ? made : made[0];
      }
      case "updateItem": {
        const r = rows.find((x) => x.id === op.id);
        if (!r) throw new Error("not found");
        const { evidence, ...rest } = op.data;
        Object.assign(r, rest);
        if (evidence) {
          db.hoa_responsibilities_files = db.hoa_responsibilities_files!.filter((j) => !evidence.delete.includes(j.id));
          for (const e of evidence.create) db.hoa_responsibilities_files!.push({ id: seq++, hoa_responsibilities_id: r.id, ...e });
        }
        return r;
      }
      case "deleteItem":
        db[op.collection] = rows.filter((x) => x.id !== op.id);
        return null;
      default:
        throw new Error(`fake directus: ${op.op}`);
    }
  };
  return { request, calls };
}

/** For `vi.mock("@directus/sdk", ...)`: every op becomes a plain descriptor the fake reads. */
export function sdkMock() {
  return {
    readItems: (collection: string, query?: any) => ({ op: "readItems", collection, query }),
    readItem: (collection: string, id: string, query?: any) => ({ op: "readItem", collection, id, query }),
    readUsers: (query?: any) => ({ op: "readItems", collection: "directus_users", query }),
    createItem: (collection: string, data: any) => ({ op: "createItem", collection, data }),
    createItems: (collection: string, data: any) => ({ op: "createItems", collection, data }),
    updateItem: (collection: string, id: string, data: any) => ({ op: "updateItem", collection, id, data }),
    deleteItem: (collection: string, id: string) => ({ op: "deleteItem", collection, id }),
  };
}

export interface Who {
  userId: string | null;
  admin?: boolean;
  memberId?: string | null;
  grants?: Record<string, boolean> | null;
  office?: string | null;
}

export const PERSONAS = {
  admin: { userId: ID.userAdmin, admin: true, memberId: ID.memberAdmin } as Who,
  editor: { userId: uuid(5), memberId: uuid(15), grants: { responsibilities: true } } as Who,
  manager: { userId: uuid(6), memberId: uuid(16), grants: { projects: true, directory: true } } as Who,
  board: { userId: ID.userAnn, memberId: ID.memberAnn, office: "treasurer" } as Who,
  owner: { userId: ID.userBob, memberId: ID.memberBob } as Who,
  outsider: { userId: uuid(7), memberId: null } as Who,
  nobody: { userId: null } as Who,
};

/** Stub every auto-imported global the routes and utils reach for. */
export function stubGlobals(state: { who: Who; db: Db; fail?: { failCreate?: string } }) {
  const directus = () => fakeDirectus(state);
  let client = directus();
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
  vi.stubGlobal("readBody", async (e: any) => e?.__body);
  vi.stubGlobal("getRouterParam", (e: any, name: string) => e?.__params?.[name]);
  vi.stubGlobal("setHeader", (e: any, k: string, v: string) => ((e.__headers ??= {})[k] = v));
  vi.stubGlobal("getRequestIP", () => "203.0.113.1");
  vi.stubGlobal("getHeader", () => "vitest");
  vi.stubGlobal("requireUserSession", async () => {
    if (!state.who.userId) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    return { user: { id: state.who.userId } };
  });
  vi.stubGlobal("getUserSession", async () => (state.who.userId ? { user: { id: state.who.userId } } : {}));
  vi.stubGlobal("checkAdminAccess", async () => ({ isAdmin: !!state.who.admin, userId: state.who.userId }));
  vi.stubGlobal("checkMembership", async () =>
    state.who.memberId ? { isMember: true, memberId: state.who.memberId } : { isMember: false }
  );
  vi.stubGlobal("getManagerGrants", async () => state.who.grants ?? null);
  vi.stubGlobal("getBoardPosition", async () => state.who.office ?? null);
  vi.stubGlobal("filesOutsideOrg", async (_org: string, ids: string[]) => ids.filter((i) => i !== ID.fileOk));
  vi.stubGlobal("getTypedDirectus", () => client);
  return {
    reset: () => (client = directus()),
    get calls() {
      return client.calls;
    },
  };
}

export const ev = (o: { query?: any; body?: any; params?: any } = {}) => ({ __query: o.query, __body: o.body, __params: o.params }) as any;
