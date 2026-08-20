/**
 * POST /api/org/polls/reopen
 *
 * Open a closed vote again — and record that the community's recorded outcome
 * was set aside.
 *
 * Two things were wrong with `reopenPoll` as a client-side Directus PATCH.
 *
 * The first is the same permission gap as create: a property manager holding
 * this community's `feedback` grant is shown "Reopen" by `PollCard`, because
 * the page renders from `canManage` — and their role policy has no `hoa_polls`,
 * so the write failed on a toast. Board officers who are not org admins were in
 * the same position on `close`, which asked `requireAdminOrManagerGrant` (no
 * notion of a board seat) rather than `canManage`. All three routes now share
 * `requirePollManage`, which is the page's own question.
 *
 * The second is worse, and is why this route writes a ledger entry.
 *
 * ── Reopening un-decides something that was recorded ────────────────────────
 *
 * Closing a poll writes an owner-visible `poll_closed` row: the community
 * decided this, on this date, by this tally. Reopening it lets the ballot
 * change — and left silent, the ledger keeps asserting a decision the community
 * no longer holds. A board WILL cite that row. `ai_action_undone` exists for
 * exactly this failure ("technically true and materially misleading"), and a
 * reopened vote is the same shape, so it gets the same treatment: a new entry,
 * never an edit, at the same owner visibility as the row it corrects.
 *
 * The entry carries the tally as it stood at the moment of reopening — the
 * result being set aside — because "what did it say before" is the question a
 * reader has a year later, and an entry has to answer it without this codebase.
 * Counts only: the aggregation happens in `readPollTally`, and the builder has
 * no shape that could accept a voter.
 *
 * Opening a DRAFT is not a correction — it is asking the question for the first
 * time — so the write happens and no row is written. Same for a poll that was
 * already open. That decision lives in `buildPollReopenedEntry`, once.
 */

import { updateItem } from "@directus/sdk";
import { buildPollReopenedEntry } from "#core/shared/ledger/entries";

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

  const poll = await readOrgPoll(orgId, pollId);
  if (!poll) {
    throw createError({ statusCode: 404, statusMessage: "No such poll in this community." });
  }

  // Already open: nothing to do and nothing to record.
  if (poll.status === "open") {
    return { reopened: false, recorded: false, recordError: null, summary: null };
  }

  const wasClosed = poll.status === "closed";

  // Read the ballot BEFORE reopening. Once it is open the tally can move, and
  // the entry is about the result that stood at this moment.
  const [orgName, tally] = wasClosed
    ? await Promise.all([readOrgName(orgId), readPollTally(orgId, poll)])
    : [null, { results: [], votesCast: 0, voters: 0 }];

  const entry = buildPollReopenedEntry({
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

  await getTypedDirectus().request(
    updateItem("hoa_polls", pollId, { status: "open" } as any)
  );

  if (!entry) {
    // A draft being put to the community. Opened, correctly unrecorded.
    return { reopened: true, recorded: false, recordError: null, summary: null };
  }

  let recorded = false;
  let recordError: string | null = null;
  try {
    await writeAuditEntry(entry);
    recorded = true;
  } catch (e: any) {
    console.error("[polls/reopen] audit write failed:", e);
    recordError =
      e?.message || "The poll was reopened but the correction could not be recorded in the ledger.";
  }

  return { reopened: true, recorded, recordError, summary: entry.summary };
});
