import {
  createUser,
  createItem,
  readRoles,
  authentication,
  rest,
} from "@directus/sdk";
import { createDirectus } from "@directus/sdk";
import { sendWelcomeEmail } from "../../utils/sendgrid";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const {
    // Organization details
    organizationName,
    organizationAddress,
    subscriptionPlanId, // Optional for BETA

    // Admin user details
    email,
    password,
    firstName,
    lastName,
    phone,
  } = body;

  // Validation
  if (!organizationName || !email || !password || !firstName || !lastName) {
    throw createError({
      statusCode: 400,
      message: "Missing required fields",
    });
  }

  try {
    const directus = await getAdminDirectus();
    const config = useRuntimeConfig();

    // 1. Create the organization
    const organization = await directus.request(
      createItem("hoa_organizations", {
        name: organizationName,
        street_address: organizationAddress,
        subscription_plan: subscriptionPlanId || null,
        status: "published",
      })
    );

    // 2. Get the "HOA Admin" role UUID
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

    // 3. Create the Directus user (admin for this HOA)
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

    // 4. Create the hoa_member record with personal info
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
        status: "published",
      })
    );

    // 5. Automatically log the user in
    const authClient = createDirectus(config.directus.url)
      .with(authentication())
      .with(rest());

    const authResult = await authClient.login(email, password);

    // Set user session
    await setUserSession(event, {
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        role: hoaAdminRoleId,
        provider: "local",
      },
      loggedInAt: Date.now(),
      expiresAt: Date.now() + (authResult.expires || 900000), // Default 15 min
    });

    // 6. Send welcome email via SendGrid
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
