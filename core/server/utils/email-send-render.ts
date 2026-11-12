/**
 * One message to one recipient — `deliverTo`, lifted out of send.post.ts
 * (docs/spec-email-send-queue.md §8.4) and shared by both bulk paths: the
 * queue's runs, and the synchronous send that stays until the queue's schema
 * exists. Nothing here writes.
 *
 * Two halves, because the queue renders BEFORE it claims (a run killed while
 * rendering leaves its rows queued) but the per-recipient compliance — the
 * footer and the List-Unsubscribe headers — comes from the member's token as
 * read live AFTER the claim (§6.2):
 *
 *   renderDraft()    the three body branches (raw MJML/HTML, the SendGrid
 *                    dynamic template, buildEmailHtml) with a sentinel where the
 *                    footer goes. One MJML compile per recipient, as today.
 *   finalizeDraft()  recipientCompliance() with the live token; the sentinel
 *                    becomes that recipient's footer, and the headers are set.
 *
 * The footer is inserted verbatim inside an `mj-text` (minify off) and appended
 * to the text part, so the sentinel survives compilation intact; a test pins it.
 *
 * Once per run (`loadRenderContext`): the org read fresh with
 * checkSendCompliance, the board footer, branding, the sender (resolveSender),
 * attachments and CID images (§8.2–8.3).
 */

import * as sdk from "@directus/sdk";
import type { BlockSetting, HoaOrganization } from "#core/types/directus";
import { checkSendCompliance, recipientCompliance } from "#core/shared/email/unsubscribe";
import type { EmailClass } from "#core/shared/email/email-class";
import {
  appendComplianceFooterHtml,
  buildEmailHtml,
  buildEmailText,
  buildRawEmailHtml,
  processHtmlForEmail,
  type EmailType,
} from "./email-templates-mjml";
import { applyMergeFields } from "./email-merge";
import { applyHeaderTextTokens, resolveEmailBranding } from "./email-branding";
import {
  resolveSender,
  type EmailAttachment,
  type EmailTemplateData,
  type ResolvedSender,
  type sendOrganizationEmail,
} from "./sendgrid";
import { RunParked, type Copies } from "./email-send-queue";
import { assetIdFromSrc, filesOutsideOrg, imageTags, inlineAssetIds, isFileId } from "./org-files";

export type OrgMessage = Parameters<typeof sendOrganizationEmail>[0];
export type RenderOrg = HoaOrganization & { settings: BlockSetting | null };

type DirectusLike = { request: (op: any) => Promise<any> };
const op = (name: string) => (...args: unknown[]) => (sdk as any)[name](...args);

/** Where the footer goes until finalizeDraft knows the recipient's token. */
export const FOOTER_SENTINEL = "HOA3BCOMPLIANCEFOOTERSENTINEL";
const SENTINEL_FOOTER = { html: FOOTER_SENTINEL, text: FOOTER_SENTINEL };

export const RENDER_ORG_FIELDS = [
  "id", "name", "legal_name", "type", "email", "phone", "street_address", "city", "state", "zip", "slug", "external_url",
  {
    settings: [
      "id", { logo: ["id", "width", "height"] }, "title", "description", "header_text", "homepage_url", "footer_image", "colors", "theme",
      "cc_bcc_threshold", "from_name", "from_email", "email_domain_verified",
    ],
  },
] as const;

export interface RenderContext {
  emailId: string;
  organizationId: string;
  org: RenderOrg;
  emailClass: EmailClass;
  mailingAddress: string | null;
  subject: string;
  subtitle?: string | null;
  /** The body with CID references in place of Directus asset URLs. */
  content: string;
  emailType: EmailType;
  contentMode: "visual" | "mjml";
  greeting?: string;
  salutation?: string;
  urgent: boolean;
  includeBoardFooter: boolean;
  boardMembers: Array<{ name: string; title: string; icon?: string }>;
  branding: { headerText: string | null; footerImage: unknown; homepageUrl: string | null };
  webViewUrl: string;
  /** File attachments and inline CID images, loaded once. */
  attachments: EmailAttachment[];
  sender: ResolvedSender;
  templateId?: string;
  appUrl: string;
  directusUrl: string;
}

