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

    // Subscription details (from Stripe)
    billingCycle,
    stripeSubscriptionId,
    stripeCustomerId,
    subscriptionStatus,
    trialEndsAt,

    // Admin user details (not required if isLoggedIn)
    email,
    password,
    firstName,
    lastName,
    phone,

    // Flag for logged-in user flow
    isLoggedIn,
  } = body;

  // Get current session for logged-in user flow
  const session = await getUserSession(event);

  // Validation - different requirements for logged-in vs guest
  if (!organizationName || !slug) {
    throw createError({
      statusCode: 400,
      message: "Missing required organization fields",
    });
  }

  // Guest flow requires user details
  if (!isLoggedIn && (!email || !password || !firstName || !lastName)) {
    throw createError({
      statusCode: 400,
      message: "Missing required user fields",
    });
  }

  // Logged-in flow requires valid session
  if (isLoggedIn && !session?.user?.id) {
    throw createError({
      statusCode: 401,
      message: "You must be logged in to create an additional organization",
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

    // Determine subscription status based on trial
    const orgSubscriptionStatus = trialEndsAt ? "trial" : (subscriptionStatus === "active" ? "active" : "trial");

    // 1. Create the organization with subscription details
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
        // Subscription details from Stripe
        billing_cycle: billingCycle || "monthly",
        stripe_customer_id: stripeCustomerId || null,
        stripe_subscription_id: stripeSubscriptionId || null,
        subscription_status: orgSubscriptionStatus,
        trial_ends_at: trialEndsAt || null,
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

    let userId: string;
    let userEmail: string;
    let userFirstName: string;
    let userLastName: string;
    let hoaMember: any;

    if (isLoggedIn && session?.user) {
      // LOGGED-IN USER FLOW: Use existing user from session
      userId = session.user.id;
      userEmail = session.user.email || "";
      userFirstName = session.user.firstName || "";
      userLastName = session.user.lastName || "";

      // 5. Create the hoa_member record linking existing user to new org
      hoaMember = await directus.request(
        createItem("hoa_members", {
          user: userId,
          organization: organization.id,
          role: hoaAdminRoleId,
          first_name: userFirstName,
          last_name: userLastName,
          email: userEmail,
          phone: phone || null,
          member_type: "owner",
          status: "active",
        })
      );

      console.log("Linked existing user to new organization:", userId);

      // Update the session to include the new organization
      // Note: User can now have multiple organizations
      await setUserSession(event, {
        ...session,
        user: {
          ...session.user,
          organizationId: organization.id, // Set to new org
        },
      });

    } else {
      // GUEST USER FLOW: Create new user and log them in

      // 5. Create the Directus user (admin for this HOA)
      const newUser = await directus.request(
        createUser({
          email,
          password,
          first_name: firstName,
          last_name: lastName,
          role: hoaAdminRoleId,
          status: "active",
        })
      );

      userId = newUser.id;
      userEmail = newUser.email || email;
      userFirstName = firstName;
      userLastName = lastName;

      // 6. Create the hoa_member record with personal info
      hoaMember = await directus.request(
        createItem("hoa_members", {
          user: userId,
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
      console.log("User created successfully:", userId);
      console.log("Attempting login with email:", email);
      console.log("Directus URL:", config.directus.url);

      // Retry login with exponential backoff to handle Directus propagation delay
      const loginClient = createDirectus(config.directus.url).with(rest());
      let authResult: any = null;
      let lastError: any = null;
      const maxRetries = 5;
      const delays = [500, 1000, 2000, 3000, 5000]; // Increasing delays in ms

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          console.log(`Login attempt ${attempt + 1}/${maxRetries}...`);

          // Wait before each attempt (including first, to let user propagate)
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));

          authResult = await loginClient.request(login({ email, password }));

          console.log("Login response received:", {
            hasAccessToken: !!authResult?.access_token,
            hasRefreshToken: !!authResult?.refresh_token,
            expires: authResult?.expires,
          });

          // Only require access_token - refresh_token is optional in JSON mode
          if (authResult?.access_token) {
            console.log(`Login successful on attempt ${attempt + 1}`);
            break;
          }

          lastError = new Error("No access token in response");
        } catch (err: any) {
          lastError = err;
          console.log(`Login attempt ${attempt + 1} failed:`, err.message || err);

          // If it's the last attempt, we'll throw after the loop
          if (attempt < maxRetries - 1) {
            console.log(`Retrying in ${delays[attempt + 1]}ms...`);
          }
        }
      }

      // Only require access_token - refresh_token is optional in JSON mode
      if (!authResult?.access_token) {
        console.error("All login attempts failed. Last error:", lastError);
        throw createError({
          statusCode: 500,
          message: `Authentication failed after ${maxRetries} attempts - ${lastError?.message || "no access token returned"}`,
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
        expiresAt: Date.now() + (authResult.expires || 900) * 1000,
        secure: {
          directusAccessToken: authResult.access_token,
          directusRefreshToken: authResult.refresh_token,
        },
      });

      // Send welcome email via SendGrid (only for new users)
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
    }

    return {
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        subscriptionStatus: orgSubscriptionStatus,
        trialEndsAt: trialEndsAt || null,
      },
      user: {
        id: userId,
        email: userEmail,
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
