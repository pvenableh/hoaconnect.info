export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  try {
    const config = useRuntimeConfig();

    // Use direct REST API call to fetch roles instead of SDK
    // This avoids the readItems restriction on core collections
    const response = await $fetch(`${config.directusUrl}/roles`, {
      headers: {
        Authorization: `Bearer ${config.directusToken}`,
      },
      params: {
        filter: JSON.stringify({
          name: { _neq: "Administrator" },
        }),
        fields: ['id', 'name', 'description'].join(','),
      },
    });

    return response;
  } catch (error: any) {
    console.error("Error fetching roles:", error);
    throw createError({
      statusCode: 500,
      message: "Failed to fetch roles",
    });
  }
});
