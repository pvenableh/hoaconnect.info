import { createItem, readItems, updateItem } from "@directus/sdk";
import type { HoaEmailActivity, HoaEmailRecipient, HoaMember } from "#core/types/directus";
import { eventAction } from "#core/shared/email/suppression-events";
import { applySuppressionActions, emailComplianceSchema, type SuppressionWork } from "../../utils/email-compliance";
import { directusRecipientStore, emailQueueSchema, queueRowPatch, refreshTotals } from "../../utils/email-send-queue";
import { emailPhase4Schema } from "../../utils/email-send-health";

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
 *
 * Suppression (Phase 3a) runs FIRST, before anything is forwarded or stored: a
 * hard bounce marks the member's address dead, a spam report or unsubscribe
 * opts them out of community mail (core/shared/email/suppression-events.ts).
 * If that can't be stored the route answers 503 so SendGrid redelivers — and
 * because nothing else has happened yet, the redelivery doesn't duplicate an
 * activity row or a downstream forward.
 *
 * The send queue (Phase 3b, docs/spec-email-send-queue.md §4.3): queued mail
 * also stamps `recipient_id` (the row) and `run_key`. The row is looked up by
 * `recipient_id` first — exact, and right when two members of a household share
 * an address — then by email_id + address, then by message id. Any event proves
 * SendGrid accepted the message, so a row still `claimed` or `unknown` (its run
 * died before settling) is promoted to `sent`. Delivery outcomes go to
 * `delivery_status`; the webhook never writes the queue's `status` otherwise.
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
  /** `bounce` events: "bounce" (permanent) or "blocked". */
  type?: string;
  bounce_classification?: string;
  category?: string[];
  sg_event_id?: string;
  // custom_args stamped by sendOrganizationEmail
  email_id?: string;
  recipient_email?: string;
  organization_id?: string;
  /** The queue's row id and occurrence (Phase 3b). */
  recipient_id?: string;
  run_key?: string;
}

