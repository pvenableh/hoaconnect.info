import { readItems, readItem, createNotification } from "@directus/sdk";

/**
 * In-app notifications for the member self-service review workflow, mirroring
 * the inquiry-routing pattern (Directus native notifications).
 */

const KIND_LABEL: Record<string, string> = {
  contact: "contact info",
  mailing_address: "mailing address",
  vehicle: "a vehicle",
  pet: "a pet",
};

const idOf = (v: any) => (typeof v === "string" ? v : v?.id) || null;

/** Resolve the user ids of an org's reviewers (admins + PM-with-directory). */
async function reviewerUserIds(admin: any, orgId: string): Promise<string[]> {
  const config = useRuntimeConfig();
  const hoaAdmin = config.public.directusRoleHoaAdmin;
  const pmRole = config.public.directusRolePropertyManager;

  const members: any[] = await admin.request(
    readItems("hoa_members", {
      filter: {
        organization: { _eq: orgId },
        status: { _eq: "active" },
        role: { _in: [hoaAdmin, pmRole].filter(Boolean) },
      },
      fields: ["user", "role", "manager_permissions"],
      limit: -1,
    })
  );

  const ids = new Set<string>();
  for (const m of members) {
    const roleId = idOf(m.role);
    const uid = idOf(m.user);
    if (!uid) continue;
    if (roleId === hoaAdmin) ids.add(uid);
    else if (roleId === pmRole) {
      const g = m.manager_permissions;
      if (g && typeof g === "object" && g.directory === true) ids.add(uid);
    }
  }
  return [...ids];
}

export async function notifyReviewersOfChangeRequest(orgId: string, cr: any, memberId: string): Promise<void> {
  const admin = getTypedDirectus();
  const recipients = await reviewerUserIds(admin, orgId);
  if (!recipients.length) return;

  let name = "A resident";
  try {
    const m = await admin.request(readItem("hoa_members", memberId, { fields: ["first_name", "last_name"] }));
    const full = [m?.first_name, m?.last_name].filter(Boolean).join(" ");
    if (full) name = full;
  } catch {
    /* best effort */
  }

  const label = KIND_LABEL[cr.kind] || "their details";
  const submitter = idOf(cr.submitted_by);
  const subject = "Profile change to review";
  const message = `${name} requested a change to ${label}.`;

  for (const uid of recipients) {
    if (uid === submitter) continue; // a reviewer editing their own data: skip self-ping
    try {
      await admin.request(
        createNotification({
          recipient: uid,
          subject,
          message,
          collection: "hoa_member_change_requests",
          item: cr.id,
        })
      );
    } catch (e) {
      console.warn("[change-requests] reviewer notify failed for", uid, e);
    }
  }
}

export async function notifyResidentOfDecision(orgId: string, cr: any): Promise<void> {
  const admin = getTypedDirectus();
  const recipient = idOf(cr.submitted_by);
  if (!recipient) return;

  const label = KIND_LABEL[cr.kind] || "your details";
  const approved = cr.status === "approved";
  const subject = approved ? "Change approved" : "Change needs another look";
  const message = approved
    ? `Your requested change to ${label} was approved.`
    : `Your requested change to ${label} wasn't approved. Check the note and try again.`;

  try {
    await admin.request(
      createNotification({
        recipient,
        subject,
        message,
        collection: "hoa_member_change_requests",
        item: cr.id,
      })
    );
  } catch (e) {
    console.warn("[change-requests] resident notify failed:", e);
  }
}
