import { createItem, readItems, updateItem } from "@directus/sdk";
import type { HoaEmailActivity, HoaEmailRecipient, HoaMember } from "~~/types/directus";

/**
 * SendGrid Event Webhook Handler
 *
 * This endpoint receives webhook events from SendGrid for email activity tracking.
 * Configure in SendGrid: Settings > Mail Settings > Event Webhook
 *
 * Events tracked: processed, dropped, delivered, deferred, bounce, open, click,
 *                 spam_report, unsubscribe, group_unsubscribe, group_resubscribe
 */

interface SendGridEvent {
  email: string;
  timestamp: number;
  event: string;
  sg_message_id?: string;
  url?: string;
  useragent?: string;
  ip?: string;
  reason?: string;
  status?: string;
  response?: string;
  attempt?: string;
  category?: string[];
  sg_event_id?: string;
  type?: string;
  bounce_classification?: string;
  // Custom args passed from sendOrganizationEmail
  email_id?: string;
  recipient_email?: string;
  organization_id?: string;
}

export default defineEventHandler(async (event) => {
  // SendGrid sends an array of events
  const events = await readBody<SendGridEvent[]>(event);

  if (!Array.isArray(events) || events.length === 0) {
    return { success: true, message: "No events to process" };
  }

  // Filter events where category includes "HOA Connect"
  const filteredEvents = events.filter((entry) => entry.category?.includes("HOA Connect"));

  if (filteredEvents.length === 0) {
    return { success: true, message: "No matching HOA Connect events found" };
  }

  try {
    const directus = getTypedDirectus();
    const processedCount = { success: 0, skipped: 0, failed: 0 };

    for (const sgEvent of filteredEvents) {
      try {
        // Skip if no email or message ID
        if (!sgEvent.email || !sgEvent.sg_message_id) {
          processedCount.skipped++;
          continue;
        }

        // Clean up the message ID (remove any angle brackets and trailing parts)
        const cleanMessageId = sgEvent.sg_message_id.split(".")[0].replace(/[<>]/g, "");

        // Find the recipient record by sg_message_id
        const recipients = await directus.request(
          readItems("hoa_email_recipients", {
            filter: {
              sg_message_id: { _eq: cleanMessageId },
            },
            fields: ["id", "email", "status"],
            limit: 1,
          })
        ) as HoaEmailRecipient[];

        const recipient = recipients[0];

        // Find member by email address
        let memberId: string | null = null;
        if (sgEvent.email) {
          try {
            const members = await directus.request(
              readItems("hoa_members", {
                filter: { email: { _eq: sgEvent.email } },
                fields: ["id"],
                limit: 1,
              })
            ) as HoaMember[];

            if (members && members.length > 0) {
              memberId = members[0].id;
            }
          } catch (memberError) {
            console.error(`Error looking up member by email ${sgEvent.email}:`, memberError);
          }
        }

        // Extract organization ID from categories (format: "org:uuid")
        let organizationId: string | null = sgEvent.organization_id || null;
        if (!organizationId && sgEvent.category && Array.isArray(sgEvent.category)) {
          const orgCategory = sgEvent.category.find((cat) => cat.startsWith("org:"));
          if (orgCategory) {
            organizationId = orgCategory.substring(4); // Remove "org:" prefix
          }
        }

        // Create activity record
        const activityData: Partial<HoaEmailActivity> = {
          email_recipient: recipient?.id || null,
          member: memberId,
          event: sgEvent.event as HoaEmailActivity["event"],
          email: sgEvent.email,
          sg_message_id: cleanMessageId,
          clicked_url: sgEvent.url || null,
          user_agent: sgEvent.useragent || null,
          ip: sgEvent.ip || null,
          reason: sgEvent.reason || sgEvent.response || null,
          event_timestamp: sgEvent.timestamp || null,
          // Organization ID from custom args or categories
          organization: organizationId,
        };

        await directus.request(createItem("hoa_email_activity", activityData));

        // Update recipient status based on event type
        if (recipient) {
          let newStatus: HoaEmailRecipient["status"] | null = null;

          switch (sgEvent.event) {
            case "delivered":
              newStatus = "delivered";
              break;
            case "bounce":
            case "dropped":
              newStatus = "bounced";
              break;
            case "deferred":
              // Keep current status for deferred, it may still deliver
              break;
          }

          if (newStatus && newStatus !== recipient.status) {
            await directus.request(
              updateItem("hoa_email_recipients", recipient.id, {
                status: newStatus,
              })
            );
          }
        }

        processedCount.success++;
      } catch (eventError) {
        console.error("Error processing SendGrid event:", eventError, sgEvent);
        processedCount.failed++;
      }
    }

    return {
      success: true,
      processed: processedCount,
    };
  } catch (error: any) {
    console.error("SendGrid webhook error:", error);
    // Return 200 to prevent SendGrid from retrying
    // Log the error for investigation
    return {
      success: false,
      message: error.message || "Failed to process webhook",
    };
  }
});
