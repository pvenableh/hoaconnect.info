/**
 * usePolls — community feedback polls.
 *
 * Admins create polls; members vote; results aggregate client-side. One vote
 * per (poll, user) unless allow_multiple (changing a single-choice vote replaces
 * the prior one). Backed by hoa_polls + hoa_poll_votes
 * (scripts/create-polls-collections.ts).
 */

export interface PollOption {
  id: string;
  label: string;
}

export interface Poll {
  id: string;
  status: "draft" | "open" | "closed";
  title: string;
  description?: string | null;
  options: PollOption[];
  allow_multiple?: boolean | null;
  is_anonymous?: boolean | null;
  closes_at?: string | null;
  target_audience?: string | null;
  organization?: string | null;
  date_created?: string | null;
}

export interface PollVote {
  id: string;
  poll: string | { id: string };
  option_id: string;
  user?: string | { id: string } | null;
  organization?: string | null;
}

export interface PollResults {
  counts: Record<string, number>;
  total: number;
  myOptionIds: string[];
}

export const usePolls = () => {
  const { user } = useDirectusAuth();
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const { list: listPolls, get: getPoll, create: createPollItem, update: updatePoll } =
    useDirectusItems<Poll>("hoa_polls");
  const { list: listVotes, create: createVote, remove: removeVote } =
    useDirectusItems<PollVote>("hoa_poll_votes");

  const POLL_FIELDS = [
    "id", "status", "title", "description", "options", "allow_multiple",
    "is_anonymous", "closes_at", "target_audience", "organization", "date_created",
  ];

  const listOrgPolls = (statuses: string[] = ["open", "closed"]) =>
    listPolls({
      fields: POLL_FIELDS,
      filter: { organization: { _eq: selectedOrgId.value }, status: { _in: statuses } },
      sort: ["-date_created"],
      limit: 100,
    });

  const getOne = (id: string) => getPoll(id, { fields: POLL_FIELDS });

  const voteUserId = (v: PollVote) => (typeof v.user === "string" ? v.user : v.user?.id);

  const getVotes = (pollId: string) =>
    listVotes({
      fields: ["id", "poll", "option_id", "user", "organization"],
      filter: { poll: { _eq: pollId }, organization: { _eq: selectedOrgId.value } },
      limit: -1,
    });

  // Aggregate votes into per-option counts + the current user's selections.
  const tally = (votes: PollVote[]): PollResults => {
    const counts: Record<string, number> = {};
    const myOptionIds: string[] = [];
    for (const v of votes) {
      counts[v.option_id] = (counts[v.option_id] || 0) + 1;
      if (voteUserId(v) === user.value?.id) myOptionIds.push(v.option_id);
    }
    return { counts, total: votes.length, myOptionIds };
  };

  const createPoll = async (input: {
    title: string;
    description?: string;
    options: PollOption[];
    allow_multiple?: boolean;
    is_anonymous?: boolean;
    closes_at?: string | null;
    target_audience?: string;
    status?: "draft" | "open";
  }) => {
    if (!selectedOrgId.value) throw new Error("No organization selected");
    return createPollItem({
      title: input.title,
      description: input.description || null,
      options: input.options,
      allow_multiple: input.allow_multiple || false,
      is_anonymous: input.is_anonymous || false,
      closes_at: input.closes_at || null,
      target_audience: input.target_audience || "all",
      status: input.status || "open",
      organization: selectedOrgId.value,
    } as Poll);
  };

  /**
   * Closing goes through the server, because closing is the outcome the
   * Community Ledger records — the route reads the tally at the moment of
   * closing and writes it into the append-only record. See
   * core/server/api/org/polls/close.post.ts. Reopening stays a plain update:
   * it undoes a close rather than deciding anything, and if the poll is closed
   * a second time the ledger records the second outcome, which is the honest
   * account of what happened.
   */
  const closePoll = async (id: string) => {
    if (!selectedOrgId.value) throw new Error("No organization selected");
    return await $fetch("/api/org/polls/close", {
      method: "POST",
      body: { orgId: selectedOrgId.value, pollId: id },
    });
  };
  const reopenPoll = (id: string) => updatePoll(id, { status: "open" } as Partial<Poll>);

  // Cast (or toggle) a vote. For single-choice polls, replaces any prior vote.
  const vote = async (poll: Poll, optionId: string, currentVotes: PollVote[]) => {
    if (!selectedOrgId.value || !user.value?.id) return;
    const mine = currentVotes.filter((v) => voteUserId(v) === user.value?.id);
    const existingForOption = mine.find((v) => v.option_id === optionId);

    if (existingForOption) {
      // Toggle off.
      await removeVote(existingForOption.id);
      return;
    }
    if (!poll.allow_multiple) {
      // Replace any prior single-choice vote.
      for (const v of mine) await removeVote(v.id);
    }
    await createVote({
      poll: poll.id,
      option_id: optionId,
      organization: selectedOrgId.value,
    } as PollVote);
  };

  return { listOrgPolls, getOne, getVotes, tally, createPoll, closePoll, reopenPoll, vote };
};
