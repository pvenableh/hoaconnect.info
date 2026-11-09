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
import { isContactOnly } from "#core/shared/billing/bands";

// Well past any real community, and inside a Postgres integer.
const MAX_DECLARED_UNITS = 1_000_000;

// A new org always starts in `trial` with no Stripe ids: the webhook moves it to
// `active` once POST /api/stripe/subscribe-band has been paid. Nothing the client
// sends can set its status, its plan or its Stripe ids. The plan comes from the
// declared unit count, on the same band ladder the charge route uses.
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

    // Subscription details
    billingCycle,
    declaredUnits,

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

  const units = Number(declaredUnits);
  if (!Number.isInteger(units) || units < 1 || units > MAX_DECLARED_UNITS) {
    throw createError({
      statusCode: 400,
      message: "Enter how many units your community has",
    });
  }

  // These refusals sit outside the try below, which turns everything into a 400.
  const band = await selectBandForUnits(units);
  if (!band) {
    throw createError({
      statusCode: 503,
      message: "No subscription plans are available right now. Please try again later.",
    });
  }
  if (isContactOnly(band)) {
    throw createError({
      statusCode: 409,
      message: "Communities of this size are set up with our team. Talk to us and we'll get you started.",
    });
  }

  // This can't be worked around: the charge is a separate request that learns the
  // declared count only from this column, and a new org has no real units. Without
  // it every new building would be billed at the smallest band, so refuse before
  // anything is created.
  if (!(await hasDeclaredUnitsField())) {
    throw createError({
      statusCode: 503,
      message: "Signup is unavailable: hoa_organizations.declared_units is missing. Run pnpm add:declared-units.",
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

    // 1. Create the organization on its band
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
        subscription_plan: band.id,
        declared_units: units,
        status: "active",
        billing_cycle: billingCycle || "monthly",
        subscription_status: "trial",
        // New orgs default to the paid/trial track. Mark an org is_free_account
        // manually (in Directus) to comp it — that also flips its AI metering to
        // at-cost ("Hue") pricing via marginForAccount() in chargeForCompletion.
        is_free_account: false,
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

    const hoaAdminRole = roles?.[0];
    if (!hoaAdminRole) {
      throw createError({
        statusCode: 500,
        message:
          "HOA Admin role not found. Please create it in Directus first.",
      });
    }

    const hoaAdminRoleId = hoaAdminRole.id;

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

          // mode:"json" so the refresh token is returned in the body (SDK default
          // is "cookie", which omits it → the session can't refresh). See login.post.ts.
          authResult = await loginClient.request(login({ email, password }, { mode: "json" }));

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
        subscriptionStatus: "trial",
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
