import { readItems } from "@directus/sdk";
import type { HoaEmailActivity } from "~~/types/directus";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({
      statusCode: 400,
      message: "Email ID is required",
    });
  }

  try {
    const directus = getTypedDirectus();

    // Get all activity for this email's recipients
    const activity = await directus.request(
      readItems("hoa_email_activity", {
        filter: {
          email_recipient: {
            email: { _eq: id },
          },
        },
        fields: [
          "id",
          "event",
          "email",
          "clicked_url",
          "user_agent",
          "ip",
          "reason",
          "event_timestamp",
          "date_created",
          {
            email_recipient: ["id", "recipient_email", "recipient_name"],
          },
        ],
        sort: ["-date_created"],
        limit: 500,
      })
    ) as HoaEmailActivity[];

    // Calculate stats
    const stats = {
      opens: 0,
      uniqueOpens: new Set<string>(),
      clicks: 0,
      uniqueClicks: new Set<string>(),
      bounces: 0,
      delivered: 0,
      dropped: 0,
      spamReports: 0,
      unsubscribes: 0,
    };

    const clickedUrls: Record<string, number> = {};

    for (const event of activity) {
      switch (event.event) {
        case "open":
          stats.opens++;
          if (event.email) stats.uniqueOpens.add(event.email);
          break;
        case "click":
          stats.clicks++;
          if (event.email) stats.uniqueClicks.add(event.email);
          if (event.clicked_url) {
            clickedUrls[event.clicked_url] = (clickedUrls[event.clicked_url] || 0) + 1;
          }
          break;
        case "bounce":
          stats.bounces++;
          break;
        case "delivered":
          stats.delivered++;
          break;
        case "dropped":
          stats.dropped++;
          break;
        case "spam_report":
          stats.spamReports++;
          break;
        case "unsubscribe":
        case "group_unsubscribe":
          stats.unsubscribes++;
          break;
      }
    }

    return {
      success: true,
      stats: {
        opens: stats.opens,
        uniqueOpens: stats.uniqueOpens.size,
        clicks: stats.clicks,
        uniqueClicks: stats.uniqueClicks.size,
        bounces: stats.bounces,
        delivered: stats.delivered,
        dropped: stats.dropped,
        spamReports: stats.spamReports,
        unsubscribes: stats.unsubscribes,
      },
      clickedUrls: Object.entries(clickedUrls)
        .map(([url, count]) => ({ url, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      recentActivity: activity.slice(0, 50).map((a) => ({
        id: a.id,
        event: a.event,
        email: a.email,
        clickedUrl: a.clicked_url,
        timestamp: a.date_created,
        recipientName: (a.email_recipient as any)?.recipient_name,
      })),
    };
  } catch (error: any) {
    console.error("Email activity fetch error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to fetch email activity",
    });
  }
});
