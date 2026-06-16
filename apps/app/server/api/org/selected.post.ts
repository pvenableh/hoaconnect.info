// server/api/org/selected.post.ts
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: "Not authenticated",
    });
  }

  const body = await readBody(event);
  const { orgId } = body;

  if (!orgId) {
    throw createError({
      statusCode: 400,
      message: "orgId is required",
    });
  }

  // Update session with selected org
  await setUserSession(event, {
    ...session,
    selectedOrgId: orgId,
  });

  return {
    success: true,
    selectedOrgId: orgId,
  };
});
