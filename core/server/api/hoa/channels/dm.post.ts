import { createItem, createItems, readItems } from "@directus/sdk";
import { dmSlug } from "#core/shared/channels/rules";

/**
 * POST /api/hoa/channels/dm — open (or create) a direct message.
 *
 * A DM is a private channel (`is_private` + `is_dm`) whose roster is exactly
 * two people, found again by a slug derived from the pair — so "Message Ana"
 * twice is the same conversation, whoever starts it. No new collection.
 *
 * Channels are an admin/board tool, so BOTH people must be able to use them:
 * org admins or active board members of the community (the same people
 * `getOrgChannelEnrollees` enrolls into every public channel). That is also the
 * guarantee a third party can't be put in the room — the roster is written once,
 * here, and `invite` / `remove-member` refuse DMs.
 *
 * Body: { organization, userId }  → { channel, created }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}) as any);
  const organization = String(body?.organization ?? "").trim();
  const peer = String(body?.userId ?? "").trim();
  if (!organization || !peer) {
    throw createError({ statusCode: 400, message: "organization and userId are required" });
  }

  const { userId } = await requireAuthenticatedUser(event);
  if (peer === userId) throw createError({ statusCode: 400, message: "You can't message yourself" });

  const directus = getTypedDirectus();
  const eligible = new Map(
    (await getOrgChannelEnrollees(directus, organization)).map((e) => [e.user, e.hoa_member])
  );
  if (!eligible.has(userId)) {
    throw createError({ statusCode: 403, message: "Admin or board access required" });
  }
  if (!eligible.has(peer)) {
    throw createError({ statusCode: 403, message: "That person can't be messaged in channels" });
  }

  const slug = dmSlug(userId, peer);
  const find = async () =>
    (
      (await directus.request(
        readItems("hoa_channels", {
          filter: {
            organization: { _eq: organization },
            slug: { _eq: slug },
            is_dm: { _eq: true },
            status: { _neq: "deleted" },
          } as any,
          fields: ["id", "name", "slug", "status"],
          limit: 1,
        })
      )) as any[]
    )[0];

  let existing: any;
  try {
    existing = await find();
  } catch {
    // `is_dm` isn't in the schema yet.
    throw createError({
      statusCode: 409,
      message: "Direct messages need the Phase 7 schema update (pnpm add:channel-phase7).",
    });
  }
  if (existing) return { channel: existing, created: false };

  const channel: any = await directus.request(
    createItem("hoa_channels", {
      name: "Direct message",
      slug,
      description: null,
      is_private: true,
      is_dm: true,
      is_default: false,
      organization,
      status: "published",
    } as any)
  );
  await directus.request(
    createItems(
      "hoa_channel_members",
      [userId, peer].map((user) => ({
        channel: channel.id,
        user,
        hoa_member: eligible.get(user) ?? null,
        // Plain members: nobody in a DM can add or remove anyone.
        role: "member",
        invited_by: userId,
      })) as any
    )
  );
  return { channel, created: true };
});
