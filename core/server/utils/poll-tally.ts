/**
 * Reading a poll, and counting its ballot — the half of the poll routes that
 * touches Directus.
 *
 * Two routes need the same two things: the poll row (scoped to the org on the
 * query, so a pollId from another community MISSES rather than leaks) and the
 * tally as it stands right now. `close` writes that tally into the record as
 * the outcome; `reopen` writes it as the outcome being set aside. They must
 * count the same way or the two ledger rows for one poll will disagree about
 * what the vote said, which is worse than either row being absent.
 *
 * **Only counts leave this file.** The vote rows carry `user` and are read with
 * the admin token, so the aggregation happens here, before anything reaches an
 * entry builder — the builders have no shape that could accept a voter, and
 * that is only a guarantee if nobody hands them the rows.
 */

import { readItems } from "@directus/sdk";
import type { PollOptionTally, PollTally } from "#core/shared/ledger/entries";

export interface PollRow {
  readonly id: string;
  readonly title: string;
  readonly status: string | null;
  readonly options: any[];
  readonly allow_multiple: boolean | null;
  readonly closes_at: string | null;
}

/** One poll of THIS community, or null. Never throws on a foreign id — it misses. */
export async function readOrgPoll(orgId: string, pollId: string): Promise<PollRow | null> {
  const rows = (await getTypedDirectus().request(
    readItems("hoa_polls", {
      filter: { id: { _eq: pollId }, organization: { _eq: orgId } },
      fields: ["id", "title", "status", "options", "allow_multiple", "closes_at"] as any,
      limit: 1,
    })
  )) as any[];
  const poll = rows?.[0];
  if (!poll) return null;
  return {
    id: String(poll.id),
    title: poll.title ?? "",
    status: poll.status ?? null,
    options: Array.isArray(poll.options) ? poll.options : [],
    allow_multiple: poll.allow_multiple === true,
    closes_at: poll.closes_at ?? null,
  };
}

/** The community's name, for an entry that must read without this database. */
export async function readOrgName(orgId: string): Promise<string | null> {
  const rows = (await getTypedDirectus().request(
    readItems("hoa_organizations", {
      filter: { id: { _eq: orgId } },
      fields: ["name"] as any,
      limit: 1,
    })
  )) as any[];
  return rows?.[0]?.name ?? null;
}

/**
 * The tally for one poll: counts in BALLOT order, votes cast, distinct voters.
 *
 * Ballot order comes from the poll's own options, so an option nobody chose is
 * recorded as zero rather than vanishing from the result. `voters` is
 * legitimately 0 on an anonymous poll that got votes — the rows store no user.
 * It is a count either way and never a list.
 */
export async function readPollTally(orgId: string, poll: PollRow): Promise<PollTally> {
  const votes = (await getTypedDirectus().request(
    readItems("hoa_poll_votes", {
      filter: { poll: { _eq: poll.id }, organization: { _eq: orgId } },
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

  const results: PollOptionTally[] = poll.options.map((o: any, i: number) => {
    const optionId = String(o?.id ?? i);
    return { optionId, label: String(o?.label ?? optionId), count: counts.get(optionId) ?? 0 };
  });

  return { results, votesCast: (votes ?? []).length, voters: voters.size };
}

/** The actor an entry denormalizes, from the session. */
export function ledgerActorFromSession(user: any) {
  const u = user ?? {};
  return {
    userId: u.id ?? null,
    name:
      [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "An administrator",
    email: u.email ?? null,
  };
}
