// GET /api/org/ai-spend?orgId=...&days=30
//
// Admins-only view of AI credit spend for the org: the current wallet balance
// plus per-user debit totals over a window, derived from the append-only
// ai_transactions ledger. For oversight, not caps — there are no per-user
// limits at launch. Property managers and members get 403.
//
// getTypedDirectus + checkAdminAccess are auto-imported from server/utils.

import { readItems } from "@directus/sdk";

interface SpendUser {
  userId: string | null;
  name: string;
  email: string | null;
  credits: number;
  calls: number;
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const query = getQuery(event);
  const orgId = String(query.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  // Admins only — spend visibility is an oversight surface.
  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) {
    throw createError({ statusCode: 403, message: "Not authorized to view AI spend" });
  }

  const days = Math.min(Math.max(Number(query.days) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // The wallet summary (self-funds the plan allowance on read).
  const wallet = await getWalletSummary(orgId);

  // Debit rows in the window, with the acting user resolved. Declared as a
  // loose record so the date range operator typechecks (mirrors activity.get).
  const filter: Record<string, any> = {
    organization: { _eq: orgId },
    type: { _eq: "debit" },
    date_created: { _gte: since },
  };

  const rows = (await getTypedDirectus().request(
    readItems("ai_transactions", {
      filter,
      fields: [
        "credits",
        "feature",
        "model",
        "date_created",
        { user: ["id", "first_name", "last_name", "email"] },
      ],
      sort: ["-date_created"],
      limit: -1,
    })
  )) as {
    credits?: number | null;
    feature?: string | null;
    model?: string | null;
    user?: { id?: string; first_name?: string | null; last_name?: string | null; email?: string | null } | null;
  }[];

  // Aggregate per user + per feature.
  const byUser = new Map<string, SpendUser>();
  const byFeature: Record<string, number> = {};
  let totalCredits = 0;
  let totalCalls = 0;

  for (const r of rows) {
    const credits = Math.max(0, Number(r.credits) || 0);
    totalCredits += credits;
    totalCalls += 1;

    const feature = r.feature || "other";
    byFeature[feature] = (byFeature[feature] || 0) + credits;

    const u = r.user;
    const key = u?.id || "unknown";
    const existing = byUser.get(key);
    if (existing) {
      existing.credits += credits;
      existing.calls += 1;
    } else {
      const name =
        [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() ||
        u?.email ||
        (u?.id ? "Unknown user" : "System");
      byUser.set(key, {
        userId: u?.id ?? null,
        name,
        email: u?.email ?? null,
        credits,
        calls: 1,
      });
    }
  }

  const users = [...byUser.values()].sort((a, b) => b.credits - a.credits);

  return {
    scope: "all" as const,
    days,
    wallet,
    totals: { credits: totalCredits, calls: totalCalls },
    byFeature,
    users,
  };
});
