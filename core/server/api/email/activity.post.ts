import { createItem, readItems, updateItem } from "@directus/sdk";
import type { HoaEmailActivity, HoaEmailRecipient, HoaMember } from "#core/types/directus";

/**
 * SendGrid Event Webhook Handler
 *
 * Receives SendGrid event batches and records each into hoa_email_activity,
 * tying it to the tenant, the email record, the recipient row, and the member.
 * Configure in SendGrid: Settings > Mail Settings > Event Webhook → this URL.
 *
 * Every org send stamps three custom_args (server/utils/sendgrid.ts):
 *   organization_id · email_id · recipient_email
 * We link from those first (reliable), falling back to sg_message_id / the
 * `org:<id>` category / an email lookup. Events not from this app (no
 * "HOA Connect" category and no organization_id) are ignored.
 *
 * Events: processed, dropped, delivered, deferred, bounce, open, click,
 *         spam_report, unsubscribe, group_unsubscribe, group_resubscribe.
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
  category?: string[];
  sg_event_id?: string;
  // custom_args stamped by sendOrganizationEmail
  email_id?: string;
  recipient_email?: string;
  organization_id?: string;
}

export default defineEventHandler(async (event) => {
  // Read the RAW body — signature verification must run over the exact bytes.
  const raw = (await readRawBody(event)) || "";

  // Verify SendGrid's signed-webhook signature when a key is configured. If the
  // key isn't set yet, accept but warn (lets the webhook work before signing is
  // turned on); once SENDGRID_WEBHOOK_PUBLIC_KEY is set, unsigned/forged posts
  // are rejected with 403.
  const publicKey = useRuntimeConfig().sendgridWebhookPublicKey as string | undefined;
  if (publicKey) {
    const ok = verifySendgridEventWebhook({
      publicKey,
      payload: raw,
      signature: getHeader(event, SENDGRID_SIGNATURE_HEADER),
      timestamp: getHeader(event, SENDGRID_TIMESTAMP_HEADER),
    });
    if (!ok) {
      throw createError({ statusCode: 403, message: "Invalid SendGrid signature" });
    }
  } else {
    console.warn(
      "[email/activity] SENDGRID_WEBHOOK_PUBLIC_KEY not set — webhook signature NOT verified"
    );
  }

  let events: SendGridEvent[];
  try {
    events = JSON.parse(raw);
  } catch {
    throw createError({ statusCode: 400, message: "Invalid JSON body" });
  }

  if (!Array.isArray(events) || events.length === 0) {
    return { success: true, message: "No events to process" };
  }

  // Fan-out: forward the SendGrid batch to a downstream consumer (e.g. the
  // legacy 1033 Lenox Directus flow) when configured, so one SendGrid Event
  // Webhook can serve both apps. Fire-and-forget — a slow/failed downstream must
  // never make SendGrid retry or break our 200.
  //
  // When EMAIL_ACTIVITY_FORWARD_CATEGORY is set we forward ONLY the events whose
  // `category` contains that substring, and skip the POST entirely when none
  // match. The 1033 flow's condition uses `_some` over the trigger body, which
  // THROWS "Value is required" on any batch with no matching element — so it must
  // never receive a non-matching (e.g. all-HOA-Connect) batch. Unset = forward
  // the raw batch verbatim and let the downstream self-filter (original behavior).
  const cfg = useRuntimeConfig();
  const forwardUrl = cfg.emailActivityForwardUrl as string | undefined;
  if (forwardUrl) {
    const forwardCategory = (cfg.emailActivityForwardCategory as string | undefined)?.trim();
    // Default: forward the raw batch verbatim. With a category configured, send
    // only the matching events — and null means "this batch has none, don't POST".
    let forwardBody: string | null = raw;
    let forwardedCount = events.length;
    if (forwardCategory) {
      const matching = events.filter((e) =>
        e.category?.some((c) => typeof c === "string" && c.includes(forwardCategory))
      );
      forwardedCount = matching.length;
      forwardBody = matching.length ? JSON.stringify(matching) : null;
    }
    if (forwardBody !== null) {
      const body = forwardBody;
      const timeoutMs = Number(cfg.emailActivityForwardTimeoutMs) || 15000;
      const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
      const tag = `received ${events.length} · forwarded ${forwardedCount} → ${forwardUrl}`;

      // One retry on a transient failure. We've already 200'd SendGrid, so it
      // won't retry for us — a brief downstream blip would otherwise lose the
      // batch. We retry ONLY on a clean failure (network error or 5xx), never on
      // a timeout: a timeout means the body was already sent, so retrying would
      // risk a duplicate row downstream.
      const maxAttempts = 2;
      const forward = (async () => {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const last = attempt === maxAttempts;
          try {
            const r = await fetch(forwardUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
              signal: AbortSignal.timeout(timeoutMs),
            });
            if (r.ok) {
              console.info(`[email/activity] forward ${tag} · ${r.status} (attempt ${attempt})`);
              return;
            }
            // 4xx won't improve on retry; 5xx might. Give up on the last attempt.
            if (r.status < 500 || last) {
              console.warn(`[email/activity] forward ${tag} · responded ${r.status}${last && r.status >= 500 ? " (gave up)" : ""}`);
              return;
            }
            console.warn(`[email/activity] forward ${tag} · responded ${r.status}, retrying`);
          } catch (e: any) {
            const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
            // Timeout: body already sent, downstream likely still processing —
            // don't retry (would duplicate). Otherwise retry unless we're out.
            if (timedOut || last) {
              console.warn(
                `[email/activity] forward ${tag} · ${timedOut ? "did not ack within " + timeoutMs + "ms (likely still delivered)" : "failed after " + attempt + " attempt(s): " + e}`
              );
              return;
            }
            console.warn(`[email/activity] forward ${tag} · network error, retrying: ${e}`);
          }
          await sleep(1000);
        }
      })();
      // Keep the worker alive for the forward without blocking the SendGrid 200.
      if (typeof (event as any).waitUntil === "function") (event as any).waitUntil(forward);
    }
  }

  // Only this app's events: either the "HOA Connect" category or an org custom_arg.
  const appEvents = events.filter(
    (e) => e.category?.includes("HOA Connect") || !!e.organization_id
  );
  if (appEvents.length === 0) {
    return { success: true, message: "No matching HOA Connect events found" };
  }

  const directus = getTypedDirectus();
  const processed = { success: 0, skipped: 0, failed: 0 };

  for (const sg of appEvents) {
    try {
      if (!sg.email || !sg.event) {
        processed.skipped++;
        continue;
      }

      // Clean the message id (strip angle brackets + the .filterN suffix).
      const cleanMessageId = sg.sg_message_id
        ? sg.sg_message_id.split(".")[0]!.replace(/[<>]/g, "")
        : null;

      // Org: custom_arg first, then the "org:<id>" category.
      let organizationId: string | null = sg.organization_id || null;
      if (!organizationId && Array.isArray(sg.category)) {
        const orgCat = sg.category.find((c) => c.startsWith("org:"));
        if (orgCat) organizationId = orgCat.slice(4);
      }

      // Recipient row: prefer (email_record + recipient_email), else sg_message_id.
      let recipient: HoaEmailRecipient | null = null;
      if (sg.email_id) {
        const rows = (await directus.request(
          readItems("hoa_email_recipients", {
            filter: {
              email: { _eq: sg.email_id },
              recipient_email: { _eq: sg.recipient_email || sg.email },
            },
            fields: ["id", "status", "member"],
            limit: 1,
          })
        )) as HoaEmailRecipient[];
        recipient = rows[0] ?? null;
      }
      if (!recipient && cleanMessageId) {
        const rows = (await directus.request(
          readItems("hoa_email_recipients", {
            filter: { sg_message_id: { _eq: cleanMessageId } },
            fields: ["id", "status", "member"],
            limit: 1,
          })
        )) as HoaEmailRecipient[];
        recipient = rows[0] ?? null;
      }

      // Member: from the recipient row, else look up by email (org-scoped).
      let memberId: string | null = recipient?.member
        ? typeof recipient.member === "string"
          ? recipient.member
          : recipient.member.id
        : null;
      if (!memberId) {
        try {
          const memberFilter: Record<string, any> = { email: { _eq: sg.email } };
          if (organizationId) memberFilter.organization = { _eq: organizationId };
          const members = (await directus.request(
            readItems("hoa_members", { filter: memberFilter, fields: ["id"], limit: 1 })
          )) as HoaMember[];
          memberId = members[0]?.id ?? null;
        } catch (e) {
          console.error(`[email/activity] member lookup failed for ${sg.email}:`, e);
        }
      }

      const clickedUrl = sg.event === "click" || sg.event === "clicked" ? sg.url || null : null;

      const activityData: Partial<HoaEmailActivity> = {
        event: sg.event as HoaEmailActivity["event"],
        email: sg.email,
        sg_message_id: cleanMessageId,
        clicked_url: clickedUrl,
        user_agent: sg.useragent || null,
        ip: sg.ip || null,
        reason: sg.reason || sg.response || null,
        event_timestamp: sg.timestamp || null,
        organization: organizationId,
        member: memberId,
        email_recipient: recipient?.id || null,
        // Direct link to the email record (from the email_id custom_arg).
        email_record: sg.email_id || null,
      };

      await directus.request(createItem("hoa_email_activity", activityData as any));

      // Reflect terminal delivery states back onto the recipient row.
      if (recipient) {
        let newStatus: HoaEmailRecipient["status"] | null = null;
        if (sg.event === "delivered") newStatus = "delivered";
        else if (sg.event === "bounce" || sg.event === "dropped") newStatus = "bounced";
        if (newStatus && newStatus !== recipient.status) {
          await directus.request(
            updateItem("hoa_email_recipients", recipient.id, { status: newStatus })
          );
        }
      }

      processed.success++;
    } catch (err) {
      console.error("[email/activity] error processing event:", err, sg);
      processed.failed++;
    }
  }

  return { success: true, processed };
});
