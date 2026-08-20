/**
 * POST /api/org/polls/close
 *
 * Close a poll — and record what the community decided.
 *
 * `usePolls().closePoll()` was a one-line client-side Directus PATCH, so the
 * outcome of a vote lived only in the vote rows, and only for as long as they
 * did. A decision a community made is the single thing it is most likely to be
 * asked to prove: this route reads the tally once, at the moment of closing,
 * and writes the result into the append-only record.
 *
 * **The tally is aggregated before the builder sees it, and only the counts
 * leave.** The vote rows carry `user`, and they are read with the admin token —
 * so the aggregation happens in `readPollTally`, on this side of the entry
 * builder, which has no shape that could accept a voter. See
 * `buildPollClosedEntry` for why that matters more than it looks.
 *
 * Who may close it is `requirePollManage`: the community's admins, its board,
 * or a manager holding this community's `feedback` grant. It asked
 * `requireAdminOrManagerGrant("feedback")` until now, which is admin-or-manager
 * and has no notion of a board seat — so `PollCard` offered "Close" to every
 * board officer (the page renders from `canManage`) and the route refused the
 * ones who were not also org admins. Sharing one guard with create and reopen
 * is what stops the page and the route drifting apart again.
 */

import { updateItem } from "@directus/sdk";
import { buildPollClosedEntry } from "#core/shared/ledger/entries";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const orgId = await resolveOrgId({ orgId: body?.orgId, slug: body?.slug });
  const pollId = String(body?.pollId || "").trim();
  if (!orgId || !pollId) {
    throw createError({
      statusCode: 400,
      statusMessage: "pollId and one of orgId or slug are required",
    });
  }

  await requirePollManage(event, orgId);

  // Through the org filter: a pollId from another community must miss.
  const poll = await readOrgPoll(orgId, pollId);
  if (!poll) {
    throw createError({ statusCode: 404, statusMessage: "No such poll in this community." });
  }

  // Read the ballot before closing it.
  const [orgName, tally] = await Promise.all([readOrgName(orgId), readPollTally(orgId, poll)]);

  const entry = buildPollClosedEntry({
    organizationId: orgId,
    organizationName: orgName,
    poll: {
      pollId: poll.id,
      title: poll.title,
      allowMultiple: poll.allow_multiple,
      closesAt: poll.closes_at,
    },
    previousStatus: poll.status,
    tally,
    actor: ledgerActorFromSession(session.user),
    occurredAt: new Date().toISOString(),
  });

  // Closing an already-closed poll is a no-op in both halves: no write, no row.
  if (!entry) {
    return { closed: false, recorded: false, recordError: null, summary: null };
  }

  await getTypedDirectus().request(updateItem("hoa_polls", pollId, { status: "closed" } as any));

  let recorded = false;
  let recordError: string | null = null;
  try {
    await writeAuditEntry(entry);
    recorded = true;
  } catch (e: any) {
    console.error("[polls/close] audit write failed:", e);
    recordError = e?.message || "The poll was closed but could not be recorded in the ledger.";
  }

  return { closed: true, recorded, recordError, summary: entry.summary };
});
