// POST /api/billing-account/add-property
// Agency billing P3 (docs/plan-agency-multi-property-billing.md §8-§9.1): spin up
// a new property org already attached to the billing account, with the caller
// as its HOA Admin. No own Stripe subscription — entitlement resolves up to the
// account. Bumps the account's seat count (Stripe prorates up). Owner /
// billing_admin only.
import { z } from "zod";
import { createItem, createFolder, readItems, readRoles, updateItem } from "@directus/sdk";

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
});

export default defineEventHandler(async (event) => {
  const parsed = schema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: parsed.error.errors.map((e) => e.message).join(", "),
    });
  }
  const { accountId, name, slug, street_address, city, state, zip, phone, email } = parsed.data;

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

  // 3. Caller becomes HOA Admin of the new property.
  const roles = await directus.request(
    readRoles({ filter: { name: { _eq: "HOA Admin" } }, limit: 1 })
  );
  const hoaAdminRoleId = roles?.[0]?.id;
  if (hoaAdminRoleId) {
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
  }

  // 4. Bump seats (Stripe prorates up).
  const seats = await syncBillingAccountSeats(accountId);

  return {
    success: true,
    organization: { id: org.id, name: org.name, slug: org.slug },
    seats: seats.seats,
  };
});
