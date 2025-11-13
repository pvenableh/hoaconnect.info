// server/api/vercel/verify-domain.post.ts
import type { VercelDomainResponse } from "~/types/vercel";

export default defineEventHandler(async (event) => {
  const { domain, hoaId } = await readBody(event);
  const config = useRuntimeConfig();

  if (!domain || !hoaId) {
    throw createError({
      statusCode: 400,
      message: "Domain and hoaId required",
    });
  }

  try {
    // Check domain status with Vercel
    const vercelUrl = config.vercel.teamId
      ? `https://api.vercel.com/v9/projects/${config.vercel.projectId}/domains/${domain}?teamId=${config.vercel.teamId}`
      : `https://api.vercel.com/v9/projects/${config.vercel.projectId}/domains/${domain}`;

    const domainInfo = await $fetch<VercelDomainResponse>(vercelUrl, {
      headers: {
        Authorization: `Bearer ${config.vercel.apiToken}`,
      },
    });

    const isVerified = domainInfo.verified === true;

    // Update Directus if verified
    if (isVerified) {
      await updateDirectusItem("hoa_organizations", hoaId, {
        domain_verified: true,
        domain_config: {
          verified_at: new Date().toISOString(),
          vercel_response: domainInfo,
        },
      });
    }

    return {
      verified: isVerified,
      domain: domain,
      status: domainInfo,
    };
  } catch (error: any) {
    console.error("Error verifying domain:", error);
    throw createError({
      statusCode: error.response?.status || 500,
      message: error.message || "Failed to verify domain",
    });
  }
});
