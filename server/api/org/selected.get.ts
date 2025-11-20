// server/api/org/selected.get.ts
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);

  if (!session?.user) {
    throw createError({
      statusCode: 401,
      message: "Not authenticated",
    });
  }

  return {
    selectedOrgId: session.selectedOrgId || null,
  };
});
