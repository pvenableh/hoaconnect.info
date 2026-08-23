/**
 * useActivityFeed — the unified "Building" feed.
 *
 * Aggregates the community's shared content (announcements, meetings, published
 * documents) into one reverse-chronological stream. Each FeedItem points at its
 * source (collection + id) so the polymorphic reaction + comment rails attach
 * directly — every item in the feed is reactable and commentable.
 *
 * Community content (announcements, meetings, documents) is shown to everyone.
 * Requests/tasks are personal — only those assigned to or submitted by the
 * current user appear, so the feed doubles as the user's action list.
 *
 * Sent EMAILS are here too, via /api/hoa/community-news. They cannot be read
 * with a member's own token — the HOA Member policy has no access to
 * `hoa_emails` — so that route applies the rule (public, or the member was a
 * recipient) with the service token. Communities migrated from an email-first
 * system keep their whole history there rather than in `hoa_announcements`.
 */
import { getWorkflow } from "#core/app/config/requestWorkflows";

export interface FeedItem {
  id: string;
  sourceCollection: string;
  sourceId: string;
  kind: "announcement" | "meeting" | "document" | "request" | "poll" | "email";
  title: string;
  subtitle?: string;
  excerpt?: string;
  date: string;
  icon: string;
  accent: string; // tailwind text/bg accent key
  isPinned?: boolean;
  raw?: any; // full source row when the card needs it (e.g. a poll)
}

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, "").trim();

