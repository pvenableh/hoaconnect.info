/**
 * The money routes' world for tests (docs/spec-money-approvals.md): the
 * fake Directus from responsibilities-db, plus the auto-imported money
 * utilities as globals (the real ones), with notifications and Ledger
 * writes captured. Capabilities come from the persona: an admin of ORG only,
 * a board office, a manager's grants.
 */
import { vi } from "vitest";
import { ORG, type Db, type Who } from "./responsibilities-db";
import { boardTitleToActor, capabilitiesFor, type Actor } from "#core/shared/permissions";

export const ROLE = { admin: "role-hoa-admin", pm: "role-pm" };

export interface MoneyCapture {
  notices: any[];
  ledger: any[];
}

export async function stubMoney(state: { who: Who; db: Db }): Promise<MoneyCapture> {
  const capture: MoneyCapture = { notices: [], ledger: [] };
  vi.stubGlobal("checkAdminAccess", async (_e: unknown, org: string) => ({ isAdmin: !!state.who.admin && org === ORG, userId: state.who.userId }));
  vi.stubGlobal("resolveCapabilities", async (_e: unknown, org: string) => {
    const actors: Actor[] = [];
    if (state.who.admin && org === ORG) actors.push("admin");
    const office = org === ORG ? boardTitleToActor(state.who.office ?? null) : null;
    if (office) actors.push(office);
    const caps = new Set(capabilitiesFor(actors));
    if (org === ORG && state.who.grants?.projects === true) caps.add("money:enter");
    return { actors, capabilities: [...caps] };
  });
  vi.stubGlobal("serverRoleIds", () => ({ appAdmin: null, propertyManager: ROLE.pm, adminRoleIds: [ROLE.admin] }));
  vi.stubGlobal("safeRequestOrigin", async () => "https://app.test");
  vi.stubGlobal("notifyUsers", async (opts: any) => {
    capture.notices.push(opts);
    return { bell: opts.recipientUserIds.length, push: 0, email: 0 };
  });
  vi.stubGlobal("writeAuditEntry", async (entry: any) => {
    capture.ledger.push(entry);
    return `ledger-${capture.ledger.length}`;
  });

  const modules = [
    "#core/server/utils/money-access",
    "#core/server/utils/member-names",
    "#core/server/utils/org-name",
    "#core/server/utils/money-approvals",
    "#core/server/utils/expense-flow",
    "#core/server/utils/approval-views",
    "#core/server/utils/charge-corrections",
  ];
  for (const path of modules) {
    for (const [k, v] of Object.entries(await import(/* @vite-ignore */ path))) vi.stubGlobal(k, v);
  }
  return capture;
}
