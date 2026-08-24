import { createItem, readItems, readItem, readUser } from "@directus/sdk";

const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );

/**
 * Notify an org's admins that a join request is awaiting review. Emails active
 * admin members (+ the org contact email) and drops an in-app notification.
 */
async function notifyAdminsOfJoinRequest(
  directus: ReturnType<typeof getTypedDirectus>,
  opts: {
    organization: { id: string; name?: string | null; slug?: string | null; email?: string | null };
    joinRequestId: string;
    applicantId: string;
    unitNumber?: string | null;
    memberType: string;
  }
) {
  const config = useRuntimeConfig();
  const { organization: org, joinRequestId, applicantId, unitNumber, memberType } = opts;

  const applicant = (await directus
    .request(readUser(applicantId, { fields: ["first_name", "last_name", "email"] }))
    .catch(() => null)) as any;
  const applicantName =
    [applicant?.first_name, applicant?.last_name].filter(Boolean).join(" ") || applicant?.email || "Someone";

  const adminRoles = [
    config.public.directusRoleHoaAdmin,
    config.public.directusRoleAppAdmin,
  ].filter(Boolean) as string[];

  const admins = adminRoles.length
    ? ((await directus
        .request(
          readItems("hoa_members", {
            filter: {
              organization: { _eq: org.id },
              status: { _eq: "active" },
              role: { _in: adminRoles },
            },
            fields: ["email", { user: ["id"] }],
            limit: 50,
          })
        )
        .catch(() => [])) as any[])
    : [];

  const emails = [...new Set(admins.map((a) => a.email).concat(org.email || []).filter(Boolean))];
  const userIds = [...new Set(admins.map((a) => a?.user?.id).filter(Boolean))];

  const appUrl = ((config.public.appUrl as string) || "").replace(/\/$/, "");
  const reviewUrl = org.slug ? `${appUrl}/${org.slug}/admin/users` : "";
  const detail = `${memberType}${unitNumber ? ` · unit ${unitNumber}` : ""}`;
  const subject = `New membership request — ${org.name || "your community"}`;
  const text = `${applicantName} requested to join ${org.name || "your community"} (${detail}).${
    reviewUrl ? `\n\nReview: ${reviewUrl}` : ""
  }`;
  const html =
    `<p><strong>${esc(applicantName)}</strong> requested to join <strong>${esc(org.name || "your community")}</strong>.</p>` +
    `<p>${esc(detail)}${applicant?.email ? ` · <a href="mailto:${esc(applicant.email)}">${esc(applicant.email)}</a>` : ""}</p>` +
    (reviewUrl ? `<p><a href="${reviewUrl}">Review the request →</a></p>` : "");

  // Through `notifyUsers` rather than a raw createNotification loop, so the
  // admins' Membership switch is honored and the alert also reaches their phone.
  // The org-scope gate inside it is the reason this is safe to feed from an
  // admin roster read: an id that is no longer a member of this community is
  // dropped rather than notified about it.
  await notifyUsers({
    organizationId: org.id,
    recipientUserIds: userIds as string[],
    category: "membership",
    subject,
    message: `${applicantName} requested to join (${detail}).`,
    collection: "hoa_join_requests",
    item: joinRequestId,
    path: "/admin/users",
  }).catch((e) => console.warn("[request-join] in-app notify failed", e));
  for (const to of emails) {
    await sendEmail({ to, subject, text, html }).catch((e) =>
      console.warn("[request-join] email failed", e)
    );
  }
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const { organizationId, unitNumber, memberType, message } = body;

  if (!organizationId) {
    throw createError({
      statusCode: 400,
      message: "Organization ID is required",
    });
  }

  try {
    const directus = getTypedDirectus();

    // Verify the organization exists
    const organization = await directus.request(
      readItem("hoa_organizations", organizationId, {
        fields: ["id", "name", "status", "slug", "email"],
      })
    );

    if (!organization) {
      throw createError({
        statusCode: 404,
        message: "Organization not found",
      });
    }

    if (organization.status !== "active") {
      throw createError({
        statusCode: 400,
        message: "This organization is not accepting new members",
      });
    }

    // Check if user is already a member of this organization
    const existingMember = await directus.request(
      readItems("hoa_members", {
        filter: {
          user: { _eq: session.user.id },
          organization: { _eq: organizationId },
          status: { _in: ["active", "pending"] },
        },
        limit: 1,
      })
    );

    if (existingMember && existingMember.length > 0) {
      throw createError({
        statusCode: 400,
        message: "You are already a member of this organization",
      });
    }

    // Check if user already has a pending request for this organization
    const existingRequest = await directus.request(
      readItems("hoa_join_requests", {
        filter: {
          user: { _eq: session.user.id },
          organization: { _eq: organizationId },
          status: { _eq: "pending" },
        },
        limit: 1,
      })
    );

    if (existingRequest && existingRequest.length > 0) {
      throw createError({
        statusCode: 400,
        message: "You already have a pending request to join this organization",
      });
    }

    // Create the join request
    const joinRequest = await directus.request(
      createItem("hoa_join_requests", {
        user: session.user.id,
        organization: organizationId,
        unit_number: unitNumber || null,
        member_type: memberType || "owner",
        message: message || null,
        status: "pending",
      })
    );

    // Notify the org's admins that a request is awaiting review (best-effort).
    try {
      await notifyAdminsOfJoinRequest(directus, {
        organization,
        joinRequestId: joinRequest.id,
        applicantId: session.user.id,
        unitNumber,
        memberType: memberType || "owner",
      });
    } catch (e) {
      console.warn("[request-join] admin notification failed:", e);
    }

    return {
      success: true,
      request: {
        id: joinRequest.id,
        status: "pending",
        organizationName: organization.name,
      },
      message: "Your request to join has been submitted. An administrator will review your request.",
    };
  } catch (error: any) {
    console.error("Request join error:", error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 400,
      message: error.message || "Failed to submit join request",
    });
  }
});
