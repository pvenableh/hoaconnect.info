// server/api/vercel/add-domain.post.ts
import { updateItem } from "@directus/sdk";
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

  // Detect domain type
  const parts = domain.split(".");
  const domainType =
    parts.length === 2 ? "apex" : parts[0] === "www" ? "www" : "subdomain";

  try {
    // Add domain to Vercel
    const vercelUrl = config.vercel.teamId
      ? `https://api.vercel.com/v10/projects/${config.vercel.projectId}/domains?teamId=${config.vercel.teamId}`
      : `https://api.vercel.com/v10/projects/${config.vercel.projectId}/domains`;

    const vercelResponse = await $fetch<VercelDomainResponse>(vercelUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.vercel.apiToken}`,
        "Content-Type": "application/json",
      },
      body: { name: domain },
    });

    // Prepare DNS instructions
    let dnsInstructions;

    if (domainType === "apex") {
      // Updated DNS configuration for 2026 with current Vercel infrastructure
      dnsInstructions = {
        type: "A",
        // Primary: CNAME flattening is now the preferred approach for most DNS providers
        recommended: [
          {
            type: "CNAME",
            name: "@",
            value: "cname.vercel-dns.com",
            note: "Preferred: Use CNAME flattening if your DNS provider supports it (Cloudflare, Route53, etc.)",
          },
        ],
        // Fallback for DNS providers without CNAME flattening
        primary: [
          {
            type: "A",
            name: "@",
            value: "76.76.21.21",
            note: "Vercel primary IPv4 address",
          },
        ],
        // WWW subdomain should always use CNAME
        www: [
          { type: "CNAME", name: "www", value: "cname.vercel-dns.com" },
        ],
        // Optional IPv6 support for modern infrastructure
        ipv6: [
          {
            type: "AAAA",
            name: "@",
            value: "2606:4700:3033::ac43:d2a4",
            note: "Optional: Add for IPv6 support",
          },
        ],
        // Legacy entries to remove if present
        deprecated: [
          {
            type: "A",
            value: "216.198.79.1",
            note: "DEPRECATED - Remove if present, use 76.76.21.21 instead",
          },
          {
            type: "AAAA",
            value: "2606:4700:3033::6815:48e",
            note: "DEPRECATED - Use updated IPv6 address if needed",
          },
        ],
        // Verification TXT record (may be required by some setups)
        verification: {
          type: "TXT",
          name: "@",
          value: `_vercel.${domain}`,
          note: "Add if domain verification fails",
        },
      };
    } else {
      const subdomain = parts[0];
      dnsInstructions = {
        type: "CNAME",
        records: [
          { type: "CNAME", name: subdomain, value: "cname.vercel-dns.com" },
        ],
      };
    }

    // Update Directus
    const directus = getTypedDirectus();
    await directus.request(
      updateItem("hoa_organizations", hoaId, {
        custom_domain: domain,
        domain_type: domainType,
        domain_verified: false,
        domain_config: {
          vercel_domain: vercelResponse.name,
          dns_instructions: dnsInstructions,
          added_at: new Date().toISOString(),
        },
      })
    );

    return {
      success: true,
      domain: vercelResponse.name,
      domainType,
      dnsInstructions,
    };
  } catch (error: any) {
    console.error("Error adding domain:", error);
    throw createError({
      statusCode: error.response?.status || 500,
      message:
        error.response?.data?.error?.message ||
        error.message ||
        "Failed to add domain",
    });
  }
});
