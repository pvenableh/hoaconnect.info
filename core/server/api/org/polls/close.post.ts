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
 * **The tally is aggregated HERE, and only the counts leave.** The vote rows
 * carry `user`, and they are read with the admin token — so the aggregation has
 * to happen on this side of the entry builder, which has no shape that could
 * accept a voter. See `buildPollClosedEntry` for why that matters more than it
 * looks.
 *
 * Admin, or a property manager holding the `communications` grant — the same
 * people who can run a poll in the first place.
 */

import { readItems, updateItem } from "@directus/sdk";
import { buildPollClosedEntry, type PollOptionTally } from "#core/shared/ledger/entries";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const orgId = String(body?.orgId || "").trim();
  const pollId = String(body?.pollId || "").trim();
  if (!orgId || !pollId) {
    throw createError({ statusCode: 400, statusMessage: "orgId and pollId are required" });
  }

  await requireAdminOrManagerGrant(event, orgId, "communications");

  const directus = getTypedDirectus();

  const [polls, orgs] = await Promise.all([
    // Through the org filter: a pollId from another community must miss.
    directus.request(
      readItems("hoa_polls", {
        filter: { id: { _eq: pollId }, organization: { _eq: orgId } },
        fields: ["id", "title", "status", "options", "allow_multiple", "closes_at"] as any,
        limit: 1,
      })
    ) as Promise<any[]>,
    directus.request(
      readItems("hoa_organizations", {
        filter: { id: { _eq: orgId } },
        fields: ["name"] as any,
        limit: 1,
      })
    ) as Promise<any[]>,
  ]);

  const poll = polls?.[0];
  if (!poll) {
    throw createError({ statusCode: 404, statusMessage: "No such poll in this community." });
  }

  // Read the ballot before closing it. Every vote row for this poll, scoped to
  // the org on both sides of the join.
  const votes = (await directus.request(
    readItems("hoa_poll_votes", {
      filter: { poll: { _eq: pollId }, organization: { _eq: orgId } },
      fields: ["option_id", "user"] as any,
      limit: -1,
    })
  )) as any[];

  const counts = new Map<string, number>();
  const voters = new Set<string>();
  for (const v of votes ?? []) {
    const optionId = String(v?.option_id ?? "");
    if (optionId) counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
    const who = typeof v?.user === "string" ? v.user : v?.user?.id;
    if (who) voters.add(String(who));
  }

  // Ballot order, from the poll's own options — so an option nobody chose is
  // recorded as zero rather than vanishing from the result.
  const options: any[] = Array.isArray(poll.options) ? poll.options : [];
  const results: PollOptionTally[] = options.map((o: any, i: number) => {
    const optionId = String(o?.id ?? i);
    return {
      optionId,
      label: String(o?.label ?? optionId),
      count: counts.get(optionId) ?? 0,
    };
  });

  const user: any = session.user ?? {};
  const occurredAt = new Date().toISOString();

  const entry = buildPollClosedEntry({
    organizationId: orgId,
    organizationName: orgs?.[0]?.name ?? null,
    poll: {
      pollId: String(poll.id),
      title: poll.title ?? "",
      allowMultiple: poll.allow_multiple === true,
      closesAt: poll.closes_at ?? null,
    },
    previousStatus: poll.status ?? null,
    tally: {
      results,
      votesCast: (votes ?? []).length,
      // Anonymous polls store no user, so this can legitimately be 0 while
      // votes were cast. It is a count either way and never a list.
      voters: voters.size,
    },
    actor: {
      userId: user.id ?? null,
      name:
        [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
        user.email ||
        "An administrator",
      email: user.email ?? null,
    },
    occurredAt,
  });

  // Closing an already-closed poll is a no-op in both halves: no write, no row.
  if (!entry) {
    return { closed: false, recorded: false, recordError: null, summary: null };
  }

  await directus.request(updateItem("hoa_polls", pollId, { status: "closed" } as any));

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
