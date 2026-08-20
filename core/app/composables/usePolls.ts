/**
 * usePolls — community feedback polls.
 *
 * Members vote; the community's admins, its board, and a property manager
 * holding its `feedback` grant run the polls. One vote per (poll, user) unless
 * allow_multiple (changing a single-choice vote replaces the prior one). Backed
 * by hoa_polls + hoa_poll_votes (scripts/create-polls-collections.ts).
 *
 * **Everything except casting a vote goes through /api/org/polls.** Not for
 * tidiness: a manager's Directus role policy has no `hoa_polls` at all and
 * should not, because a role permission is the same in every community that
 * manager works for and no admin can turn it off. The per-community grant is
 * only readable server-side, so any control the page renders from `canManage`
 * needs a route behind it or it offers an action the permissions refuse.
 * Closing and reopening additionally write the Community Ledger.
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
  /** The caller's OWN vote rows — needed to change a mind, which means deleting one. */
  myVotes: Array<{ id: string; option_id: string }>;
  /** A property manager may run a community's polls without getting a ballot. */
  canVote: boolean;
}

/** What the route says this caller may do — resolved there, never inferred here. */
export interface PollViewer {
  canManage: boolean;
  canVote: boolean;
  /** Reading on a manager grant rather than a seat or an office. */
  viaGrant: boolean;
}

const NO_VIEWER: PollViewer = { canManage: false, canVote: false, viaGrant: false };
const EMPTY_RESULTS: PollResults = {
  counts: {},
  total: 0,
  myOptionIds: [],
  myVotes: [],
  canVote: false,
};