export const useActivityFeed = () => {
  const { user } = useDirectusAuth();
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const { list: listAnnouncements } = useDirectusItems("hoa_announcements");
  const { list: listMeetings } = useDirectusItems("hoa_meetings");
  const { list: listDocuments } = useDirectusItems("hoa_documents");
  const { list: listRequests } = useDirectusItems("hoa_requests");
  const { list: listPolls } = useDirectusItems("hoa_polls");

  const { orgSlug } = useOrgNavigation();
  const items = ref<FeedItem[]>([]);
  const isLoading = ref(false);

  const ANNOUNCEMENT_ACCENT: Record<string, string> = {
    urgent: "red",
    maintenance: "amber",
    event: "blue",
    reminder: "purple",
    general: "stone",
  };

  const fetchFeed = async (audienceFilter: string[] = ["all"]) => {
    if (!selectedOrgId.value) return [];
    isLoading.value = true;
    const all: FeedItem[] = [];

    try {
      const announcements = (await listAnnouncements({
        fields: [
          "id",
          "title",
          "content",
          "announcement_type",
          "is_pinned",
          "publish_date",
          "date_created",
        ],
        filter: {
          organization: { _eq: selectedOrgId.value },
          status: { _eq: "published" },
          target_audience: { _in: audienceFilter },
        },
        sort: ["-is_pinned", "-publish_date", "-date_created"],
        limit: 30,
      })) as any[];
      all.push(
        ...announcements.map((a) => ({
          id: `announcement-${a.id}`,
          sourceCollection: "hoa_announcements",
          sourceId: a.id,
          kind: "announcement" as const,
          title: a.title || "Announcement",
          subtitle: (a.announcement_type || "general").replace(/_/g, " "),
          excerpt: a.content ? stripHtml(a.content).slice(0, 200) : undefined,
          date: a.publish_date || a.date_created || "",
          icon: "lucide:megaphone",
          accent: ANNOUNCEMENT_ACCENT[a.announcement_type || "general"] || "stone",
          isPinned: !!a.is_pinned,
        }))
      );
    } catch (e) {
      console.warn("Feed: announcements failed", e);
    }

    try {
      const audience = audienceFilter.map((a) => (a === "board members" ? "board_members" : a));
      const meetings = (await listMeetings({
        fields: ["id", "title", "type", "agenda", "meeting_date", "date_created", "is_published", "target_audience"],
        filter: {
          organization: { _eq: selectedOrgId.value },
          is_published: { _eq: true },
          target_audience: { _in: audience },
        },
        sort: ["-date_created"],
        limit: 20,
      })) as any[];
      all.push(
        ...meetings.map((m) => ({
          id: `meeting-${m.id}`,
          sourceCollection: "hoa_meetings",
          sourceId: m.id,
          kind: "meeting" as const,
          title: m.title || "Meeting",
          subtitle: `${(m.type || "board").replace(/_/g, " ")} meeting`,
          excerpt: m.agenda ? stripHtml(m.agenda).slice(0, 200) : undefined,
          date: m.date_created || m.meeting_date || "",
          icon: "lucide:users",
          accent: "violet",
        }))
      );
    } catch (e) {
      console.warn("Feed: meetings failed", e);
    }

    try {
      const documents = (await listDocuments({
        fields: ["id", "title", "status", "date_published", "date_created", "document_category.name"],
        filter: { organization: { _eq: selectedOrgId.value }, status: { _eq: "published" } },
        sort: ["-date_published", "-date_created"],
        limit: 15,
      })) as any[];
      all.push(
        ...documents.map((d) => ({
          id: `document-${d.id}`,
          sourceCollection: "hoa_documents",
          sourceId: d.id,
          kind: "document" as const,
          title: d.title || "Document",
          subtitle:
            typeof d.document_category === "object" && d.document_category
              ? d.document_category.name
              : "New document",
          date: d.date_published || d.date_created || "",
          icon: "lucide:file-text",
          accent: "sky",
        }))
      );
    } catch (e) {
      console.warn("Feed: documents failed", e);
    }

    // Requests/tasks assigned to or submitted by the current user. Isolated
    // (hoa_requests may not exist until Phase 5 migration).
    if (user.value?.id) {
      try {
        const requests = (await listRequests({
          fields: ["id", "title", "type", "status", "priority", "description", "date_created", "date_updated", "metadata"],
          filter: {
            organization: { _eq: selectedOrgId.value },
            status: { _nin: ["closed"] },
            _or: [
              { assigned_to: { _eq: user.value.id } },
              { submitted_by: { _eq: user.value.id } },
            ],
          },
          sort: ["-date_updated"],
          limit: 20,
        })) as any[];
        all.push(
          ...requests.map((r) => {
            const wf = getWorkflow(r.type);
            return {
              id: `request-${r.id}`,
              sourceCollection: "hoa_requests",
              sourceId: r.id,
              kind: "request" as const,
              title: r.title || "Request",
              subtitle: `${wf.label} · ${(r.status || "open").replace(/_/g, " ")}`,
              excerpt: r.description ? stripHtml(r.description).slice(0, 160) : undefined,
              date: r.date_updated || r.date_created || "",
              icon: wf.icon,
              accent: wf.accent,
            };
          })
        );
      } catch (e) {
        console.warn("Feed: requests failed", e);
      }
    }

    // Open community polls. Isolated (hoa_polls may not exist until migration).
    try {
      const polls = (await listPolls({
        fields: ["id", "status", "title", "description", "options", "allow_multiple", "is_anonymous", "closes_at", "target_audience", "organization", "date_created"],
        filter: {
          organization: { _eq: selectedOrgId.value },
          status: { _eq: "open" },
          target_audience: { _in: audienceFilter },
        },
        sort: ["-date_created"],
        limit: 10,
      })) as any[];
      all.push(
        ...polls.map((p) => ({
          id: `poll-${p.id}`,
          sourceCollection: "hoa_polls",
          sourceId: p.id,
          kind: "poll" as const,
          title: p.title || "Poll",
          subtitle: "Poll",
          date: p.date_created || "",
          icon: "lucide:bar-chart-3",
          accent: "fuchsia",
          raw: p,
        }))
      );
    } catch (e) {
      console.warn("Feed: polls failed", e);
    }

    // Sent emails the member is allowed to see. The route owns the rule and the
    // permissions; a failure here just means no emails in the feed.
    try {
      const slug = unref(orgSlug);
      if (slug) {
        const news = await $fetch<any[]>("/api/hoa/community-news", {
          query: { slug, limit: 30 },
        });
        all.push(
          ...(news || []).map((e) => ({
            id: `email-${e.id}`,
            sourceCollection: "hoa_emails",
            sourceId: String(e.id),
            kind: "email" as const,
            title: e.subject,
            // "Sent to you" reads differently from community news, and a
            // resident should be able to tell which they are looking at.
            subtitle: e.personal ? "Sent to you" : "Community email",
            excerpt: e.subtitle || undefined,
            date: e.sent_at || "",
            icon: e.personal ? "lucide:mail" : "lucide:megaphone",
            accent: e.urgent ? "red" : "sky",
          }))
        );
      }
    } catch (e) {
      console.warn("Feed: community emails failed", e);
    }

    // Pinned announcements first, then newest.
    all.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    items.value = all;
    isLoading.value = false;
    return all;
  };

  return { items, isLoading, fetchFeed };
};
