/**
 * POST /api/org/polls/create
 *
 * Put a question to the community.
 *
 * `usePolls().createPoll()` was a client-side Directus insert, which works for
 * an org admin and fails on a toast for the one party the `feedback` grant was
 * built to include: a property manager's role policy has no `hoa_polls` at all,
 * deliberately — a role permission is identical across every community that
 * manager works for and no admin can switch it off. So the page offered a
 * manager holding the grant a "New poll" button that Directus would refuse.
 * That is the same shape of bug as `25fa1a8`, where the UI offered an admin a
 * ballot the permissions declined.
 *
 * The fix is not a wider Directus policy. It is this route: the grant is read
 * per community, by the same `canManage` the page renders its button from, and
 * the insert runs with the admin token. **A poll a manager creates is therefore
 * indistinguishable from one an admin created** — same collection, same fields,
 * same `organization`. Nothing downstream needs to know which hat opened it.
 *
 * ── Why no ledger entry ─────────────────────────────────────────────────────
 *
 * Deliberate, and the boundary is the one in `core/shared/ledger/entry.ts`: an
 * entry records an OUTCOME. Asking a question is not one. A poll that opens and
 * never closes decided nothing, so there is nothing a board or a successor
 * would need to prove about it — and `poll_closed` already carries the title,
 * the full tally and the scheduled close date, so a created-poll row would add
 * nothing to the record except noise in the community's feed. This is the same
 * call `document_published` makes when it writes on publish and not on upload.
 */

import { createItem } from "@directus/sdk";

type PollStatus = "draft" | "open";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody(event);

  const orgId = await resolveOrgId({ orgId: body?.orgId, slug: body?.slug });
  if (!orgId) {
    throw createError({ statusCode: 400, statusMessage: "orgId or slug is required" });
  }

  await requirePollManage(event, orgId);

  const title = String(body?.title ?? "").trim();
  if (!title) {
    throw createError({ statusCode: 400, statusMessage: "A poll needs a question." });
  }

  // Options are normalized here rather than trusted: the client sends whatever
  // its form held, and the option `id`s become the keys every vote row and every
  // ledger tally is written against. A blank label or a duplicate id would be
  // permanent in a way a typo in the title is not.
  const rawOptions: any[] = Array.isArray(body?.options) ? body.options : [];
  const seen = new Set<string>();
  const options = rawOptions
    .map((o: any, i: number) => ({
      id: String(o?.id ?? "").trim() || `opt-${i + 1}`,
      label: String(o?.label ?? "").trim(),
    }))
    .filter((o) => {
      if (!o.label || seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });

  if (options.length < 2) {
    throw createError({
      statusCode: 400,
      statusMessage: "A poll needs at least two options with labels.",
    });
  }

  const status: PollStatus = body?.status === "draft" ? "draft" : "open";

  const created = (await getTypedDirectus().request(
    createItem("hoa_polls", {
      title,
      description: String(body?.description ?? "").trim() || null,
      options,
      allow_multiple: body?.allow_multiple === true,
      is_anonymous: body?.is_anonymous === true,
      closes_at: body?.closes_at || null,
      target_audience: String(body?.target_audience ?? "").trim() || "all",
      status,
      // From the resolved org, never from the body — the only thing standing
      // between a poll and the wrong community is that this line is not
      // `body.organization`.
      organization: orgId,
    } as any)
  )) as any;

  return { id: String(created?.id ?? ""), status };
});