export interface RenderTarget {
  toEmail: string;
  toName?: string | null;
  /** Merge values (resolveMergeFields' output); {} for a CC/BCC copy. */
  fields: Record<string, string>;
  copies?: Copies | null;
  /** Beside email_id / recipient_email / organization_id: the queue adds recipient_id and run_key. */
  customArgs?: Record<string, string>;
}

export interface Draft {
  msg: OrgMessage;
}

// ── Building the context ────────────────────────────────────────────────────

export interface EmailBodyFields {
  subject: string;
  subtitle?: string | null;
  content: string;
  email_type?: string | null;
  content_mode?: string | null;
  greeting?: string | null;
  salutation?: string | null;
  urgent?: boolean | null;
  include_board_footer?: boolean | null;
  header_text?: string | null;
  footer_image?: string | null;
  web_slug?: string | null;
}

/** Assemble a context from values already read (the synchronous path builds it from the request). */
export function buildRenderContext(input: {
  emailId: string;
  org: RenderOrg;
  emailClass: EmailClass;
  mailingAddress: string | null;
  email: EmailBodyFields;
  /** CID-processed body; defaults to email.content. */
  content?: string;
  boardMembers: RenderContext["boardMembers"];
  attachments: EmailAttachment[];
  brandingOverrides?: { headerText?: string | null; footerImage?: string | null };
  config: { appUrl: string; directusUrl: string; templateId?: string };
}): RenderContext {
  const { org, email, config } = input;
  const branding = resolveEmailBranding(org, { header_text: email.header_text ?? null, footer_image: email.footer_image ?? null }, {
    appUrl: config.appUrl,
    ...(input.brandingOverrides ? { overrides: input.brandingOverrides } : {}),
  });
  const webViewUrl = org.slug
    ? `${config.appUrl}/${org.slug}/announcements/email/${email.web_slug || input.emailId}`
    : `${config.appUrl}/api/email/view/${input.emailId}`;
  return {
    emailId: input.emailId,
    organizationId: org.id,
    org,
    emailClass: input.emailClass,
    mailingAddress: input.mailingAddress,
    subject: email.subject || "",
    subtitle: email.subtitle ?? null,
    content: input.content ?? email.content ?? "",
    emailType: (email.email_type || "basic") as EmailType,
    contentMode: email.content_mode === "mjml" ? "mjml" : "visual",
    greeting: email.greeting || undefined,
    salutation: email.salutation || undefined,
    urgent: !!email.urgent,
    includeBoardFooter: email.include_board_footer ?? true,
    boardMembers: input.boardMembers,
    branding,
    webViewUrl,
    attachments: input.attachments,
    sender: resolveSender(org, "bulk"),
    templateId: config.templateId || undefined,
    appUrl: config.appUrl,
    directusUrl: config.directusUrl,
  };
}

export async function readBoardMembers(
  directus: DirectusLike,
  organizationId: string
): Promise<RenderContext["boardMembers"]> {
  const rows = (await directus.request(
    op("readItems")("hoa_board_members", {
      filter: {
        hoa_member: { organization: { _eq: organizationId }, status: { _eq: "active" } },
        status: { _eq: "published" },
      },
      fields: ["id", "title", "icon", { hoa_member: ["id", "first_name", "last_name"] }],
      sort: ["sort"],
    })
  )) as Array<{ title?: string | null; icon?: string | null; hoa_member?: { first_name?: string | null; last_name?: string | null } | null }>;
  return (rows || [])
    .filter((bm) => bm.hoa_member)
    .map((bm) => ({
      name: `${bm.hoa_member!.first_name || ""} ${bm.hoa_member!.last_name || ""}`.trim() || "Board Member",
      title: bm.title || "Board Member",
      icon: bm.icon || "",
    }));
}

/**
 * Download file attachments as base64. `strict` (the queue): one that won't
 * load stops the run before any claim — some chunks with the file and some
 * without would be worse than a minute's delay (§8.2). Not strict (the
 * synchronous path): skipped, as before.
 */
