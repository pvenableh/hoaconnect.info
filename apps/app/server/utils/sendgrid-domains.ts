/**
 * SendGrid Domain Authentication (white-label sending domains).
 *
 * Thin wrapper over the SendGrid v3 management API, using the same
 * SENDGRID_API_KEY as mail send (the key needs "Sender Authentication" access).
 * An org authenticates a domain → SendGrid returns CNAME records the org adds to
 * DNS → we validate → once valid the org may send `from` that domain.
 *
 * Docs: https://www.twilio.com/docs/sendgrid/api-reference/domain-authentication
 */

export interface SendgridDnsRecord {
  host: string;
  type: string;
  data: string;
  valid?: boolean;
}

interface SendgridDomainAuth {
  id: number;
  domain: string;
  valid: boolean;
  dns: Record<string, { host: string; type: string; data: string; valid?: boolean }>;
}

const SG_BASE = "https://api.sendgrid.com/v3";

async function sgRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  const apiKey = useRuntimeConfig().sendgridApiKey as string | undefined;
  if (!apiKey) {
    throw createError({ statusCode: 503, message: "SENDGRID_API_KEY is not configured" });
  }
  const res = await fetch(`${SG_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw createError({
      statusCode: res.status === 401 || res.status === 403 ? 502 : res.status,
      message: `SendGrid domain API ${res.status}: ${text}`,
    });
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Flatten SendGrid's keyed `dns` object into a UI-friendly record list. */
export function toDnsRecords(
  dns: SendgridDomainAuth["dns"] | null | undefined
): SendgridDnsRecord[] {
  if (!dns) return [];
  return Object.values(dns).map((r) => ({
    host: r.host,
    type: (r.type || "CNAME").toUpperCase(),
    data: r.data,
    valid: r.valid,
  }));
}

export async function createDomainAuthentication(domain: string): Promise<SendgridDomainAuth> {
  return sgRequest<SendgridDomainAuth>("/whitelabel/domains", "POST", {
    domain,
    automatic_security: true, // SendGrid manages DKIM via CNAMEs
    default: false,
  });
}

export async function validateDomainAuthentication(
  id: string | number
): Promise<{ id: number; valid: boolean }> {
  return sgRequest<{ id: number; valid: boolean }>(
    `/whitelabel/domains/${id}/validate`,
    "POST"
  );
}

export async function getDomainAuthentication(id: string | number): Promise<SendgridDomainAuth> {
  return sgRequest<SendgridDomainAuth>(`/whitelabel/domains/${id}`, "GET");
}

export async function deleteDomainAuthentication(id: string | number): Promise<void> {
  await sgRequest<null>(`/whitelabel/domains/${id}`, "DELETE");
}
