import {
  createUser,
  createItem,
  readItems,
  readRoles,
  updateItem,
  rest,
  createFolder,
  login,
  staticToken,
  readMe,
} from "@directus/sdk";
import { createDirectus } from "@directus/sdk";
import { sendWelcomeEmail } from "../../utils/sendgrid";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const {
    // Organization details
    organizationName,
    street_address,
    city,
    state,
    zip,
    org_phone,
    org_email,
    slug,
    subscriptionPlanId, // Optional for BETA

    // Admin user details
    email,
    password,
    firstName,
    lastName,
    phone,
  } = body;

  // Validation
  if (
    !organizationName ||
    !slug ||
    !email ||
    !password ||
    !firstName ||
    !lastName
  ) {
    throw createError({
      statusCode: 400,
      message: "Missing required fields",
    });
  }

  // Validate slug format
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(slug)) {
    throw createError({
      statusCode: 400,
      message:
        "Invalid slug format. Use only lowercase letters, numbers, and hyphens",
    });
  }

  try {
    const config = useRuntimeConfig();
    const directus = getTypedDirectus();

    // Check if slug already exists
    const existingOrgs = await directus.request(
      readItems("hoa_organizations", {
        filter: {
          slug: { _eq: slug },
        },
        fields: ["id"],
        limit: 1,
      })
    );

    if (existingOrgs && existingOrgs.length > 0) {
      throw createError({
        statusCode: 400,
        message: "This slug is already taken. Please choose a different one.",
      });
    }

    // 1. Create the organization
    const organization = await directus.request(
      createItem("hoa_organizations", {
        name: organizationName,
        slug: slug,
        street_address: street_address,
        city: city,
        state: state,
        zip: zip,
        phone: org_phone,
        email: org_email,
        subscription_plan: subscriptionPlanId || null,
        status: "active",
      })
    );

    // 2. Create a default folder for the organization
    const defaultFolder = await directus.request(
      createFolder({
        name: organizationName,
      })
    );

    // 3. Update organization with the folder reference
    await directus.request(
      updateItem("hoa_organizations", organization.id, {
        folder: defaultFolder.id,
      })
    );

    // 4. Get the "HOA Admin" role UUID
    const roles = await directus.request(
      readRoles({
        filter: {
          name: { _eq: "HOA Admin" },
        },
        limit: 1,
      })
    );

    if (!roles || roles.length === 0) {
      throw createError({
        statusCode: 500,
        message:
          "HOA Admin role not found. Please create it in Directus first.",
      });
    }

    const hoaAdminRoleId = roles[0].id;

    // 5. Create the Directus user (admin for this HOA)
    const newUser = await directus.request(
      createUser({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        role: hoaAdminRoleId,
        status: "active",
        provider: "local",
      })
    );

    // 6. Create the hoa_member record with personal info
    const hoaMember = await directus.request(
      createItem("hoa_members", {
        user: newUser.id,
        organization: organization.id,
        role: hoaAdminRoleId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        member_type: "owner",
        status: "active",
      })
    );

    // 7. Automatically log the user in (using same pattern as login.post.ts)
    const loginClient = createDirectus(config.directus.url).with(rest());

    const authResult = await loginClient.request(login({ email, password }));

    if (!authResult.access_token || !authResult.refresh_token) {
      throw createError({
        statusCode: 500,
        message: "Authentication failed - no tokens returned",
      });
    }

    // Create an authenticated client to fetch user data
    const authClient = createDirectus(config.directus.url)
      .with(staticToken(authResult.access_token))
      .with(rest());

    // Fetch user data to ensure we have complete info
    const userData = await authClient.request(
      readMe({
        fields: ["*", "role"],
      })
    );

    // Set user session with Directus tokens (matching login.post.ts structure)
    await setUserSession(event, {
      user: {
        id: userData.id as string,
        email: userData.email as string,
        firstName: userData.first_name || undefined,
        lastName: userData.last_name || undefined,
        role: userData.role || undefined,
        organizationId: organization.id,
        provider: "local",
      },
      loggedInAt: Date.now(),
      expiresAt: Date.now() + ((authResult.expires || 900) * 1000),
      secure: {
        directusAccessToken: authResult.access_token,
        directusRefreshToken: authResult.refresh_token,
      },
    });

    // 8. Send welcome email via SendGrid
    try {
      await sendWelcomeEmail({
        to: email,
        firstName,
        lastName,
        organizationName,
        loginUrl: `${config.public.appUrl}/dashboard`,
      });

      console.log("✅ Welcome email sent successfully to:", email);
    } catch (emailError: any) {
      console.error("❌ Failed to send welcome email:", emailError);
      // Don't fail the whole request if email fails
    }

    return {
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
      },
      user: {
        id: newUser.id,
        email: newUser.email,
      },
      member: {
        id: hoaMember.id,
      },
    };
  } catch (error: any) {
    console.error("Organization setup error:", error);
    throw createError({
      statusCode: 400,
      message: error.message || "Failed to set up organization",
    });
  }
});
