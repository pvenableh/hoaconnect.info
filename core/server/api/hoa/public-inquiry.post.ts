// server/api/hoa/public-inquiry.post.ts
//
// Public (unauthenticated) inquiry submission from an org's landing-page CTA.
// A visitor expresses interest (sale / rental / general); we store it as a
// hoa_requests row (so it shows in the admin requests inbox) and notify whoever
// the admin configured in settings.landing.inquiry — an email address or a
// specific user. Mirrors the admin-token pattern of requests/manager-create.
import { readItems, createItem, createNotification, readUsers } from "@directus/sdk";
import { normalizeLandingConfig, type InquiryCategory } from "#core/shared/utils/landing";

const CATEGORY_LABEL: Record<InquiryCategory, string> = {
  sale: "Purchase interest",
  rental: "Rental interest",
  general: "General inquiry",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { slug, category, name, email, phone, message } = body || {};

  // Honeypot: bots fill hidden fields. Pretend success, do nothing.
  if (body?.company) return { success: true };

  if (!slug || !name || !email || !message) {
    throw createError({ statusCode: 400, message: "Name, email and a message are required." });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) {
    throw createError({ statusCode: 400, message: "Enter a valid email address." });
  }
  const cat: InquiryCategory =
    category === "sale" || category === "rental" ? category : "general";

  const directus = getTypedDirectus();

  // Resolve the org (admin token; no visitor auth needed).
  const orgs = await directus.request(
    readItems("hoa_organizations", {
      filter: { slug: { _eq: String(slug) } },
      fields: ["id", "name", "slug", "email", { settings: ["landing"] }],
      limit: 1,
    })
  );
  const org: any = orgs?.[0];
  if (!org) throw createError({ statusCode: 404, message: "Organization not found." });

  const cfg = normalizeLandingConfig(
    org.settings && typeof org.settings === "object" ? org.settings.landing : null
  );

  const visitorName = String(name).slice(0, 120);
  const visitorEmail = String(email).slice(0, 200);
  const visitorPhone = phone ? String(phone).slice(0, 60) : null;
  const note = String(message).slice(0, 4000);
  const label = CATEGORY_LABEL[cat];

  // Store as a request so it lands in the admin inbox.
  const created: any = await directus.request(
    createItem("hoa_requests", {
      organization: org.id,
      type: "task",
      category: "landing_inquiry",
      title: `Website inquiry — ${label}`,
      description: note,
      status: "open",
      priority: "normal",
      metadata: {
        source: "public_landing",
        inquiry_category: cat,
        visitor_name: visitorName,
        visitor_email: visitorEmail,
        visitor_phone: visitorPhone,
      },
    } as any)
  );

  // Notify per admin-configured routing (email address or a specific user),
  // falling back to the org's contact email.
  const config = useRuntimeConfig();
  const appUrl = (config.public.appUrl || "").replace(/\/$/, "");
  const detailUrl = `${appUrl}/${org.slug}/admin/requests/${created.id}`;
  const subject = `[${org.name || "HOA Connect"}] New website inquiry — ${label}`;
  const html =
    `<p><strong>${escapeHtml(visitorName)}</strong> submitted a website inquiry (${escapeHtml(label.toLowerCase())}).</p>` +
    `<p>Email: <a href="mailto:${escapeHtml(visitorEmail)}">${escapeHtml(visitorEmail)}</a>` +
    (visitorPhone ? `<br/>Phone: ${escapeHtml(visitorPhone)}` : "") +
    `</p>` +
    `<p style="white-space:pre-wrap">${escapeHtml(note)}</p>` +
    `<p><a href="${detailUrl}">View in HOA Connect →</a></p>`;
  const text = `${visitorName} submitted a website inquiry (${label}).\nEmail: ${visitorEmail}${visitorPhone ? `\nPhone: ${visitorPhone}` : ""}\n\n${note}\n\nView: ${detailUrl}`;

  let toEmail: string | null = null;
  if (cfg.inquiry.recipient_type === "user" && cfg.inquiry.user) {
    // In-app notification to the chosen user; also email them if we can.
    try {
      await directus.request(
        createNotification({
          recipient: cfg.inquiry.user,
          subject,
          message: `${visitorName} (${visitorEmail}) — ${label}.`,
          collection: "hoa_requests",
          item: created.id,
        })
      );
    } catch (e) {
      console.warn("[public-inquiry] in-app notify failed", e);
    }
    try {
      const users = await directus.request(
        readUsers({ filter: { id: { _eq: cfg.inquiry.user } }, fields: ["email"], limit: 1 })
      );
      toEmail = (users?.[0] as any)?.email || null;
    } catch {
      /* ignore */
    }
  } else if (cfg.inquiry.recipient_type === "email" && cfg.inquiry.email) {
    toEmail = cfg.inquiry.email;
  }
  if (!toEmail) toEmail = org.email || null;

  if (toEmail) {
    try {
      await sendEmail({ to: toEmail, subject, text, html });
    } catch (e) {
      console.warn("[public-inquiry] email notify failed", e);
    }
  }

  // Landing insights: count the inquiry (best-effort).
  await bumpLandingStat(org.id, "inquiries", directus);

  return { success: true };
});
