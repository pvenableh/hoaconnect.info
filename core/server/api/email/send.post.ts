/**
 * Send a composed email — since Phase 3b a client of the send queue
 * (docs/spec-email-send-queue.md §7.3–7.4). Nothing is mailed inside this
 * request except one inline tick for a small send:
 *
 *   1. the class and postal address (checkSendCompliance) — refused before any write;
 *   2. the audience (explicit ids) through partitionAudience — a recipient
 *      picker is not consent; everyone held back → 400;
 *   3. the email row saved, then the snapshot (email-send-enqueue.ts) under a
 *      prepare lease: one `queued` row per person, total last (409 when the
 *      email is already being sent);
 *   4. ≤ INLINE_MAX recipients: one tick inline, awaited (Vercel freezes a
 *      function once it responds); the response carries the progress. Larger:
 *      the response is immediate and the cron sends within a minute.
 *
 * Before `pnpm add:email-send-queue` has run (emailQueueSchema), it sends
 * synchronously as it always did, through the same renderer.
 */
import { readItem, readItems, readFiles, createItem, updateItem } from "@directus/sdk";
import { sendOrganizationEmail } from "../../utils/sendgrid";
import type { EmailType } from "../../utils/email-templates-mjml";
import { resolveMergeFields } from "../../utils/email-merge";
import type { DirectusFile, HoaEmailRecipient } from "#core/types/directus";
import { DEFAULT_CC_BCC_THRESHOLD } from "#core/shared/email/cc";
import { checkSendCompliance } from "#core/shared/email/unsubscribe";
import { emailComplianceSchema } from "../../utils/email-compliance";
import { resolveCcBccEmails } from "../../utils/email-cc-contacts";
import { buildUniqueWebSlug } from "../../utils/email-branding";
import { INLINE_MAX } from "../../utils/email-send-constants";
import { directusRecipientStore, emailQueueSchema, manualRunKey, SendInProgress } from "../../utils/email-send-queue";
import { audienceFields, plannedFor, prepareAudience, writeSnapshot, type AudienceMember } from "../../utils/email-send-enqueue";
import {
  buildRenderContext,
  extractImagesAsCid,
  loadAttachments,
  readBoardMembers,
  renderMessage,
  RENDER_ORG_FIELDS,
  type RenderOrg,
} from "../../utils/email-send-render";
import { readSendProgress, runInlineTick } from "../../utils/email-send-tick";

interface SendEmailBody {
  organizationId: string;
  subject: string;
  subtitle?: string;
  content: string;
  emailType: EmailType;
  contentMode?: "visual" | "mjml";
  recipientIds: string[];
  greeting?: string;
  salutation?: string;
  includeBoardFooter?: boolean;
  emailId?: string; // If updating existing draft
  attachmentIds?: string[]; // File IDs from Directus to attach
  urgent?: boolean;
  headerText?: string | null; // Per-send override of the org's default header line
  footerImageId?: string | null; // Per-send override of the org's default footer photo
  cc?: string[]; // CC entries: emails and/or group tokens (@board, @property_manager)
  bcc?: string[]; // BCC entries: emails and/or group tokens
  /** essential | community — defaults from emailType; a newsletter can't be essential. */
  emailClass?: string;
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody<SendEmailBody>(event);

  const { organizationId, subject, subtitle, content, emailType, contentMode = "visual", recipientIds, greeting, salutation, includeBoardFooter = true, emailId, attachmentIds, urgent, headerText, footerImageId, cc, bcc, emailClass: requestedClass } = body;

  // Validation
  if (!organizationId || !subject || !content || !emailType || !recipientIds?.length) {
    throw createError({
      statusCode: 400,
      message: "Missing required fields: organizationId, subject, content, emailType, recipientIds",
    });
  }

  // Authorize: must be an org admin, or a property manager with the
  // "communications" grant. (Previously this route only required a session.)
  await requireAdminOrManagerGrant(event, organizationId, "communications");

