# HOA Authentication Hook

Directus extension hook that integrates with native OAuth to provide HOA-specific functionality.

## Features

- ✅ Automatic profile creation for new OAuth users
- ✅ Google OAuth provider data storage
- ✅ Login event logging and monitoring
- ✅ Integration with native Directus authentication
- ⏳ HOA member association (requires organization context)

## Installation

### For Self-Hosted Directus

This hook is designed for **self-hosted Directus instances** and requires access to the extensions directory.

#### Option 1: Copy to Directus Extensions Folder

1. Copy this directory to your Directus extensions folder:
   ```bash
   cp -r extensions/hooks/hoa-auth /path/to/directus/extensions/hooks/
   ```

2. Restart Directus:
   ```bash
   # Docker
   docker-compose restart directus

   # PM2
   pm2 restart directus

   # Systemd
   systemctl restart directus
   ```

3. Verify the hook is loaded by checking Directus logs:
   ```
   HOA Auth Hook: Initialized successfully
   ```

#### Option 2: Symlink for Development

For easier development, create a symlink:

```bash
ln -s $(pwd)/extensions/hooks/hoa-auth /path/to/directus/extensions/hooks/hoa-auth
```

### For Docker Deployments

If running Directus in Docker, mount the extensions directory:

```yaml
# docker-compose.yml
services:
  directus:
    image: directus/directus:latest
    volumes:
      - ./extensions:/directus/extensions
```

Then restart the container.

## Configuration

### 1. Configure Native OAuth

Add these environment variables to your Directus instance (not the Nuxt app):

```env
# Google OAuth
AUTH_PROVIDERS=google
AUTH_GOOGLE_DRIVER=openid
AUTH_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
AUTH_GOOGLE_CLIENT_SECRET=your-client-secret
AUTH_GOOGLE_ISSUER_URL=https://accounts.google.com
AUTH_GOOGLE_IDENTIFIER_KEY=email
AUTH_GOOGLE_ALLOW_PUBLIC_REGISTRATION=true
AUTH_GOOGLE_DEFAULT_ROLE_ID=uuid-of-default-role
```

### 2. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Add authorized redirect URI:
   ```
   https://admin.605lincolnroad.com/auth/login/google/callback
   ```
6. Copy Client ID and Client Secret to Directus environment variables

### 3. Set Default Role

Get the UUID of the role you want to assign to new OAuth users:

```sql
-- In Directus database
SELECT id, name FROM directus_roles;
```

Use the UUID in `AUTH_GOOGLE_DEFAULT_ROLE_ID`.

## Hook Events

### auth.login (Action)

**Triggered:** After successful authentication
**Purpose:** Associate user with HOA organization

```javascript
action('auth.login', async ({ accountability }) => {
  // Check if user has HOA member record
  // Log login event for monitoring
})
```

### items.create (Action) - directus_users

**Triggered:** When new user is created (including OAuth)
**Purpose:** Create profile and prepare for HOA membership

```javascript
action('items.create', async ({ collection, key }) => {
  // Create user profile
  // Store OAuth provider data
  // Prepare for HOA member association
})
```

### auth.login (Filter)

**Triggered:** Before login completes
**Purpose:** Validation and logging

```javascript
filter('auth.login', async (payload) => {
  // Log login attempts
  // Can add custom validation here
  return payload
})
```

## Logging

The hook logs important events to Directus logs:

```
HOA Auth Hook: Initialized successfully
HOA Auth Hook: User {uuid} logged in
HOA Auth Hook: New user created: {uuid}
HOA Auth Hook: Created profile for user {uuid}
HOA Auth Hook: User {uuid} setup completed
```

Check Directus logs to verify hook is working:

```bash
# Docker
docker-compose logs -f directus | grep "HOA Auth"

# PM2
pm2 logs directus | grep "HOA Auth"

# File logs
tail -f /var/log/directus/directus.log | grep "HOA Auth"
```

## Database Schema Requirements

The hook expects these collections to exist:

