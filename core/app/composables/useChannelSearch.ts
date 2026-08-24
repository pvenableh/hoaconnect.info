// useChannelSearch — message search within one channel and across every channel
// the caller can read.
//
// Phase 3 (Parity Round 2) moved the query to the server. Client-side it ran on
// the caller's own Directus token, which made it access-correct by accident and
// blind by design: the hits carried no author, and org-wide results could only
// name the channel because the browser happened to ask for the relation. The
// route (`/api/hoa/channels/search`) computes the readable-channel scope
// explicitly, returns the author, and centralises the two-character minimum —
// so a one-character `_icontains` over a community's whole message history
// stops being one keystroke away.
//
// Signatures are unchanged, so the three existing call sites did not have to
// move; `snippet` and `stripHtml` still behave as before.

export interface ChannelSearchAuthor {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar: string | null;
}

export interface ChannelSearchResult {
  id: string;
  content: string;
  snippet: string;
  date_created: string | null;
  channel: { id: string; name: string; slug: string } | null;
  author?: ChannelSearchAuthor | null;
}

const stripHtml = (html: string): string =>
  (html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

interface SearchResponse {
  query: string;
  items: ChannelSearchResult[];
}

const run = async (params: Record<string, string | number>): Promise<ChannelSearchResult[]> => {
  try {
    const res = await $fetch<SearchResponse>("/api/hoa/channels/search", { params });
    return res?.items || [];
  } catch {
    // A failed search is an empty search, not a broken page.
    return [];
  }
};

export const useChannelSearch = () => {
  /** Search messages within a single channel. */
  const searchInChannel = async (
    channelId: string,
    query: string
  ): Promise<ChannelSearchResult[]> => {
    const q = query.trim();
    if (q.length < 2 || !channelId) return [];
    return run({ q, channel: channelId, limit: 50 });
  };

  /** Search across every channel the user can read in an org. */
  const searchOrg = async (orgId: string, query: string): Promise<ChannelSearchResult[]> => {
    const q = query.trim();
    if (q.length < 2 || !orgId) return [];
    return run({ q, organization: orgId, limit: 50 });
  };

  return { searchInChannel, searchOrg, stripHtml };
};