  try {
    const config = useRuntimeConfig();
    const directus = getTypedDirectus();

    const organization = (await directus.request(
      readItem("hoa_organizations", organizationId, { fields: RENDER_ORG_FIELDS as any })
    )) as unknown as RenderOrg;

    if (!organization) {
      throw createError({
        statusCode: 404,
        message: "Organization not found",
      });
    }

    // Phase 3a: the class this goes out as, and — for community mail — the
    // org's postal address, refused up front so nothing is half-sent.
    const compliance = checkSendCompliance({ emailType, requestedClass, org: organization });
    if (compliance.ok === false) {
      throw createError({ statusCode: compliance.statusCode, message: compliance.message, data: { code: compliance.code } });
    }
    const { emailClass, mailingAddress } = compliance;
    // Which Phase 3a fields exist: before `pnpm add:email-compliance` runs there
    // is nothing to suppress and nowhere to keep a token, so the send proceeds
    // as before (no List-Unsubscribe header, the generic page in the footer).
    const schema = await emailComplianceSchema(directus);
    const queued = await emailQueueSchema(directus);

    // Re-sending a saved email: never while it is being sent (its rows are in flight).
    let previousStatus = "draft";
    let webSlug: string | null = null;
    if (emailId) {
      const existing = (await directus.request(
        readItem("hoa_emails", emailId, { fields: ["id", "status", "organization", "web_slug"] })
      )) as { status?: string | null; organization?: string | { id: string } | null; web_slug?: string | null } | null;
      const owner = existing && (typeof existing.organization === "object" ? existing.organization?.id : existing.organization);
      if (!existing || (owner && owner !== organizationId)) {
        throw createError({ statusCode: 404, message: "Email not found" });
      }
      if (existing.status === "sending") {
        throw createError({ statusCode: 409, message: "This email is already being sent.", data: { code: "send_in_progress" } });
      }
      previousStatus = existing.status || "draft";
      webSlug = existing.web_slug || null;
    }

    // Recipients (explicit ids) with the merge relations.
    const audience = (await directus.request(
      readItems("hoa_members", {
        filter: {
          id: { _in: recipientIds },
          organization: { _eq: organizationId },
          status: { _eq: "active" },
        },
        fields: audienceFields(schema.members) as any,
        // Without it Directus answers 100 rows: a 150-person send mailed 100.
        limit: -1,
      })
    )) as unknown as AudienceMember[];

    if (!audience.length) {
      throw createError({
        statusCode: 400,
        message: "No valid recipients found",
      });
    }

    // Bounced addresses drop out of every send; opted-out members out of
    // community mail. Explicit ids don't override that — a recipient picker is
    // not consent.
    const prepared = await prepareAudience(directus, audience, emailClass, schema.members);
    const suppressedStats = prepared.stats;
    if (!prepared.recipients.length) {
      throw createError({
        statusCode: 400,
        message: `Nobody to send to: of the ${audience.length} selected, ${suppressedStats.bounced} have bounced addresses and ${suppressedStats.optedOut} opted out of community email.`,
        data: { code: "all_recipients_suppressed", suppressed: suppressedStats },
      });
    }
    const members = prepared.recipients;

    // A friendly web_slug for the public view page: reuse a draft's, else
    // derive one from the subject, unique within the org.
    if (!webSlug) {
      const slugRows = (await directus.request(
        readItems("hoa_emails", {
          filter: {
            organization: { _eq: organizationId },
            web_slug: { _nnull: true },
            ...(emailId ? { id: { _neq: emailId } } : {}),
          },
          fields: ["web_slug"],
          limit: -1,
        })
      )) as Array<{ web_slug?: string | null }>;
      const taken = new Set(slugRows.map((r) => r.web_slug).filter(Boolean) as string[]);
      webSlug = buildUniqueWebSlug(subject, taken);
    }

    const emailData = {
      subject,
      subtitle: subtitle || null,
      content,
      email_type: emailType,
      content_mode: contentMode,
      urgent: urgent || false,
      greeting: greeting || null,
      salutation: salutation || null,
      include_board_footer: includeBoardFooter,
      ...(schema.emailClass ? { email_class: emailClass } : {}),
      attachments: attachmentIds?.length ? attachmentIds.map((fileId) => ({ directus_files_id: fileId })) : [],
      web_slug: webSlug,
      header_text: headerText || null,
      footer_image: footerImageId || null,
      cc: cc?.length ? cc : null,
      bcc: bcc?.length ? bcc : null,
      // The queue sets `sending` itself, under the lease, as its first write.
      ...(queued ? {} : { status: "sending", recipient_count: members.length }),
    };
    const email = (emailId
      ? await directus.request(updateItem("hoa_emails", emailId, emailData as any))
      : await directus.request(createItem("hoa_emails", { organization: organizationId, status: "draft", ...emailData } as any))) as { id: string };

    // CC/BCC: group tokens (@board / @property_manager) and free-form
    // addresses, resolved once — the board at the moment of Send is copied.
    const ccEmails = await resolveCcBccEmails(organizationId, cc);
    const bccEmails = await resolveCcBccEmails(organizationId, bcc);

    if (queued) {
      const store = directusRecipientStore(directus);
      const runKey = manualRunKey(Date.now());
      const plan = plannedFor(email.id, runKey, organization, prepared, { ccEmails, bccEmails });
      try {
        await writeSnapshot(store, {
          emailId: email.id,
          runKey,
          rows: plan.rows,
          total: plan.total,
          suppressedCount: plan.suppressedCount,
          worker: "inline",
          clock: { now: () => Date.now() },
          expect: (status) => status !== "sending",
          restoreStatus: previousStatus,
        });
      } catch (e) {
        if (e instanceof SendInProgress) {
          throw createError({ statusCode: 409, message: e.message, data: { code: e.code } });
        }
        throw e;
      }

      // Small sends feel instant: one tick here, awaited. If a cron tick got
      // the lease first this is `busy`, and the UI polls either way.
      const inline = plan.total <= INLINE_MAX;
      if (inline) {
        await runInlineTick(email.id).catch((e) => console.error("[send.post] inline tick failed:", e));
      }
      const progress = await readSendProgress(directus, email.id).catch(() => null);
      return {
        success: true,
        emailId: email.id,
        emailClass,
        queued: true,
        inline,
        total: plan.total,
        phase: progress?.phase ?? "sending",
        progress,
        stats: {
          total: plan.total,
          delivered: progress?.sent ?? 0,
          failed: progress?.failed ?? 0,
          suppressed: suppressedStats,
        },
      };
    }

    return await sendSynchronously({
      directus,
      config,
      organization,
      emailClass,
      mailingAddress,
      email: { id: email.id, ...emailData, content, subject },
      members,
      includeBoardFooter,
      attachmentIds,
      headerText,
      footerImageId,
      ccEmails,
      bccEmails,
      suppressedStats,
    });
  } catch (error: any) {
    console.error("Email send error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: error.message || "Failed to send emails",
    });
  }
});

