// POST /api/domains/verify  { organizationId }
// Checks the DNS TXT record the owner was asked to add. On success, flips
// domain_verified=true (which then lets Caddy issue a cert via /api/domains/ask
// and lets the custom-domain middleware route the host to this org).
import { readItem, updateItem } from "@directus/sdk";
import { resolveTxt } from "node:dns/promises";
import { verificationRecordName } from "../../utils/domains";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { organizationId } = body || {};
  if (!organizationId) {
    throw createError({ statusCode: 400, message: "organizationId is required" });
  }

  const access = await checkAdminAccess(event, organizationId);
  if (!access.isAdmin) {
    throw createError({ statusCode: 403, message: "Admin access required" });
  }

  const directus = getTypedDirectus();
  const org = (await directus.request(
    readItem("hoa_organizations", organizationId, {
      fields: ["id", "custom_domain", "domain_config", "domain_verified"],
    })
  )) as { custom_domain?: string | null; domain_config?: any; domain_verified?: boolean };

  const domain = org?.custom_domain;
  const cfg = (org?.domain_config || {}) as any;
  const token = cfg?.verification_token;
  if (!domain || !token) {
    throw createError({ statusCode: 400, message: "No pending domain to verify. Connect a domain first." });
  }

  const recordName = verificationRecordName(domain);
  const expected = `hoaconnect-verify=${token}`;

  let found = false;
  let records: string[] = [];
  try {
    const txt = await resolveTxt(recordName); // string[][]
    records = txt.map((parts) => parts.join(""));
    found = records.some((r) => r.trim() === expected || r.includes(token));
  } catch (e: any) {
    // ENOTFOUND / ENODATA → record not present yet
    found = false;
  }

  if (!found) {
    return {
      verified: false,
      message: "We couldn't find the verification record yet. DNS can take a few minutes to propagate.",
      expected: { name: recordName, type: "TXT", value: expected },
      seen: records,
    };
  }

  await directus.request(
    updateItem("hoa_organizations", organizationId, {
      domain_verified: true,
      domain_config: { ...cfg, status: "verified", verified_at: new Date().toISOString() } as any,
    })
  );

  return { verified: true, domain };
});
