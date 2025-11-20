// server/api/vercel/domain-info.get.ts
import type { VercelDomainResponse } from "~/types/vercel";

export default defineEventHandler(async (event) => {
  const { domain } = getQuery(event);
  const config = useRuntimeConfig();

  if (!domain) {
    throw createError({
      statusCode: 400,
      message: "Domain parameter required",
    });
  }

  try {
    const vercelUrl = config.vercel.teamId
      ? `https://api.vercel.com/v9/projects/${config.vercel.projectId}/domains/${domain}?teamId=${config.vercel.teamId}`
      : `https://api.vercel.com/v9/projects/${config.vercel.projectId}/domains/${domain}`;

    const domainInfo = await $fetch<VercelDomainResponse>(vercelUrl, {
      headers: {
        Authorization: `Bearer ${config.vercel.apiToken}`,
      },
    });

    return domainInfo;
  } catch (error: any) {
    console.error("Error fetching domain info:", error);
    throw createError({
      statusCode: error.response?.status || 500,
      message: error.message || "Failed to fetch domain info",
    });
  }
});