/**
 * Before the queue's schema exists: every recipient mailed inside this
 * request, one at a time, a row written after each — today's behaviour,
 * through the shared renderer.
 */
async function sendSynchronously(input: {
  directus: ReturnType<typeof getTypedDirectus>;
  config: ReturnType<typeof useRuntimeConfig>;
  organization: RenderOrg;
  emailClass: Parameters<typeof buildRenderContext>[0]["emailClass"];
  mailingAddress: string | null;
  email: { id: string; subject: string; content: string; [k: string]: unknown };
  members: AudienceMember[];
  includeBoardFooter: boolean;
  attachmentIds?: string[];
  headerText?: string | null;
  footerImageId?: string | null;
  ccEmails: string[];
  bccEmails: string[];
  suppressedStats: { bounced: number; optedOut: number };
}) {
  const { directus, config, organization, email, members } = input;
  const directusUrl = config.directus.url as string;
  const staticToken = config.directus.staticToken as string;

  let files: DirectusFile[] = [];
  if (input.attachmentIds?.length) {
    files = (await directus.request(
      readFiles({ filter: { id: { _in: input.attachmentIds } }, fields: ["id", "filename_download", "type", "title"] })
    )) as DirectusFile[];
  }
  const attachments = await loadAttachments(files as any, { directusUrl, staticToken, strict: false });
  const { processedContent, inline } = await extractImagesAsCid(email.content, { directusUrl, staticToken });

  const ctx = buildRenderContext({
    emailId: String(email.id),
    org: organization,
    emailClass: input.emailClass,
    mailingAddress: input.mailingAddress,
    email: email as any,
    content: processedContent,
    boardMembers: input.includeBoardFooter ? await readBoardMembers(directus, organization.id) : [],
    attachments: [...attachments, ...inline],
    brandingOverrides: { headerText: input.headerText ?? null, footerImage: input.footerImageId ?? null },
    config: {
      appUrl: config.public.appUrl as string,
      directusUrl,
      templateId: (config.sendgridEmailTemplateId as string | undefined) || undefined,
    },
  });

  const threshold = Number((organization.settings as any)?.cc_bcc_threshold) || DEFAULT_CC_BCC_THRESHOLD;
  const small = members.length <= threshold;
  const copies = small && (input.ccEmails.length || input.bccEmails.length) ? { cc: input.ccEmails, bcc: input.bccEmails } : null;

  let deliveredCount = 0;
  let failedCount = 0;
  const recipientResults: Array<{ memberId: string; email: string; status: "sent" | "failed"; error?: string }> = [];

  for (const member of members) {
    if (!member.email) {
      failedCount++;
      recipientResults.push({ memberId: member.id, email: "", status: "failed", error: "No email address" });
      continue;
    }
    const recipientName = `${member.first_name || ""} ${member.last_name || ""}`.trim();
    try {
      const msg = renderMessage(
        ctx,
        { toEmail: member.email, toName: recipientName, fields: resolveMergeFields(member, organization), copies },
        member.unsubscribe_token ?? null
      );
      const sendResult = await sendOrganizationEmail(msg);
      deliveredCount++;
      recipientResults.push({ memberId: member.id, email: member.email, status: "sent" });
      await directus.request(
        createItem("hoa_email_recipients", {
          email: email.id,
          member: member.id,
          recipient_email: member.email,
          recipient_name: recipientName || null,
          status: "sent",
          sent_at: new Date().toISOString(),
          sg_message_id: sendResult.messageId || null,
        } as Partial<HoaEmailRecipient>)
      );
    } catch (sendError: any) {
      failedCount++;
      recipientResults.push({ memberId: member.id, email: member.email, status: "failed", error: sendError.message || "Failed to send" });
      await directus.request(
        createItem("hoa_email_recipients", {
          email: email.id,
          member: member.id,
          recipient_email: member.email,
          recipient_name: recipientName || null,
          status: "failed",
          error_message: sendError.message || "Failed to send",
        } as Partial<HoaEmailRecipient>)
      );
    }
  }

  // Large send: the CC/BCC contacts weren't attached per-recipient (privacy),
  // so each gets one standalone copy — unless already a member of this send.
  if (!small) {
    const memberEmailSet = new Set(members.map((m) => (m.email || "").toLowerCase()).filter(Boolean));
    for (const addr of new Set([...input.ccEmails, ...input.bccEmails])) {
      if (memberEmailSet.has(addr)) continue;
      try {
        const copyResult = await sendOrganizationEmail(renderMessage(ctx, { toEmail: addr, fields: {} }, null));
        await directus.request(
          createItem("hoa_email_recipients", {
            email: email.id,
            member: null,
            recipient_email: addr,
            recipient_name: null,
            status: "sent",
            sent_at: new Date().toISOString(),
            sg_message_id: copyResult.messageId || null,
          } as Partial<HoaEmailRecipient>)
        );
      } catch (copyError: any) {
        console.error(`[send.post] CC/BCC copy to ${addr} failed:`, copyError?.message || copyError);
      }
    }
  }

  await directus.request(
    updateItem("hoa_emails", email.id, {
      status: failedCount === members.length ? "failed" : "sent",
      sent_at: new Date().toISOString(),
      delivered_count: deliveredCount,
      failed_count: failedCount,
    })
  );

  return {
    success: true,
    emailId: email.id,
    emailClass: input.emailClass,
    stats: {
      total: members.length,
      delivered: deliveredCount,
      failed: failedCount,
      suppressed: input.suppressedStats,
    },
    recipients: recipientResults,
  };
}
