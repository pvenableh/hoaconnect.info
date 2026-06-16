/**
 * Resolve composer CC/BCC entries into live email addresses for an org.
 *
 * Entries are a mix of free-form emails and group tokens stored by the
 * composer (shared/email/cc.ts):
 *   @board            → active board members' emails
 *   @property_manager → management vendor contacts + PM-role member logins
 *
 * Resolution happens at send time so a re-sent draft always reflects the
 * current roster. Returns a de-duplicated, lowercased list.
 */
import { readItems } from "@directus/sdk";
import { CC_TOKEN_BOARD, CC_TOKEN_PROPERTY_MANAGER } from "~~/shared/email/cc";

export async function resolveCcBccEmails(
  organizationId: string,
  entries: string[] | null | undefined
): Promise<string[]> {
  if (!entries?.length) return [];

  const out = new Set<string>();
  const add = (e?: string | null) => {
    const v = (e || "").trim().toLowerCase();
    // Keep real addresses only; skip blanks and unexpanded tokens.
    if (v && v.includes("@") && !v.startsWith("@")) out.add(v);
  };

  let needBoard = false;
  let needPm = false;
  for (const raw of entries) {
    const v = (raw || "").trim();
    if (v === CC_TOKEN_BOARD) needBoard = true;
    else if (v === CC_TOKEN_PROPERTY_MANAGER) needPm = true;
    else add(v);
  }

  if (!needBoard && !needPm) return [...out];

  const directus = getTypedDirectus();

  if (needBoard) {
    const rows = (await directus.request(
      readItems("hoa_board_members", {
        filter: {
          hoa_member: {
            organization: { _eq: organizationId },
            status: { _eq: "active" },
          },
          status: { _eq: "published" },
        },
        fields: [{ hoa_member: ["email"] }],
        limit: -1,
      })
    )) as Array<{ hoa_member?: { email?: string | null } | null }>;
    for (const r of rows) add(r.hoa_member?.email);
  }

  if (needPm) {
    const config = useRuntimeConfig();
    const pmRole = config.public.directusRolePropertyManager as string | undefined;

    // Management vendor contacts (same source inquiry routing notifies).
    const vendors = (await directus.request(
      readItems("hoa_vendors", {
        filter: {
          organization: { _eq: organizationId },
          status: { _eq: "active" },
          category: { _eq: "management" },
        },
        fields: ["email", "notify_email"],
        limit: -1,
      })
    )) as Array<{ email?: string | null; notify_email?: boolean | null }>;
    for (const v of vendors) if (v.notify_email !== false) add(v.email);

    // Property Manager login accounts for the org.
    if (pmRole) {
      const pms = (await directus.request(
        readItems("hoa_members", {
          filter: {
            organization: { _eq: organizationId },
            role: { _eq: pmRole },
            status: { _eq: "active" },
          },
          fields: ["email"],
          limit: -1,
        })
      )) as Array<{ email?: string | null }>;
      for (const p of pms) add(p.email);
    }
  }

  return [...out];
}
