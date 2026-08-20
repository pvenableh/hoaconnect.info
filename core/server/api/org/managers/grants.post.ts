/**
 * POST /api/org/managers/grants
 *
 * Change a property manager's permissions — and record that it happened.
 *
 * The recording is the reason this route exists. Until Phase 5 the settings
 * screen wrote `hoa_members.manager_permissions` straight from the browser with
 * a Directus PATCH, which works fine and leaves no trace: who is allowed to act
 * for a community, and from when, was not answerable afterwards by anyone. That
 * is exactly the kind of thing a board wants a date for two years later, and
 * VISION lists grant changes among the things owners are entitled to see.
 *
 * Same discipline as the transition writer:
 *   • the change and the entry happen in ONE place, so they cannot drift;
 *   • the entry is built by a pure function from the decision, not from the row;
 *   • a no-op writes nothing — an admin who toggles a switch twice has done
 *     nothing to the community, and a ledger full of "no change" is unread.
 *
 * Admin-only. A property manager cannot widen their own grants, which the old
 * client-side write also enforced only through Directus policy — here it is a
 * check, in front of the write.
 */

import { readItems, updateItem } from "@directus/sdk";
import { buildGrantChangeEntry } from "#core/shared/ledger/entries";
import {
  MANAGER_GRANT_KEYS,
  normalizeGrants,
  presetFor,
  type ManagerGrantKey,
} from "#core/shared/transition/grants";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const orgId = String(body?.orgId || "").trim();
  const memberId = String(body?.memberId || "").trim();
  if (!orgId || !memberId) {
    throw createError({ statusCode: 400, statusMessage: "orgId and memberId are required" });
  }

  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only an administrator can change a manager's permissions.",
    });
  }

  const config = useRuntimeConfig();
  const pmRole = config.public.directusRolePropertyManager;
  const directus = getTypedDirectus();

  // Read the row THROUGH the org filter. Passing a memberId from another
  // community must miss, not update someone else's manager.
  const [rows, orgs] = await Promise.all([
    directus.request(
      readItems("hoa_members", {
        filter: { id: { _eq: memberId }, organization: { _eq: orgId } },
        fields: ["id", "first_name", "last_name", "email", "role", "manager_permissions"] as any,
        limit: 1,
      })
    ) as Promise<any[]>,
    // The name goes into the entry so the row still reads correctly in an
    // export archive, next to no other rows at all.
    directus.request(
      readItems("hoa_organizations", {
        filter: { id: { _eq: orgId } },
        fields: ["name"] as any,
        limit: 1,
      })
    ) as Promise<any[]>,
  ]);

  const member = rows?.[0];
  if (!member) {
    throw createError({ statusCode: 404, statusMessage: "No such manager in this community." });
  }
  // Grants only mean anything on a Property Manager row. Refusing here stops an
  // admin from quietly writing manager flags onto an owner's membership, where
  // nothing would enforce them and nothing would show them.
  if (pmRole && member.role !== pmRole) {
    throw createError({
      statusCode: 400,
      statusMessage: "That member is not a property manager.",
    });
  }

  const before = normalizeGrants(member.manager_permissions);

  // Either a whole preset or one switch. Both end up as a COMPLETE set — which
  // also repairs the stale five-key Directus default that predates the
  // `projects` and `activity` grants and leaves rows short of keys.
  let after: Record<string, boolean>;
  const presetKey = body?.presetKey ? String(body.presetKey) : null;
  if (presetKey) {
    const preset = presetFor(presetKey);
    if (!preset) throw createError({ statusCode: 400, statusMessage: "Unknown preset." });
    after = { ...preset.grants };
  } else {
    const key = String(body?.key || "") as ManagerGrantKey;
    if (!MANAGER_GRANT_KEYS.includes(key)) {
      throw createError({ statusCode: 400, statusMessage: "Unknown permission." });
    }
    after = { ...before, [key]: body?.value === true };
  }

  await directus.request(
    updateItem("hoa_members", memberId, { manager_permissions: after } as any)
  );

  // Same shape the transition executor reads: the session user is loosely typed
  // and carries snake_case Directus fields the session type does not declare.
  const user: any = session.user ?? {};

  const entry = buildGrantChangeEntry({
    organizationId: orgId,
    organizationName: orgs?.[0]?.name ?? null,
    manager: {
      memberId,
      name: [member.first_name, member.last_name].filter(Boolean).join(" ").trim(),
      email: member.email ?? null,
    },
    before,
    after,
    actor: {
      userId: user.id ?? null,
      name:
        [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
        user.email ||
        "An administrator",
      email: user.email ?? null,
    },
    occurredAt: new Date().toISOString(),
    presetKey,
  });

  // The permission change has already landed. If the entry fails to write, say
  // so rather than reporting a clean success on a history with a hole in it —
  // the same call the transition executor makes, for the same reason.
  let recorded = false;
  let recordError: string | null = null;
  if (entry) {
    try {
      await writeAuditEntry(entry);
      recorded = true;
    } catch (e: any) {
      console.error("[managers/grants] audit write failed:", e);
      recordError = e?.message || "The change was saved but could not be recorded in the ledger.";
    }
  }

  return {
    manager_permissions: after,
    /** False for a no-op as well as a failure — `recordError` tells them apart. */
    recorded,
    recordError,
    summary: entry?.summary ?? null,
  };
});