export async function loadAttachments(
  files: Array<{ id: string; filename_download?: string | null; title?: string | null; type?: string | null }>,
  cfg: { directusUrl: string; staticToken: string; strict: boolean; fetchImpl?: typeof fetch }
): Promise<EmailAttachment[]> {
  const out: EmailAttachment[] = [];
  const doFetch = cfg.fetchImpl ?? fetch;
  for (const file of files) {
    const name = file.filename_download || file.title || "attachment";
    try {
      const res = await doFetch(`${cfg.directusUrl}/assets/${file.id}`, {
        headers: { Authorization: `Bearer ${cfg.staticToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      out.push({
        content: Buffer.from(await res.arrayBuffer()).toString("base64"),
        filename: name,
        type: file.type || "application/octet-stream",
        disposition: "attachment",
      });
    } catch (e) {
      if (cfg.strict) throw new RunParked(`Could not load attachment ${name}`);
      console.error(`[email-send-render] attachment ${file.id} skipped:`, (e as Error)?.message || e);
    }
  }
  return out;
}

/**
 * Images on Directus asset URLs become CID inline attachments (Outlook renders
 * those, not data URIs). Once per run/request. A failed image keeps its URL,
 * and so does one in `skip` (another community's file, never fetched). The
 * matcher is org-files.ts's, so the ids its check saw are the ids fetched.
 */
export async function extractImagesAsCid(
  content: string,
  cfg: { directusUrl: string; staticToken: string; fetchImpl?: typeof fetch; skip?: ReadonlySet<string> }
): Promise<{ processedContent: string; inline: EmailAttachment[] }> {
  const doFetch = cfg.fetchImpl ?? fetch;
  let processedContent = content;
  const inline: EmailAttachment[] = [];
  for (const match of imageTags(content)) {
    const [fullMatch, beforeSrc, src, afterSrc = ""] = match;
    const assetId = assetIdFromSrc(src, cfg.directusUrl);
    if (!assetId || cfg.skip?.has(assetId)) continue;
    try {
      const res = await doFetch(`${cfg.directusUrl}/assets/${assetId}`, {
        headers: { Authorization: `Bearer ${cfg.staticToken}` },
      });
      if (!res.ok) {
        console.error(`[email-send-render] image ${assetId}: ${res.status}`);
        continue;
      }
      const type = res.headers.get("content-type") || "image/png";
      const cid = `image-${assetId}@hoamail`;
      inline.push({
        content: Buffer.from(await res.arrayBuffer()).toString("base64"),
        filename: `image-${assetId}.${type.split("/")[1] || "png"}`,
        type,
        disposition: "inline",
        contentId: cid,
      });
      const cleanAfter = afterSrc.replace(/\s*\/\s*$/, "");
      const tag = fullMatch.endsWith("/>")
        ? `<img${beforeSrc}src="cid:${cid}"${cleanAfter} />`
        : `<img${beforeSrc}src="cid:${cid}"${cleanAfter}>`;
      processedContent = processedContent.replace(fullMatch, tag);
    } catch (e) {
      console.error("[email-send-render] image skipped:", (e as Error)?.message || e);
    }
  }
  return { processedContent, inline };
}

/**
 * The queue's once-per-run load: the email and a fresh org read. A community
 * send whose org lost its postal address mid-send parks (RunParked) — the rows
 * wait for the one Settings field instead of failing (§6.2).
 */
export async function loadRenderContext(
  directus: DirectusLike,
  emailId: string,
  config: { appUrl: string; directusUrl: string; staticToken: string; templateId?: string; fetchImpl?: typeof fetch }
): Promise<RenderContext> {
  const email = (await directus.request(
    op("readItem")("hoa_emails", emailId, {
      fields: [
        "id", "organization", "subject", "subtitle", "content", "email_type", "content_mode", "greeting",
        "salutation", "include_board_footer", "urgent", "web_slug", "header_text", "footer_image", "email_class",
        { attachments: [{ directus_files_id: ["id", "filename_download", "title", "type"] }] },
      ],
    })
  )) as EmailBodyFields & {
    id: string;
    organization: string | { id: string };
    email_class?: string | null;
    attachments?: Array<{ directus_files_id?: { id: string; filename_download?: string | null; title?: string | null; type?: string | null } | null }>;
  };
  if (!email) throw new RunParked("The email record could not be read");
  const organizationId = typeof email.organization === "string" ? email.organization : email.organization?.id;
  const org = (await directus.request(
    op("readItem")("hoa_organizations", organizationId, { fields: RENDER_ORG_FIELDS })
  )) as RenderOrg;

  const compliance = checkSendCompliance({ emailType: email.email_type, requestedClass: email.email_class, org });
  if (compliance.ok === false) throw new RunParked(compliance.message);

  const files = (email.attachments || []).map((a) => a?.directus_files_id).filter(Boolean) as Array<{ id: string }>;

  // An email stored before the file check (org-files.ts) may name another
  // community's file. Drop it — the rest of the send goes — and say so in the
  // log; a check that can't run parks the run rather than send unchecked.
  // (These ids are Directus' own, read back from the email; only a UUID can
  // name a file, so nothing else is checked.)
  let foreignFiles: Set<string>;
  let foreignImages: Set<string>;
  try {
    foreignFiles = new Set(await filesOutsideOrg(organizationId, files.map((f) => f.id).filter(isFileId)));
    const imageIds = [...inlineAssetIds(email.content, config.directusUrl), email.footer_image].filter(isFileId);
    foreignImages = new Set(await filesOutsideOrg(organizationId, imageIds, { allowPublicImages: true }));
  } catch (e) {
    console.error(`[email-send-render] email ${emailId}: file check failed:`, (e as Error)?.message || e);
    throw new RunParked("Could not check this email's files");
  }
  if (foreignFiles.size || foreignImages.size) {
    console.warn(
      `[email-send-render] email ${emailId}: dropped ${foreignFiles.size} attachment(s) and ${foreignImages.size} image(s) from outside org ${organizationId}`
    );
  }
  const ownFiles = files.filter((f) => !(isFileId(f.id) && foreignFiles.has(f.id.toLowerCase())));
  const footerImage = isFileId(email.footer_image) && foreignImages.has(email.footer_image.toLowerCase()) ? null : email.footer_image;

  const attachments = await loadAttachments(ownFiles, { ...config, strict: true });
  const { processedContent, inline } = await extractImagesAsCid(email.content || "", { ...config, skip: foreignImages });
  const includeBoardFooter = email.include_board_footer ?? true;

  return buildRenderContext({
    emailId,
    org,
    emailClass: compliance.emailClass,
    mailingAddress: compliance.mailingAddress,
    email: { ...email, footer_image: footerImage },
    content: processedContent,
    boardMembers: includeBoardFooter ? await readBoardMembers(directus, organizationId) : [],
    attachments: [...attachments, ...inline],
    config,
  });
}

// ── Rendering ───────────────────────────────────────────────────────────────

/** The three body branches with a footer sentinel. Throws on a render error (the caller fails that row). */
export function renderDraft(ctx: RenderContext, target: RenderTarget): Draft {
  const { org } = ctx;
  const firstName = target.fields.first_name || undefined;
  const unitNumber = target.fields.unit_number || undefined;
  const recipientContent = applyMergeFields(ctx.content, target.fields);
  const recipientSubject = applyMergeFields(ctx.subject, target.fields) || ctx.subject;
  const processedHtmlContent = processHtmlForEmail(recipientContent);

  let personalized = processedHtmlContent;
  if (ctx.greeting) {
    personalized = `<p>${firstName ? `${ctx.greeting} ${firstName},` : `${ctx.greeting},`}</p>${processedHtmlContent}`;
  }
  if (ctx.salutation) personalized = `${personalized}<p>${ctx.salutation}</p>`;

  const boardMembers = ctx.includeBoardFooter ? ctx.boardMembers : undefined;
  const text = buildEmailText({
    organization: org,
    subject: recipientSubject,
    content: recipientContent,
    emailType: ctx.emailType,
    greeting: ctx.greeting,
    salutation: ctx.salutation,
    boardMembers,
    recipientFirstName: firstName,
    directusUrl: ctx.directusUrl,
    complianceFooter: SENTINEL_FOOTER,
  });

  const toEmail = target.toEmail;
  const copyList = (list?: string[]) => (list?.length ? list.map((email) => ({ email })) : undefined);
  const common: Omit<OrgMessage, "html"> = {
    to: toEmail,
    toName: target.toName || undefined,
    subject: recipientSubject,
    text,
    fromName: ctx.sender.fromName,
    fromAddress: ctx.sender.fromAddress,
    attachments: ctx.attachments.length ? ctx.attachments : undefined,
    replyTo: ctx.sender.replyTo,
    customArgs: {
      email_id: ctx.emailId,
      recipient_email: toEmail,
      organization_id: ctx.organizationId,
      ...(target.customArgs || {}),
    },
    organizationId: ctx.organizationId,
    cc: copyList(target.copies?.cc),
    bcc: copyList(target.copies?.bcc),
    headers: {},
  };

  if (ctx.contentMode === "mjml") {
    // Raw MJML/HTML mode: the author controls the whole email.
    return { msg: { ...common, html: appendComplianceFooterHtml(buildRawEmailHtml(recipientContent), SENTINEL_FOOTER) } };
  }

  if (ctx.templateId) {
    const settings = org.settings;
    const footerImageUrl = ctx.branding.footerImage ? `${ctx.directusUrl}/assets/${ctx.branding.footerImage}` : "";
    const templateData: EmailTemplateData = {
      first_name: firstName || "Resident",
      unit: unitNumber || "",
      subject: recipientSubject,
      subtitle: ctx.subtitle || "",
      content: `${personalized}${FOOTER_SENTINEL}`,
      salutation: ctx.salutation || undefined,
      urgent: ctx.urgent,
      category: ctx.emailType,
      org_name: org.name || "Your HOA",
      org_legal_name: org.legal_name || "",
      org_type: (org.type as EmailTemplateData["org_type"]) || undefined,
      org_logo_url: settings?.logo ? `${ctx.directusUrl}/assets/${settings.logo}` : "",
      org_url: org.slug ? `${ctx.appUrl}/${org.slug}` : ctx.appUrl,
      org_address: [org.street_address, org.city, org.state, org.zip].filter(Boolean).join(", ") || undefined,
      org_email: org.email || undefined,
      org_phone_number: org.phone || "",
      org_header_text: applyHeaderTextTokens(ctx.branding.headerText, org.name || "Your HOA", org.legal_name) || undefined,
      org_homepage_url: ctx.branding.homepageUrl || undefined,
      footer_image_url: footerImageUrl || undefined,
      board_members: boardMembers && boardMembers.length > 0 ? boardMembers : [],
      Weblink: ctx.webViewUrl,
      compliance_footer: FOOTER_SENTINEL,
      year: new Date().getFullYear().toString(),
    };
    return {
      msg: { ...common, html: `${personalized}${FOOTER_SENTINEL}`, templateId: ctx.templateId, templateData },
    };
  }

  const html = buildEmailHtml({
    organization: org,
    subject: recipientSubject,
    content: recipientContent,
    emailType: ctx.emailType,
    greeting: ctx.greeting,
    salutation: ctx.salutation,
    boardMembers,
    recipientFirstName: firstName,
    directusUrl: ctx.directusUrl,
    emailId: ctx.emailId,
    appUrl: ctx.appUrl,
    headerText: ctx.branding.headerText,
    footerImage: ctx.branding.footerImage as any,
    homepageUrl: ctx.branding.homepageUrl,
    webViewUrl: ctx.webViewUrl,
    complianceFooter: SENTINEL_FOOTER,
  });
  return { msg: { ...common, html } };
}

const swap = (s: string | undefined, value: string) => (s == null ? s : s.split(FOOTER_SENTINEL).join(value));

/**
 * The recipient's own footer and headers, from the token read live after the
 * claim. `token` null: a CC/BCC copy, or before the schema exists — the generic
 * unsubscribe page and no List-Unsubscribe header.
 */
export function finalizeDraft(ctx: RenderContext, draft: Draft, token: string | null): OrgMessage {
  const rc = recipientCompliance({
    emailClass: ctx.emailClass,
    org: ctx.org,
    mailingAddress: ctx.mailingAddress,
    appUrl: ctx.appUrl,
    emailId: ctx.emailId,
    token,
  });
  const msg = draft.msg;
  const out: OrgMessage = {
    ...msg,
    html: swap(msg.html, rc.footer.html) as string,
    text: swap(msg.text, rc.footer.text) as string,
    headers: rc.headers,
  };
  if (msg.templateData) {
    out.templateData = {
      ...msg.templateData,
      content: swap(msg.templateData.content, rc.footer.html) as string,
      unsubscribe_url: rc.unsubscribeUrl || undefined,
      preferences_url: rc.preferencesUrl,
      compliance_footer: rc.footer.html,
    };
  }
  return out;
}

/** Render then finalize in one go — the synchronous path, and tests. */
export function renderMessage(ctx: RenderContext, target: RenderTarget, token: string | null): OrgMessage {
  return finalizeDraft(ctx, renderDraft(ctx, target), token);
}