export default defineEventHandler(async (event) => {
  // Read the RAW body — signature verification must run over the exact bytes.
  const raw = (await readRawBody(event)) || "";

  // Verify SendGrid's signed-webhook signature. With SENDGRID_WEBHOOK_PUBLIC_KEY
  // set, unsigned/forged posts are rejected with 403. Without it, a production
  // build refuses everything with 503 — an unsigned post can mark any
  // community's members bounced or opted out, and until 2026-11-12 that was
  // accepted — while SendGrid keeps retrying, so events are delivered once the
  // key is set. Only a local/test server still accepts unsigned posts (warned).
  const publicKey = useRuntimeConfig().sendgridWebhookPublicKey as string | undefined;
  if (!publicKey && process.env.NODE_ENV === "production") {
    console.error("[email/activity] SENDGRID_WEBHOOK_PUBLIC_KEY not set — refusing unsigned webhook posts");
    throw createError({ statusCode: 503, message: "Webhook signing is not configured" });
  }
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

  // Only this app's events: either the "HOA Connect" category or an org custom_arg.
  const appEvents = events.filter(
    (e) => e.category?.includes("HOA Connect") || !!e.organization_id
  );

  // Suppression first — see the header. Events with no org can't be scoped to
  // a membership, so they are left alone rather than applied to every org.
  const suppressionWork: SuppressionWork[] = [];
  for (const e of appEvents) {
    const action = eventAction(e);
    const organizationId = eventOrganizationId(e);
    if (action && organizationId && e.email) suppressionWork.push({ organizationId, email: e.email, action });
  }
  if (suppressionWork.length) {
    const directus = getTypedDirectus();
    let ready = false;
    try {
      ready = (await emailComplianceSchema(directus)).members;
    } catch (e) {
      console.error("[email/activity] schema probe failed — 503 so SendGrid retries:", e);
      throw createError({ statusCode: 503, message: "Suppression store unavailable" });
    }
    if (!ready) {
      // Before `pnpm add:email-compliance`: nowhere to keep it. Say so and go
      // on — a 503 here would hold every batch until the script runs.
      console.warn(`[email/activity] ${suppressionWork.length} suppression event(s) not stored: fields not provisioned`);
    } else {
      try {
        const applied = await applySuppressionActions(directus, suppressionWork);
        if (applied.bounced || applied.optedOut) {
          console.info(`[email/activity] suppression: ${applied.bounced} bounced, ${applied.optedOut} opted out`);
        }
      } catch (e) {
        console.error("[email/activity] suppression write failed — 503 so SendGrid retries:", e);
        throw createError({ statusCode: 503, message: "Suppression store unavailable" });
      }
    }
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
  const timeoutMs = Number(cfg.emailActivityForwardTimeoutMs) || 15000;
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  // Collected forward promises — we AWAIT these before returning (see below).
  // Fire-and-forget via event.waitUntil() proved unreliable on Vercel: for a
  // batch with no HOA Connect events the handler returns immediately, and the
  // function is frozen before the forward fetch completes, silently dropping the
  // downstream POST (this is exactly how the 1033 Lenox forward went dark). Each
  // forward swallows its own errors and is bounded by timeoutMs, so awaiting can
  // neither throw nor stall us past SendGrid's webhook timeout.
  const forwardPromises: Promise<void>[] = [];

  // Forward the (optionally category-filtered) batch to one downstream consumer.
  // A single retry on a transient failure — a slow/failed downstream must never
  // make SendGrid retry or break our 200. Called once per configured target below.
  const forwardTo = (rawUrl: string | undefined, rawCategory: string | undefined) => {
    const forwardUrl = rawUrl?.trim();
    if (!forwardUrl) return;
    const forwardCategory = rawCategory?.trim();
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
    if (forwardBody === null) return;
    const body = forwardBody;
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
    // Await this before returning (below). Also register with waitUntil when the
    // runtime provides it — harmless belt-and-suspenders, but the await is what
    // actually guarantees delivery on Vercel.
    forwardPromises.push(forward);
    if (typeof (event as any).waitUntil === "function") (event as any).waitUntil(forward);
  };

  // Target 1: the existing (legacy 1033 Lenox) forward — behaviour unchanged.
  forwardTo(cfg.emailActivityForwardUrl as string | undefined, cfg.emailActivityForwardCategory as string | undefined);
  // Target 2: an optional second app (e.g. WeddingConnect), independent filter.
  forwardTo(cfg.emailActivityForwardUrl2 as string | undefined, cfg.emailActivityForwardCategory2 as string | undefined);

  if (appEvents.length === 0) {
    // Nothing for us to store, but we may still owe a downstream forward — wait
    // for it before the function is frozen (this batch is likely all-1033/all-
    // WeddingConnect). allSettled: forwards never reject, but be defensive.
    await Promise.allSettled(forwardPromises);
    return { success: true, message: "No matching HOA Connect events found" };
  }

  const directus = getTypedDirectus();
  const processed = { success: 0, skipped: 0, failed: 0 };
  // Which shape the recipient rows have. Unknown (Directus unreachable) → leave
  // the rows alone rather than write the legacy status over a queue row.
  const queueRows = await emailQueueSchema(directus).catch(() => null);
  // Phase 4: a bounce's SendGrid type, so auto-pause counts permanent ones only.
  const bounceTypes = await emailPhase4Schema(directus).catch(() => false);
  const rowFields = queueRows ? ["id", "status", "member", "email", "delivery_status"] : ["id", "status", "member"];
  // Emails whose rows this batch promoted to `sent`: their totals are re-derived after.
  const promoted = new Set<string>();

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

      const organizationId = eventOrganizationId(sg);

      // Recipient row: the queue's recipient_id, else (email_record +
      // recipient_email), else sg_message_id.
      let recipient: HoaEmailRecipient | null = null;
      if (sg.recipient_id && queueRows) {
        const rows = (await directus.request(
          readItems("hoa_email_recipients", {
            filter: { id: { _eq: sg.recipient_id }, ...(sg.email_id ? { email: { _eq: sg.email_id } } : {}) },
            fields: rowFields as any,
            limit: 1,
          })
        )) as unknown as HoaEmailRecipient[];
        recipient = rows[0] ?? null;
      }
      if (!recipient && sg.email_id) {
        const rows = (await directus.request(
          readItems("hoa_email_recipients", {
            filter: {
              email: { _eq: sg.email_id },
              recipient_email: { _eq: sg.recipient_email || sg.email },
            },
            fields: rowFields as any,
            limit: 1,
          })
        )) as unknown as HoaEmailRecipient[];
        recipient = rows[0] ?? null;
      }
      if (!recipient && cleanMessageId) {
        const rows = (await directus.request(
          readItems("hoa_email_recipients", {
            filter: { sg_message_id: { _eq: cleanMessageId } },
            fields: rowFields as any,
            limit: 1,
          })
        )) as unknown as HoaEmailRecipient[];
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
        ...(bounceTypes && sg.event === "bounce" ? { bounce_type: sg.type || null } : {}),
      };

      await directus.request(createItem("hoa_email_activity", activityData as any));

      if (recipient && queueRows) {
        const patch = queueRowPatch(recipient, sg, cleanMessageId);
        if (patch) await directus.request(updateItem("hoa_email_recipients", recipient.id, patch as any));
        const rowEmail = typeof recipient.email === "object" ? recipient.email?.id : recipient.email;
        if (patch?.status === "sent" && rowEmail) promoted.add(rowEmail);
      } else if (recipient && queueRows === false) {
        // Before the queue's schema: terminal delivery states onto `status`, as before.
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

  // The totals follow the rows (the queue never increments a count).
  for (const emailId of promoted) {
    await refreshTotals(directusRecipientStore(directus), emailId).catch((e) =>
      console.error(`[email/activity] totals for ${emailId} not refreshed:`, e)
    );
  }

  // Ensure any downstream forward finishes before the serverless function is
  // frozen — this ran concurrently with the Directus writes above.
  await Promise.allSettled(forwardPromises);

  return { success: true, processed };
});

/** The event's org: the `organization_id` custom_arg first, then the `org:<id>` category. */
function eventOrganizationId(sg: SendGridEvent): string | null {
  if (sg.organization_id) return sg.organization_id;
  const orgCat = Array.isArray(sg.category) ? sg.category.find((c) => typeof c === "string" && c.startsWith("org:")) : null;
  return orgCat ? orgCat.slice(4) : null;
}
