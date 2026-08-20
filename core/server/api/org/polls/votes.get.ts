/**
 * GET /api/org/polls/votes?slug=…|orgId=…&pollId=…
 *
 * One poll's tally, and the caller's own ballot.
 *
 * The vote rows carry `user`, and this route reads them with the admin token —
 * so what it returns is the whole privacy boundary. Exactly two things leave:
 * the per-option COUNTS, and the rows belonging to the CALLER. There is no
 * shape in which one person's vote reaches another, whatever the poll's
 * `is_anonymous` flag says; that flag is a UI nicety and this is the
 * enforcement. It is the same line `buildPollClosedEntry` draws for the
 * permanent record.
 *
 * The caller's own rows come back with their ids because changing your mind
 * means deleting the row you wrote — `usePolls().vote()` needs them to toggle
 * a choice off or replace a single-choice vote.
 */

import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const query = getQuery(event);

  const orgId = await resolveOrgId({ orgId: query.orgId, slug: query.slug });
  const pollId = String(query.pollId || "").trim();
  if (!orgId || !pollId) {
    throw createError({
      statusCode: 400,
      statusMessage: "pollId and one of orgId or slug are required",
    });
  }

  const access = await requirePollAccess(event, orgId);

  const directus = getTypedDirectus();

  // Read the poll THROUGH the org filter first: a pollId from another community
  // must miss rather than have its tally counted here.
  const polls = (await directus.request(
    readItems("hoa_polls", {
      filter: { id: { _eq: pollId }, organization: { _eq: orgId } },
      fields: ["id"] as any,
      limit: 1,
    })
  )) as any[];
  if (!polls?.length) {
    throw createError({ statusCode: 404, statusMessage: "No such poll in this community." });
  }

  const votes = (await directus.request(
    readItems("hoa_poll_votes", {
      filter: { poll: { _eq: pollId }, organization: { _eq: orgId } },
      fields: ["id", "option_id", "user"] as any,
      limit: -1,
    })
  )) as any[];

  const user: any = session.user ?? {};
  const myUserId = user.id ? String(user.id) : null;

  const counts: Record<string, number> = {};
  const myVotes: Array<{ id: string; option_id: string }> = [];

  for (const v of votes ?? []) {
    const optionId = String(v?.option_id ?? "");
    if (optionId) counts[optionId] = (counts[optionId] ?? 0) + 1;

    const who = typeof v?.user === "string" ? v.user : v?.user?.id;
    if (myUserId && who && String(who) === myUserId) {
      myVotes.push({ id: String(v.id), option_id: optionId });
    }
  }

  return {
    counts,
    total: (votes ?? []).length,
    myVotes,
    myOptionIds: myVotes.map((v) => v.option_id),
    canVote: access.canVote,
  };
});