### profiles
- `user_id` (UUID, Many-to-One to directus_users)
- `display_name` (String)
- `google_id` (String, nullable)
- `google_profile` (JSON, nullable)
- `status` (String)

### hoa_members
- `user` (UUID, Many-to-One to directus_users)
- `organization` (UUID, Many-to-One to hoa_organizations)
- `role` (UUID, Many-to-One to directus_roles)
- `status` (String)

### hoa_organizations
- `name` (String)
- `slug` (String)
- `status` (String)

## Migration from Custom OAuth

### Current Setup
- Custom OAuth callback: `/server/api/auth/oauth/google/callback.get.ts`
- Manual user creation and session handling
- HOA member association in custom endpoint

### Migration Steps

1. **Phase 1: Deploy Hook**
   - Copy hook to Directus extensions
   - Configure native OAuth environment variables
   - Restart Directus
   - **Keep** custom endpoints active

2. **Phase 2: Test Native OAuth**
   - Test login via native Directus OAuth
   - Verify profile creation
   - Check Directus logs for hook events
   - Ensure no errors

3. **Phase 3: Parallel Operation**
   - Run both custom and native OAuth
   - Monitor both flows
   - Compare user experience
   - Fix any issues with hooks

4. **Phase 4: Switch Over**
   - Update app login button to use native OAuth
   - Redirect users to `/auth/login/google` instead of custom endpoint
   - Monitor for issues

5. **Phase 5: Cleanup**
   - Remove custom OAuth callback endpoint
   - Clean up custom session handling code
   - Update documentation

## Limitations & Notes

### Organization Context

The hook currently does **NOT** automatically assign users to HOA organizations because:

1. Organization context isn't available during OAuth login
2. Users might belong to multiple organizations
3. Invitation flow is still the primary way to join organizations

**Recommendation:** Keep the invitation system for HOA member onboarding.

### HOA Member Creation

For now, HOA members are still created via:
- Invitation acceptance flow
- Admin manual assignment
- Organization setup process

**Future Enhancement:** Could add organization selection page after OAuth login.

## Troubleshooting

### Hook Not Loading

**Check Directus logs for errors:**
```bash
docker-compose logs directus | grep -i error
```

**Common issues:**
- Package.json missing or invalid
- Syntax error in index.js
- Extensions directory not mounted (Docker)
- Directus version incompatibility

### OAuth Not Working

**Check:**
1. Environment variables set correctly
2. Google OAuth credentials valid
3. Redirect URI matches exactly
4. Default role UUID exists
5. Public registration enabled

**Test native OAuth directly:**
```
https://admin.605lincolnroad.com/auth/login/google
```

### Profile Not Created

**Check:**
1. `profiles` collection exists
2. Hook has admin permissions
3. Directus logs for errors
4. User ID is valid UUID

## Development

### Testing the Hook

```javascript
// Test auth.login hook
// Login via Directus admin panel or OAuth

// Test items.create hook
// Create new user via Directus UI

// Check Directus logs
docker-compose logs -f directus | grep "HOA Auth"
```

### Debugging

Add more logging to index.js:

```javascript
logger.info('Debug: User data', { user });
logger.error('Error details', { error: error.message, stack: error.stack });
```

## Security Considerations

1. **Admin Accountability:** Hook uses `{ admin: true }` for database operations
   - Only runs on server-side
   - No user input validation needed
   - Directus handles authentication

2. **Error Handling:** Hook catches errors and doesn't throw
   - Prevents authentication flow from breaking
   - Logs errors for monitoring
   - Graceful degradation

3. **OAuth Security:** Uses Directus native OAuth
   - Vetted by Directus team
   - Regular security updates
   - Industry-standard implementation

## Support

For issues with this hook:

1. Check Directus logs first
2. Verify environment variables
3. Test native OAuth without hook
4. Review this README
5. Check Directus documentation: https://docs.directus.io/extensions/hooks

## Version History

- **1.0.0** (2025-11-15)
  - Initial implementation
  - auth.login hook for monitoring
  - items.create hook for profile creation
  - Google OAuth provider support
  - Comprehensive logging
