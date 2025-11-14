# Fixing 401 Permissions Error

## Problem
Users are experiencing a 401 (Unauthorized) error when trying to add units, and data is not loading properly on dashboard refresh.

## Root Cause
The user's role in Directus does not have the proper permissions to:
1. CREATE items in the `hoa_units` collection
2. READ/UPDATE/DELETE items in the `hoa_units` collection with proper organization filtering

## Solution

### Step 1: Run the Permissions Fix Script

A script has been created to automatically configure the proper permissions in Directus for HOA roles.

```bash
npx tsx scripts/fix-permissions.ts
```

This script will:
- Find all HOA Admin and HOA Member roles
- Set up proper permissions for each role on all HOA collections
- Configure organization-based filtering so users can only see/manage items in their own organization
- Grant the following permissions:
  - **HOA Admin**: Full CRUD access (Create, Read, Update, Delete) on all HOA collections
  - **HOA Member**: Read access on most collections, with admin-only access for sensitive operations

### Step 2: Verify Permissions

After running the script:

1. Refresh the dashboard page
2. You should see a "Permissions Diagnostic" section that shows your current permissions
3. All permissions should show green checkmarks (✅)

### Step 3: Test the Fix

Try to add a unit:
1. Navigate to the Units page
2. Click "Add Unit"
3. Enter a unit number
4. Submit the form

You should now be able to create units without getting a 401 error.

## What the Script Does

The script configures the following permissions for each role:

### Collections Affected
- `hoa_units` - Unit/apartment records
- `hoa_members` - Member records
- `hoa_organizations` - Organization records
- `hoa_documents` - Document records
- `hoa_invitations` - Invitation records

### Permission Filters
All permissions are configured with organization-based filtering:

```javascript
{
  organization: {
    _in: "$CURRENT_USER.hoa_members.organization"
  }
}
```

This ensures that users can only:
- View items in organizations they are a member of
- Create items for their organizations
- Update/delete items only in their organizations

## Troubleshooting

### Script Fails to Connect
If the script cannot connect to Directus:
1. Verify your `.env` file has the correct values:
   - `DIRECTUS_URL` - Should point to your Directus instance
   - `DIRECTUS_STATIC_TOKEN` - Should be a valid admin token
2. Make sure the Directus instance is running and accessible

### Permissions Still Not Working
If permissions still don't work after running the script:
1. Check the dashboard's "Permissions Diagnostic" section
2. Verify your role is "HOA Admin" or "HOA Member"
3. Check that you have a `hoa_members` record linking you to an organization
4. Verify in Directus admin panel that the permissions were created correctly

### Dashboard Data Not Loading
If data is not loading on dashboard refresh:
1. Clear your browser cache
2. Log out and log back in
3. Check the browser console for any errors
4. Verify your session is valid

## Manual Configuration (Alternative)

If you prefer to configure permissions manually in Directus:

1. Log in to Directus admin panel
2. Go to Settings → Roles & Permissions
3. Select the "HOA Admin" or "HOA Member" role
4. For each collection (`hoa_units`, `hoa_members`, etc.):
   - Enable READ permission with filter: `{"organization":{"_in":"$CURRENT_USER.hoa_members.organization"}}`
   - Enable CREATE permission with validation: `{"organization":{"_in":"$CURRENT_USER.hoa_members.organization"}}`
   - Enable UPDATE permission with filter: `{"organization":{"_in":"$CURRENT_USER.hoa_members.organization"}}`
   - Enable DELETE permission with filter: `{"organization":{"_in":"$CURRENT_USER.hoa_members.organization"}}`

## Additional Notes

### About Organization Filtering
The organization filtering uses a special Directus syntax that:
1. Gets the current authenticated user
2. Finds all `hoa_members` records where the user is linked
3. Extracts the organization IDs from those records
4. Filters items to only show those with matching organization IDs

This allows users to be members of multiple organizations (useful for property managers) while keeping data isolated between organizations.

### Security Considerations
- The `DIRECTUS_STATIC_TOKEN` should never be exposed to the frontend
- Only use the static token for server-side operations
- Users authenticate with their own credentials and get scoped access based on their role
- Organization filtering is enforced at the database level by Directus

## Support
If you continue to experience issues after following these steps, please check:
1. The browser console for errors
2. The Directus logs for authentication errors
3. The network tab to see the actual API requests and responses
