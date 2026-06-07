// server/api/hoa/recompute-member-count.post.ts
// Admin-gated endpoint to refresh an org's member_count after the client mutates
// members (MembersPage create/delete/status). Server-side member paths call the
// helper directly.
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const organizationId = body?.organizationId as string | undefined;
  if (!organizationId) {
    throw createError({ statusCode: 400, message: "organizationId is required" });
  }
  await requireAdminAccess(event, organizationId);
  const count = await recomputeMemberCount(organizationId);
  return { success: true, member_count: count };
});
