// POST /api/billing-account/add-property
// Agency billing P3 (docs/plan-agency-multi-property-billing.md §8-§9.1): spin up
// a new property org already attached to the billing account, with the caller
// as its HOA Admin. No own Stripe subscription — entitlement resolves up to the
// account. Bumps the account's seat count (Stripe prorates up). Owner /
// billing_admin only.
//
// **The board-admin guarantee (Phase 4).** This route used to make the creating
// agency the new community's ONLY HOA Admin, which is how a community ends up
// unable to run its own account: when the manager leaves, the admin seat leaves
// with them. `planTransition` refuses that state outright — `no_eligible_successor`
// — and refusing it at transition time is far too late, because by then the only
// person who could invite a board member is the manager being offboarded.
//
// So a property cannot be created without naming someone from the community.
// The caller still becomes an admin (they have to be able to set the property
// up); they are just no longer the only one. It costs an agency one field and
// it is the difference between a community that can leave and one that cannot.
import { z } from "zod";
import { createItem, createFolder, readItems, readRoles, updateItem } from "@directus/sdk";
import { randomBytes } from "crypto";
import { sendHoaInvitationEmail } from "../../utils/sendgrid";

/** How long the board admin's invitation stays valid. Matches invite-member. */
const INVITE_TTL_DAYS = 7;

const schema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1, "Property name is required"),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use only lowercase letters, numbers, and hyphens"),
  street_address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  // Required, deliberately. See the board-admin guarantee note above.
  boardAdmin: z.object({
    firstName: z.string().min(1, "The community administrator's first name is required"),
    lastName: z.string().min(1, "The community administrator's last name is required"),
    email: z
      .string({ required_error: "A community administrator's email is required" })
      .email("Enter a valid email for the community's administrator"),
  }),
});

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: parsed.error.errors.map((e) => e.message).join(", "),
    });
  }
  const { accountId, name, slug, street_address, city, state, zip, phone, email, boardAdmin } =
    parsed.data;
  const boardAdminEmail = boardAdmin.email.toLowerCase().trim();

  const { userId, email: userEmail } = await requireAuthenticatedUser(event);
  await requireBillingAccountRole(event, accountId, ["owner", "billing_admin"]);
  await getBillingAccount(accountId); // 404 if missing

  const directus = getTypedDirectus();

  // Slug uniqueness.
  const existing = await directus.request(
    readItems("hoa_organizations", { filter: { slug: { _eq: slug } }, fields: ["id"], limit: 1 })
  );
  if (existing?.length) {
    throw createError({ statusCode: 400, message: "This slug is already taken" });
  }

  // 1. Org attached to the account (no own subscription — resolves up).
  const org: any = await directus.request(
    createItem("hoa_organizations", {
      name,
      slug,
      street_address: street_address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      phone: phone || null,
      email: email || null,
      status: "active",
      billing_account: accountId,
    })
  );

  // 2. Folder.
  try {
    const folder = await directus.request(createFolder({ name }));
    await directus.request(updateItem("hoa_organizations", org.id, { folder: folder.id }));
  } catch (e) {
    console.warn("[add-property] folder creation failed:", e);
  }

  // 3. Caller becomes HOA Admin of the new property — so they can set it up.
  const roles = await directus.request(
    readRoles({ filter: { name: { _eq: "HOA Admin" } }, limit: 1 })
  );
  const hoaAdminRoleId = roles?.[0]?.id;
  if (!hoaAdminRoleId) {
    throw createError({
      statusCode: 500,
      message: "The HOA Admin role is missing, so this property cannot be given an administrator.",
    });
  }

  await directus.request(
    createItem("hoa_members", {
      user: userId,
      organization: org.id,
      role: hoaAdminRoleId,
      email: userEmail,
      member_type: "owner",
      status: "active",
    })
  );

  // 3b. …and the community gets its own administrator, invited now rather than
  // hoped for later. The invitation is the deliverable: they become a member
  // when they accept, and until then the org's roster shows the agency alone —
  // which is exactly what the wizard tells an admin when it refuses to run.
  //
  // A failed invite does NOT fail the property. The org, the folder and the
  // seat are already written and there is no transaction across them; throwing
  // here would leave a half-made property behind and the agency would create a
  // second one. The failure is reported in the response instead.
  let boardAdminInvite: { email: string; sent: boolean; error?: string } = {
    email: boardAdminEmail,
    sent: false,
  };
  try {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    await directus.request(
      createItem("hoa_invitations", {
        email: boardAdminEmail,
        organization: org.id,
        role: hoaAdminRoleId,
        invited_by: userId,
        token,
        invitation_status: "pending",
        expires_at: expiresAt.toISOString(),
      })
    );

    const appUrl = useRuntimeConfig().public.appUrl;
    await sendHoaInvitationEmail({
      to: boardAdminEmail,
      firstName: boardAdmin.firstName,
      lastName: boardAdmin.lastName,
      organizationName: name,
      invitationUrl: `${appUrl}/${slug}/accept-invite?token=${token}`,
      inviterName: userEmail || "Your management company",
      roleName: "HOA Admin",
      expiresAt: expiresAt.toISOString(),
      orgUrl: `${appUrl}/${slug}`,
    });
    boardAdminInvite = { email: boardAdminEmail, sent: true };
  } catch (e: any) {
    console.error("[add-property] board admin invitation failed:", e);
    boardAdminInvite = {
      email: boardAdminEmail,
      sent: false,
      error: e?.message || "The invitation could not be sent.",
    };
  }

  // 4. Bump seats (Stripe prorates up).
  const seats = await syncBillingAccountSeats(accountId);

  return {
    success: true,
    organization: { id: org.id, name: org.name, slug: org.slug },
    seats: seats.seats,
    boardAdminInvite,
  };
});
