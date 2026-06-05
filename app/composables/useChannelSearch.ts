// useChannelSearch — message search within one channel and across all channels
// the current user can see (Phase 8, Track E).
//
// Access is automatic: the membership-scoped read policies (Track A) mean
// hoa_channel_messages queries only ever return messages from channels the user
// belongs to, so org-wide search results are already access-correct. v1 is a
// simple `_icontains` over `content` (HTML); we strip tags for the snippet.

export interface ChannelSearchResult {
  id: string;
  content: string;
  snippet: string;
  date_created: string | null;
  channel: { id: string; name: string; slug: string } | null;
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

const toResult = (m: any): ChannelSearchResult => {
  const channel =
    m.channel && typeof m.channel === "object"
      ? { id: m.channel.id, name: m.channel.name, slug: m.channel.slug }
      : null;
  return {
    id: m.id,
    content: m.content,
    snippet: stripHtml(m.content).slice(0, 160),
    date_created: m.date_created ?? null,
    channel,
  };
};

export const useChannelSearch = () => {
  const { list } = useDirectusItems("hoa_channel_messages");

  /** Search messages within a single channel. */
  const searchInChannel = async (
    channelId: string,
    query: string
  ): Promise<ChannelSearchResult[]> => {
    const q = query.trim();
    if (!q || !channelId) return [];
    const rows = (await list({
      fields: ["id", "content", "date_created"],
      filter: {
        channel: { _eq: channelId },
        status: { _eq: "published" },
        content: { _icontains: q },
      },
      sort: ["-date_created"],
      limit: 50,
    })) as any[];
    return rows.map(toResult);
  };

  /** Search across every channel the user can see in an org. */
  const searchOrg = async (
    orgId: string,
    query: string
  ): Promise<ChannelSearchResult[]> => {
    const q = query.trim();
    if (!q || !orgId) return [];
    const rows = (await list({
      fields: [
        "id",
        "content",
        "date_created",
        "channel.id",
        "channel.name",
        "channel.slug",
      ],
      filter: {
        channel: { organization: { _eq: orgId }, status: { _neq: "deleted" } },
        status: { _eq: "published" },
        content: { _icontains: q },
      },
      sort: ["-date_created"],
      limit: 50,
    })) as any[];
    return rows.map(toResult);
  };

  return { searchInChannel, searchOrg, stripHtml };
};