export const usePolls = () => {
  const { user } = useDirectusAuth();
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const route = useRoute();

  /**
   * Which community these polls belong to.
   *
   * The URL wins over the stored selection. `selectedOrgId` resets to the
   * user's first membership on a hard navigation, so a bookmarked
   * `/{slug}/polls` would otherwise ask about a different community and get a
   * plausible empty answer. The server accepts either.
   */
  const orgParam = (): Record<string, string> => {
    const slug = String(route.params?.slug ?? "").trim();
    if (slug) return { slug };
    return selectedOrgId.value ? { orgId: selectedOrgId.value } : {};
  };
  const hasOrg = () => Object.keys(orgParam()).length > 0;
  // Reads and manage-writes go through /api/org/polls. The one direct Directus
  // write left is a member casting their OWN vote — see `vote()` for why that
  // one is better off where it is.
  const { get: getPoll } = useDirectusItems<Poll>("hoa_polls");
  const { create: createVote, remove: removeVote } =
    useDirectusItems<PollVote>("hoa_poll_votes");

  const POLL_FIELDS = [
    "id", "status", "title", "description", "options", "allow_multiple",
    "is_anonymous", "closes_at", "target_audience", "organization", "date_created",
  ];

  /**
   * Reading polls goes through the server, not Directus.
   *
   * Not for tidiness: a property manager's Directus policy has no `hoa_polls`
   * at all, and it should not — a role permission is the same in every
   * community that manager works for, and no admin can switch it off. The
   * server route reads the per-manager `feedback` grant instead, so the answer
   * is per community and an admin owns it. See core/server/utils/poll-access.ts.
   */
  const listOrgPolls = async (statuses: string[] = ["open", "closed"]) =>
    (await fetchOrgPolls(statuses)).polls;

  /** The same read, keeping the viewer the route resolved. */
  const fetchOrgPolls = async (
    statuses: string[] = ["open", "closed"]
  ): Promise<{ polls: Poll[]; viewer: PollViewer }> => {
    if (!hasOrg()) return { polls: [], viewer: NO_VIEWER };
    return await $fetch<{ polls: Poll[]; viewer: PollViewer }>("/api/org/polls", {
      query: { ...orgParam(), statuses: statuses.join(",") },
    });
  };

  const getOne = (id: string) => getPoll(id, { fields: POLL_FIELDS });

  /**
   * One poll's tally. Counts and the caller's own ballot — never anyone else's.
   * The route is where that boundary is enforced, not this file: it holds the
   * rows, and only two derived things leave it.
   */
  const getResults = async (pollId: string): Promise<PollResults> => {
    if (!hasOrg()) return EMPTY_RESULTS;
    return await $fetch<PollResults>("/api/org/polls/votes", {
      query: { ...orgParam(), pollId },
    });
  };

  /**
   * Create a poll — through the server, for the same reason reading is.
   *
   * This was a direct Directus insert, and a property manager holding the
   * community's `feedback` grant is shown the "New poll" button (the page
   * renders from `canManage`) while their role policy has no `hoa_polls` at
   * all. The button offered an action the permissions refused. The route reads
   * the grant per community and inserts with the admin token, so a poll a
   * manager creates is indistinguishable from one an admin created.
   *
   * It also resolves the org from the URL rather than `selectedOrgId`, which
   * resets to the user's first membership on a hard navigation — the same trap
   * the reads already avoid.
   */
  const createPoll = async (input: {
    title: string;
    description?: string;
    options: PollOption[];
    allow_multiple?: boolean;
    is_anonymous?: boolean;
    closes_at?: string | null;
    target_audience?: string;
    status?: "draft" | "open";
  }): Promise<{ id: string; status: string }> => {
    if (!hasOrg()) throw new Error("No organization selected");
    return await $fetch<{ id: string; status: string }>("/api/org/polls/create", {
      method: "POST",
      body: {
        ...orgParam(),
        title: input.title,
        description: input.description || null,
        options: input.options,
        allow_multiple: input.allow_multiple || false,
        is_anonymous: input.is_anonymous || false,
        closes_at: input.closes_at || null,
        target_audience: input.target_audience || "all",
        status: input.status || "open",
      },
    });
  };

  /**
   * Closing goes through the server, because closing is the outcome the
   * Community Ledger records — the route reads the tally at the moment of
   * closing and writes it into the append-only record. See
   * core/server/api/org/polls/close.post.ts.
   */
  const closePoll = async (id: string) => {
    if (!hasOrg()) throw new Error("No organization selected");
    return await $fetch("/api/org/polls/close", {
      method: "POST",
      body: { ...orgParam(), pollId: id },
    });
  };

  /**
   * Reopening goes through the server too — and it is NOT the harmless inverse
   * of closing that it looks like.
   *
   * Closing wrote an owner-visible ledger row saying the community decided
   * something. Reopening lets the ballot change, so left silent it leaves the
   * record asserting a decision the community no longer holds. The route writes
   * a `poll_reopened` entry carrying the result being set aside — a correction
   * as a new row, never an edit. See core/server/api/org/polls/reopen.post.ts.
   */
  const reopenPoll = async (id: string) => {
    if (!hasOrg()) throw new Error("No organization selected");
    return await $fetch("/api/org/polls/reopen", {
      method: "POST",
      body: { ...orgParam(), pollId: id },
    });
  };

  /**
   * Cast (or toggle) a vote. For single-choice polls, replaces any prior vote.
   *
   * Still a direct Directus write, unlike the reads, and deliberately so:
   * `hoa_poll_votes.create` is validated per row against `$CURRENT_USER`, so
   * Directus already enforces the only thing a server route would add — you may
   * cast your OWN vote in your OWN community and nobody else's. `user` is
   * filled by the collection (`special: user-created`); sending it is how you
   * get refused.
   */
  const vote = async (poll: Poll, optionId: string, results: PollResults) => {
    if (!selectedOrgId.value || !user.value?.id) return;
    const mine = results.myVotes ?? [];
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

  return {
    listOrgPolls,
    fetchOrgPolls,
    getOne,
    getResults,
    createPoll,
    closePoll,
    reopenPoll,
    vote,
  };
};
