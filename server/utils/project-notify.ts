import { readItems, createNotification } from "@directus/sdk";

/**
 * In-app notifications for the project-management module — Directus native
 * notifications, mirroring change-request-notify.ts (surfaces in the bell via
 * useDirectusNotifications). Best-effort: a notify failure never fails the
 * action that triggered it.
 */

const idOf = (v: any) => (typeof v === "string" ? v : v?.id) || null;

/**
 * User ids of an org's project approvers — admins + property managers holding
 * the `projects` grant. These are exactly the people who can approve a
 * milestone in-app, so they're who we ping when one needs approval.
 */
async function approverUserIds(orgId: string): Promise<string[]> {
  const config = useRuntimeConfig();
  const hoaAdmin = config.public.directusRoleHoaAdmin;
  const pmRole = config.public.directusRolePropertyManager;
  const admin = getTypedDirectus();

  const members: any[] = await admin.request(
    readItems("hoa_members", {
      filter: {
        organization: { _eq: orgId },
        status: { _eq: "active" },
        role: { _in: [hoaAdmin, pmRole].filter(Boolean) as string[] },
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
      if (g && typeof g === "object" && g.projects === true) ids.add(uid);
    }
  }
  return [...ids];
}

async function notify(recipients: string[], subject: string, message: string, item: string, exclude?: string | null) {
  if (!recipients.length) return;
  const admin = getTypedDirectus();
  for (const uid of recipients) {
    if (exclude && uid === exclude) continue;
    try {
      await admin.request(
        createNotification({ recipient: uid, subject, message, collection: "hoa_project_events", item })
      );
    } catch (e) {
      console.warn("[project-notify] failed for", uid, e);
    }
  }
}

/** A milestone needs board/admin approval → ping the approvers. */
export async function notifyApprovalRequested(orgId: string, ev: { id: string; title?: string | null; projectTitle?: string | null }, requestedBy?: string | null): Promise<void> {
  const recipients = await approverUserIds(orgId);
  const where = ev.projectTitle ? ` on ${ev.projectTitle}` : "";
  await notify(
    recipients,
    "Milestone needs approval",
    `"${ev.title || "A milestone"}"${where} is awaiting your approval.`,
    ev.id,
    requestedBy
  );
}

/** A milestone was approved/rejected → tell whoever requested it (if known). */
export async function notifyApprovalDecided(ev: { id: string; title?: string | null }, decidedBy: string | null, approved: boolean, requestedBy?: string | null): Promise<void> {
  if (!requestedBy) return;
  await notify(
    [requestedBy],
    approved ? "Milestone approved" : "Milestone not approved",
    approved
      ? `"${ev.title || "A milestone"}" was approved.`
      : `"${ev.title || "A milestone"}" was not approved — check the note.`,
    ev.id,
    decidedBy
  );
}

/**
 * A task was assigned → ping the assignees (multi-assignee M2M ids). Uses the
 * task's own collection/item so the bell deep-links correctly.
 */
export async function notifyTaskAssigned(assigneeIds: string[], task: { id: string; title?: string | null }, assignedBy?: string | null): Promise<void> {
  const recipients = [...new Set(assigneeIds.filter(Boolean))];
  if (!recipients.length) return;
  const admin = getTypedDirectus();
  for (const uid of recipients) {
    if (assignedBy && uid === assignedBy) continue;
    try {
      await admin.request(
        createNotification({
          recipient: uid,
          subject: "New task assigned",
          message: `You were assigned "${task.title || "a task"}".`,
          collection: "hoa_tasks",
          item: task.id,
        })
      );
    } catch (e) {
      console.warn("[project-notify] task notify failed for", uid, e);
    }
  }
}
