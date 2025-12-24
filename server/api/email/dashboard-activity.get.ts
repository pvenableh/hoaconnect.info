import { readItems } from "@directus/sdk";
import type { HoaEmailActivity, HoaEmailRecipient, HoaEmail } from "~~/types/directus";

/**
 * Get email activity data for the dashboard
 * Returns aggregated stats for the last 7 days
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const query = getQuery(event);
  const organizationId = query.organizationId as string;

  if (!organizationId) {
    throw createError({
      statusCode: 400,
      message: "Organization ID is required",
    });
  }

  try {
    const directus = getTypedDirectus();

    // Get date range for last 7 days
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Fetch emails from the organization in the last 7 days
    const emails = await directus.request(
      readItems("hoa_emails", {
        filter: {
          organization: { _eq: organizationId },
          date_created: { _gte: sevenDaysAgo.toISOString() },
        },
        fields: ["id", "status", "recipient_count", "delivered_count", "sent_at", "date_created"],
        limit: -1,
      })
    ) as HoaEmail[];

    // Get all email IDs for fetching activity
    const emailIds = emails.map(e => e.id);

    // Fetch email recipients for these emails
    const recipients = emailIds.length > 0 ? await directus.request(
      readItems("hoa_email_recipients", {
        filter: {
          email: { _in: emailIds },
        },
        fields: ["id", "email", "status", "sent_at"],
        limit: -1,
      })
    ) as HoaEmailRecipient[] : [];

    // Fetch email activity for these emails
    const activities = emailIds.length > 0 ? await directus.request(
      readItems("hoa_email_activity", {
        filter: {
          email_recipient: {
            email: { _in: emailIds },
          },
        },
        fields: ["id", "event", "date_created", "event_timestamp"],
        limit: -1,
      })
    ) as HoaEmailActivity[] : [];

    // Group data by date
    const dailyData: Record<string, { sent: number; delivered: number; opened: number }> = {};

    // Initialize the last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split("T")[0];
      dailyData[dateKey] = { sent: 0, delivered: 0, opened: 0 };
    }

    // Count sent emails by date
    for (const recipient of recipients) {
      if (recipient.sent_at) {
        const dateKey = recipient.sent_at.split("T")[0];
        if (dailyData[dateKey]) {
          dailyData[dateKey].sent++;
          if (recipient.status === "delivered" || recipient.status === "sent") {
            dailyData[dateKey].delivered++;
          }
        }
      }
    }

    // Count opens by date (from activity)
    const uniqueOpens = new Set<string>();
    for (const activity of activities) {
      if (activity.event === "open") {
        const activityDate = activity.date_created ||
          (activity.event_timestamp ? new Date(activity.event_timestamp * 1000).toISOString() : null);

        if (activityDate) {
          const dateKey = activityDate.split("T")[0];
          // Track unique opens per recipient per day
          const recipientKey = `${activity.email_recipient}-${dateKey}`;
          if (!uniqueOpens.has(recipientKey) && dailyData[dateKey]) {
            uniqueOpens.add(recipientKey);
            dailyData[dateKey].opened++;
          }
        }
      }
    }

    // Convert to array format for the chart
    const chartData = Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        ...data,
      }));

    // Calculate overall stats
    const totalSent = recipients.length;
    const totalDelivered = recipients.filter(r => r.status === "delivered" || r.status === "sent").length;
    const totalOpens = activities.filter(a => a.event === "open").length;
    const totalClicks = activities.filter(a => a.event === "click").length;
    const totalBounces = activities.filter(a => a.event === "bounce").length;

    // Get unique opens/clicks
    const uniqueOpenRecipients = new Set(
      activities.filter(a => a.event === "open").map(a => a.email_recipient)
    ).size;
    const uniqueClickRecipients = new Set(
      activities.filter(a => a.event === "click").map(a => a.email_recipient)
    ).size;

    return {
      success: true,
      chartData,
      stats: {
        totalSent,
        totalDelivered,
        totalOpens,
        uniqueOpens: uniqueOpenRecipients,
        totalClicks,
        uniqueClicks: uniqueClickRecipients,
        totalBounces,
        openRate: totalDelivered > 0 ? Math.round((uniqueOpenRecipients / totalDelivered) * 100) : 0,
        clickRate: uniqueOpenRecipients > 0 ? Math.round((uniqueClickRecipients / uniqueOpenRecipients) * 100) : 0,
      },
    };
  } catch (error: any) {
    console.error("Dashboard activity error:", error);
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to fetch dashboard activity",
    });
  }
});
