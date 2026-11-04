/**
 * GET /api/meetings/:id/calendar — the meeting as an .ics file.
 *
 * What the meeting reminder's "Add to calendar" button opens. Member-gated like
 * the other id-trusting routes: the caller must belong to the meeting's
 * community, and a meeting that isn't published is not found.
 */
import { readItem } from "@directus/sdk";
import { buildMeetingIcs } from "#core/shared/meetings/ics";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, message: "id is required" });

  await requireAuthenticatedUser(event);

  const directus = getTypedDirectus();
  let m: any = null;
  try {
    m = await directus.request(
      readItem("hoa_meetings", id, {
        fields: ["id", "title", "meeting_date", "location", "is_published", { organization: ["id", "name"] }] as any,
      })
    );
  } catch {
    m = null;
  }
  if (!m || m.is_published === false) throw createError({ statusCode: 404, message: "Meeting not found" });

  const org = typeof m.organization === "string" ? { id: m.organization, name: null } : m.organization;
  if (!org?.id) throw createError({ statusCode: 404, message: "Meeting not found" });
  const { isMember } = await checkMembership(event, org.id);
  if (!isMember) throw createError({ statusCode: 403, message: "Not a member of this organization" });

  const ics = buildMeetingIcs({ id: m.id, title: m.title, startsAt: m.meeting_date, location: m.location, orgName: org.name });
  if (!ics) throw createError({ statusCode: 404, message: "This meeting has no date" });

  setResponseHeader(event, "Content-Type", "text/calendar; charset=utf-8");
  setResponseHeader(event, "Content-Disposition", `attachment; filename="meeting-${m.id}.ics"`);
  setResponseHeader(event, "Cache-Control", "private, no-store");
  return ics;
});
