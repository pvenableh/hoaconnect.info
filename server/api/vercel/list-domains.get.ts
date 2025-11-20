// server/api/vercel/list-domains.get.ts
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  try {
    const vercelUrl = config.vercel.teamId
      ? `https://api.vercel.com/v9/projects/${config.vercel.projectId}/domains?teamId=${config.vercel.teamId}`
      : `https://api.vercel.com/v9/projects/${config.vercel.projectId}/domains`;

    const response = await $fetch<{ domains: any[] }>(vercelUrl, {
      headers: {
        Authorization: `Bearer ${config.vercel.apiToken}`,
      },
    });

    return response;
  } catch (error: any) {
    console.error("Error listing domains:", error);
    throw createError({
      statusCode: error.response?.status || 500,
      message: error.message || "Failed to list domains",
    });
  }
});
