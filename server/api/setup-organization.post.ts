import { createUser, createItem } from "@directus/sdk";
import { getAdminDirectus } from "../../utils/directus";
import { sendWelcomeEmail } from "../../utils/sendgrid";
import { randomBytes } from "crypto";

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
        address: organizationAddress,
        subscription_plan: subscriptionPlanId || null,
        status: "published",
      })
    );

    // 2. Get the "HOA Admin" role UUID (you need to create this role first or use existing)
    // For now, we'll use a placeholder - you'll need to replace this with actual role UUID
    const hoaAdminRoleId = "YOUR_HOA_ADMIN_ROLE_UUID"; // TODO: Replace with actual UUID

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

    // 4. Create the hoa_member record linking user to organization
    const hoaMember = await directus.request(
      createItem("hoa_members", {
        user: newUser.id,
        organization: organization.id,
        role: hoaAdminRoleId,
        status: "published",
      })
    );

    // 5. Create hoa_person record
    const hoaPerson = await directus.request(
      createItem("hoa_people", {
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        organization: organization.id,
        type: "owner",
        status: "published",
      })
    );

    // 6. Automatically log the user in
    const authResult = await directus.login({ email, password });

    // Set user session
    await setUserSession(
      event,
      {
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.first_name,
          lastName: newUser.last_name,
          role: hoaAdminRoleId,
          provider: "local",
        },
        loggedInAt: Date.now(),
        expiresAt: Date.now() + authResult.expires * 1000,
      },
      {
        secure: {
          directusAccessToken: authResult.access_token,
          directusRefreshToken: authResult.refresh_token,
        },
      }
    );

    // 7. Send welcome email via SendGrid
    try {
      await sendWelcomeEmail({
        to: email,
        firstName,
        organizationName,
        dashboardUrl: `${config.public.appUrl}/dashboard`,
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
    };
  } catch (error: any) {
    console.error("Organization setup error:", error);
    throw createError({
      statusCode: 400,
      message: error.message || "Failed to set up organization",
    });
  }
});
