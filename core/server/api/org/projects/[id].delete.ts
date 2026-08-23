import { readItems, deleteItem, deleteItems, updateItems } from "@directus/sdk";

/**
 * Delete a project. Admin / PM-projects / the team lead of its team.
 *
 * WHAT GOES WITH IT, and why the database can't decide this on its own:
 *
 *   milestones/phases  CASCADE, in the schema. Gone.
 *   sub-projects       SET NULL. Kept, and become top-level projects — a
 *                      sub-project has its own title, budget and team, and is
 *                      not a detail of its parent.
 *   attached requests  SET NULL. Kept; a request outlives the project it was
 *                      folded into.
 *   TASKS              handled HERE, deliberately.
 *
 * `hoa_tasks.project` and `hoa_tasks.project_event` are both SET NULL, so
 * before this handler existed a deleted project left every one of its tasks
 * behind carrying `project: null`, `project_event: null` and `category:
 * "event"` — un-attributable rows in the org's task list, while the confirm
 * dialog told the admin they had been removed. "Panel upgrade" means nothing
 * once "Lobby renovation" is gone; it isn't work anyone can pick up, it's
 * noise nobody can explain or trace back.
 *
 * So the project's tasks are deleted, with ONE carve-out: a task that also
 * points at a request survives, because the request still exists and the task
 * is still its work. It simply detaches from the project (the schema's SET
 * NULL does that part) and its category is corrected to match.
 *
 * Not done in the schema as an ON DELETE CASCADE, which would have needed no
 * code at all: the database cannot make that carve-out, and a rule that
 * silently destroys a live request's task is worse than the orphan bug it
 * replaces.
 *
 * ORDER MATTERS. The event ids are collected FIRST — a task attached only to a
 * phase becomes unfindable the moment the phase cascades away. The project is
 * then deleted BEFORE the tasks: if the task sweep fails, the caller is left
 * with today's orphans, which is recoverable; if the project delete failed
 * after the sweep, a surviving project would have lost its whole task list.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });
  const query = getQuery(event);
  const orgId = String(query.orgId || "");
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const meta = await getProjectMeta(id);
  if (meta.organization !== orgId) throw createError({ statusCode: 404, message: "Project not found" });
  await requireProjectsWrite(event, orgId, meta.team);

  const directus = getTypedDirectus();

  // 1. The phases, while they still exist.
  const events = (await directus.request(
    readItems("hoa_project_events", {
      filter: { project: { _eq: id } },
      fields: ["id"],
      limit: -1,
    })
  )) as { id: string }[];
  const eventIds = (events || []).map((e) => e.id);

  // 2. Everything hanging off the project or one of its phases.
  const tasks = (await directus.request(
    readItems("hoa_tasks", {
      filter: {
        organization: { _eq: orgId },
        _or: [
          { project: { _eq: id } },
          ...(eventIds.length ? [{ project_event: { _in: eventIds } }] : []),
        ],
      },
      fields: ["id", "request"],
      limit: -1,
    })
  )) as { id: string; request: string | { id: string } | null }[];

  const doomed: string[] = [];
  const spared: string[] = [];
  for (const t of tasks || []) {
    (t.request ? spared : doomed).push(t.id);
  }

  // 3. The project itself — the thing actually asked for.
  await directus.request(deleteItem("hoa_projects", id));

  // 4. Its tasks. Subtasks ride along on hoa_tasks.parent_task's CASCADE, and
  //    so do the assignee rows; a batch that names both a parent and its child
  //    is one DELETE statement, so the double-name is harmless.
  let tasksRemoved = 0;
  try {
    if (doomed.length) {
      await directus.request(deleteItems("hoa_tasks", doomed));
      tasksRemoved = doomed.length;
    }
    // The spared ones have just had their project link nulled by the schema.
    // Leaving category: "project" on a task with no project is the same class
    // of quiet lie this handler exists to fix.
    if (spared.length) {
      await directus.request(updateItems("hoa_tasks", spared, { category: "request" } as any));
    }
  } catch (err) {
    // The project is gone; that is what the caller asked for and reporting a
    // failure now would be the lie. Log loudly instead — the residue is the
    // orphan state this handler replaced, not anything worse.
    console.error(`[projects/${id}.delete] project deleted but task cleanup failed`, err);
  }

  return { ok: true, tasksRemoved, tasksKept: spared.length };
});
