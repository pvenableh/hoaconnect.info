// server/api/auth/oauth/google/callback.get.ts
import type { SessionUser } from "~/types/directus-schema";

export default oauth.googleEventHandler({
  async onSuccess(event, { user: googleUser }) {
    try {
      // Check if user exists in Directus by email
      const existingUsers = await directusServer.request(
        readUsers({
          filter: {
            email: { _eq: googleUser.email },
          },
          fields: ["id", "email", "first_name", "last_name", "provider"],
        })
      );

      let directusUserId;

      if (existingUsers.length > 0) {
        // User exists, update their info if needed
        directusUserId = existingUsers[0].id;

        // Update user info if changed
        await directusServer.request(
          updateUser(directusUserId, {
            first_name: googleUser.given_name || existingUsers[0].first_name,
            last_name: googleUser.family_name || existingUsers[0].last_name,
            provider: "google",
          })
        );
      } else {
        // Create new user in Directus
        const newUser = await directusServer.request(
          createUser({
            email: googleUser.email,
            first_name: googleUser.given_name || "",
            last_name: googleUser.family_name || "",
            provider: "google",
            status: "active",
            role: process.env.DEFAULT_USER_ROLE_ID, // Set your default role UUID
          })
        );
        directusUserId = newUser.id;
      }

      // Get the full user details with role
      const userData = await directusServer.request(
        readUser(directusUserId, {
          fields: [
            "id",
            "email",
            "first_name",
            "last_name",
            "role.id",
            "role.name",
            "role.admin_access",
          ],
        })
      );

      // Check for HOA member association
      const member = await directusServer.request(
        readItems("hoa_members", {
          filter: {
            user: { _eq: directusUserId },
          },
          fields: ["id", "organization", "role"],
        })
      );

      // Set session
      const sessionUser: SessionUser = {
        id: userData.id as string,
        email: userData.email as string,
        first_name: userData.first_name || null,
        last_name: userData.last_name || null,
        avatar: null,
        role: userData.role || null,
        organization: member[0]?.organization || null,
        member: member[0] || null,
      };

      await setUserSession(event, {
        user: sessionUser,
        directusUserId,
      });

      return sendRedirect(event, "/dashboard");
    } catch (error) {
      console.error("OAuth callback error:", error);
      return sendRedirect(event, "/auth/login?error=oauth_failed");
    }
  },
  onError(event, error) {
    console.error("Google OAuth error:", error);
    return sendRedirect(event, "/auth/login?error=oauth_failed");
  },
});
