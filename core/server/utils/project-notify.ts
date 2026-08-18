import { readItems } from "@directus/sdk";
import { sendBrandedTransactionalEmail } from "./transactional-email";
import { notifyUsers } from "./notify";

/**
 * Project-management notifications. Each event goes out on both in-app channels
 * via `notifyUsers` (the durable bell row plus a best-effort web push, both
 * gated on the member's per-category preference) AND as a branded email twin via
 * `sendBrandedTransactionalEmail` so the recipient gets a real message — not
 * just a silent badge. Every layer is best-effort: a failure never fails the
 * action that triggered it.
 *
 * Category is "task" throughout: these are all project-workspace items, and the
 * member's Tasks toggle is the one they'd expect to control them.
 */

const idOf = (v: any) => (typeof v === "string" ? v : v?.id) || null;

/** Escape interpolated, user-authored titles before embedding in email HTML. */
const esc = (s: string | null | undefined) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

async function notify(orgId: string, recipients: string[], subject: string, message: string, item: string, exclude?: string | null) {
  if (!recipients.length) return;
  await notifyUsers({
    organizationId: orgId,
    recipientUserIds: recipients,
    category: "task",
    subject,
    message,
    collection: "hoa_project_events",
    item,
    path: "/admin/projects",
    excludeUserId: exclude,
  }).catch((e) => console.warn("[project-notify] notify failed", (e as Error).message));
}

/** A milestone needs board/admin approval → ping the approvers (bell + email). */
export async function notifyApprovalRequested(orgId: string, ev: { id: string; title?: string | null; projectTitle?: string | null }, requestedBy?: string | null): Promise<void> {
  const recipients = await approverUserIds(orgId);
  const where = ev.projectTitle ? ` on ${ev.projectTitle}` : "";
  await notify(
    orgId,
    recipients,
    "Milestone needs approval",
    `"${ev.title || "A milestone"}"${where} is awaiting your approval.`,
    ev.id,
    requestedBy
  );
  await sendBrandedTransactionalEmail({
    organizationId: orgId,
    recipientUserIds: recipients,
    excludeUserId: requestedBy,
    subject: `Approval needed: ${ev.title || "a milestone"}`,
    heading: "A milestone needs your approval",
    bodyHtml: `<p>The milestone <strong>${esc(ev.title) || "a milestone"}</strong>${ev.projectTitle ? ` on <strong>${esc(ev.projectTitle)}</strong>` : ""} is awaiting your approval. Review the details, then approve it or send it back with a note.</p>`,
    cta: { label: "Review milestone", path: "/admin/projects" },
    emailType: "notice",
  }).catch(() => {});
}

/** A milestone was approved/rejected → tell whoever requested it (bell + email). */
export async function notifyApprovalDecided(orgId: string, ev: { id: string; title?: string | null }, decidedBy: string | null, approved: boolean, requestedBy?: string | null): Promise<void> {
  if (!requestedBy) return;
  await notify(
    orgId,
    [requestedBy],
    approved ? "Milestone approved" : "Milestone not approved",
    approved
      ? `"${ev.title || "A milestone"}" was approved.`
      : `"${ev.title || "A milestone"}" was not approved — check the note.`,
    ev.id,
    decidedBy
  );
  await sendBrandedTransactionalEmail({
    organizationId: orgId,
    recipientUserIds: [requestedBy],
    excludeUserId: decidedBy,
    subject: approved ? `Approved: ${ev.title || "a milestone"}` : `Needs another look: ${ev.title || "a milestone"}`,
    heading: approved ? "Your milestone was approved" : "Your milestone needs another look",
    bodyHtml: approved
      ? `<p><strong>${esc(ev.title) || "A milestone"}</strong> was approved and is ready to proceed.</p>`
      : `<p><strong>${esc(ev.title) || "A milestone"}</strong> was not approved. Open the milestone to read the reviewer's note and adjust.</p>`,
    cta: { label: "View milestone", path: "/admin/projects" },
    emailType: approved ? "notice" : "alert",
  }).catch(() => {});
}

/**
 * A task was assigned → ping the assignees (bell + email). Uses the task's own
 * collection/item so the bell deep-links correctly.
 */
export async function notifyTaskAssigned(orgId: string, assigneeIds: string[], task: { id: string; title?: string | null }, assignedBy?: string | null): Promise<void> {
  const recipients = [...new Set(assigneeIds.filter(Boolean))];
  if (!recipients.length) return;
  await notifyUsers({
    organizationId: orgId,
    recipientUserIds: recipients,
    category: "task",
    subject: "New task assigned",
    message: `You were assigned "${task.title || "a task"}".`,
    collection: "hoa_tasks",
    item: task.id,
    path: "/admin/projects",
    excludeUserId: assignedBy,
  }).catch((e) => console.warn("[project-notify] task notify failed", (e as Error).message));
  await sendBrandedTransactionalEmail({
    organizationId: orgId,
    recipientUserIds: recipients,
    excludeUserId: assignedBy,
    subject: `New task: ${task.title || "a task"}`,
    heading: "You have a new task",
    bodyHtml: `<p>You were assigned <strong>${esc(task.title) || "a task"}</strong>. Open the projects workspace to see the details and get started.</p>`,
    cta: { label: "View task", path: "/admin/projects" },
    emailType: "basic",
  }).catch(() => {});
}
