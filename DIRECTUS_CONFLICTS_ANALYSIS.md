# Directus Native Features Conflict Analysis

**Date:** 2025-11-15
**Updated:** 2025-11-15 (Implementing Hybrid OAuth with Hooks)
**Branch:** claude/check-directus-conflicts-01VHdEoMX33Uaj8HwmoZQwt8

## ✅ IMPORTANT: Self-Hosted Directus Advantage

**This project uses self-hosted Directus** (`https://admin.605lincolnroad.com`), which enables:

> ✅ **Custom hooks and extensions ARE fully supported**

This means:
- The "hybrid OAuth approach" **CAN be implemented** with Directus hooks
- Custom authentication hooks can be created in `/extensions/hooks`
- We can leverage native OAuth while maintaining HOA-specific logic
- **Status:** Implementing hooks-based approach

---

## Executive Summary

This analysis identifies **significant overlaps and potential conflicts** between the custom implementation and Directus's native functionality in three key areas:

1. **Authentication (SSO/OAuth)** - ⚠️ Moderate Conflict → **MIGRATING to Hybrid Approach** (Native OAuth + Custom Hooks)
2. **Activity Collection** - ✅ **COMPLETED** - Now using native `directus_activity`
3. **User Invitations** - 🔴 **Major Conflict BUT Justified** (Complete reimplementation of native feature)

---

## 1. Authentication & SSO/OAuth

### Directus Native Capabilities

**Built-in Features:**
- Native SSO/OAuth support for Google, GitHub, Facebook, Azure, etc.
- Configuration via environment variables (no code required)
- Automatic user provisioning on first OAuth login
- Standard endpoints: `/auth/login/{provider}`, `/auth/callback`
- Built-in session and token management
- Support for OpenID Connect (OIDC), OAuth 2.0, SAML, LDAP

**Configuration Example:**
```env
AUTH_PROVIDERS=google
AUTH_GOOGLE_DRIVER=openid
AUTH_GOOGLE_CLIENT_ID=your-client-id
AUTH_GOOGLE_CLIENT_SECRET=your-client-secret
AUTH_GOOGLE_ISSUER_URL=https://accounts.google.com
AUTH_GOOGLE_ALLOW_PUBLIC_REGISTRATION=true
AUTH_GOOGLE_DEFAULT_ROLE_ID=role-uuid
```

### Current Custom Implementation

**Location:** `/server/api/auth/oauth/google/callback.get.ts`

**Custom Logic:**
```typescript
- Manual OAuth callback handling
- Custom user creation/update logic
- Custom session management (HTTP-only cookies)
- HOA member association queries
- Organization context setting
- Custom redirect to /dashboard
```

**Additional Features Not in Native:**
- Automatic HOA member lookup after OAuth login
- Organization context persistence in cookies
- Custom profile field mapping
- Integration with multi-tenant HOA system

### Conflict Analysis

**⚠️ Moderate Conflict**

| Aspect | Native Directus | Custom Implementation | Conflict? |
|--------|----------------|----------------------|-----------|
| OAuth flow | Built-in providers | Custom callback endpoint | ✅ Yes - bypasses native |
| User creation | Automatic | Manual via createTypedDirectusItem | ✅ Yes - duplicate logic |
| Session management | Built-in tokens | Custom HTTP-only cookies | ⚠️ Partial - adds extra layer |
| Role assignment | ENV default role | Dynamic role assignment | ⚠️ Different approach |
| Profile creation | Single user record | User + profile record | ❌ No - custom feature |
| HOA member linking | N/A | Custom query & association | ❌ No - custom feature |

**Potential Issues:**

1. **Maintenance Burden:** Custom OAuth logic requires manual updates when Directus SDK changes
2. **Security Surface:** Custom session handling may introduce vulnerabilities if not maintained
3. **Feature Parity:** Missing Directus native features (2FA, LDAP, SAML, multiple providers)
4. **Testing Complexity:** Custom flow requires additional test coverage

**Benefits of Current Approach:**

1. ✅ Seamless HOA member association on OAuth login
2. ✅ Multi-tenant organization context automatically set
3. ✅ Custom redirect and user experience
4. ✅ Fine-grained control over user provisioning

### Recommendation

> ✅ **IMPLEMENTING:** Hybrid approach with Directus hooks (self-hosted enables this)

**✅ Option A: Hybrid Approach with Hooks (RECOMMENDED - IMPLEMENTING)**
- Use Directus native OAuth providers for authentication
- Add Directus hooks (`auth.login`, `items.create`) to handle HOA-specific logic
- Keep organization context middleware
- Gradually migrate away from custom OAuth endpoints
- **Benefits:**
  - ✅ Lower maintenance (Directus handles OAuth flow)
  - ✅ Better security (vetted by Directus team)
  - ✅ Automatic updates (SDK improvements)
  - ✅ Multi-provider support (Google, GitHub, LDAP, SAML)
  - ✅ Maintains HOA features (via hooks)
- **Implementation:** Creating hooks in `/extensions/hooks/hoa-auth/`

**Implementation Plan:**

1. **Create Directus Hooks** (`/extensions/hooks/hoa-auth/`)
   - `auth.login` hook - Associate user with HOA organization
   - `items.create` hook - Create profile and member records
   - Handle OAuth provider data (Google profile, etc.)

2. **Configure Native OAuth** (`.env`)
   - Add Google OAuth configuration
   - Set default role and permissions
   - Configure custom redirect URLs

3. **Gradual Migration**
   - Test hooks with native OAuth
   - Run both systems in parallel initially
   - Verify all HOA features work
   - Remove custom OAuth endpoints once validated

4. **Keep Custom Endpoints Temporarily**
   - Maintain current endpoints during migration
   - Use as fallback if hooks have issues
   - Remove after successful testing

---

## 2. Activity Collection & Tracking

### Directus Native Capabilities

**Built-in Features:**
- Automatic activity tracking in `directus_activity` system collection
- Tracks ALL database operations automatically (create, update, delete, login, comment)
- No code required - enabled by default
- Configurable per-collection via "accountability" setting

**Tracked Fields:**
```typescript
{
  id: number
  action: 'create' | 'update' | 'delete' | 'login' | 'comment' | ...
  user: UUID // FK to directus_users
  timestamp: datetime
  ip: string
  user_agent: string
  collection: string
  item: string // ID of affected item
  comment: string | null
  origin: string // URL origin
  revisions: FK[] // Related revision records
}
```

**API Access:**
- `GET /activity` - List all activities (with filters)
- `GET /activity/:id` - Get specific activity
- SDK: `readActivities()`, `readActivity()`

**Filtering Examples:**
```javascript
// Get all login activities
readActivities({
  filter: { action: { _eq: 'login' } }
})

// Get activities for specific user
readActivities({
  filter: { user: { _eq: user_id } }
})

// Get activities for specific collection
readActivities({
  filter: { collection: { _eq: 'hoa_members' } }
})
```

### Current Custom Implementation

**Location:** `/types/directus-schema.ts`

**Custom Schema (NOT IMPLEMENTED - ONLY DEFINED):**
```typescript
export interface ActivityLog {
  id: string
  user_id: string
  action: string
  collection: string
  item_id: string
  details: Record<string, any>
  ip_address: string
  user_agent: string
  context: {
    browser?: string
    os?: string
    device?: string
    location?: string
  }
  date_created: string
}
```

**Current Usage:**
- ❌ Schema defined but NO records are created
- ✅ Console logging only (invitations, emails, token checks)
- ❌ No API endpoints for activity_log
- ❌ No composables to read activity_log

**Console Logging Examples:**
```typescript
// Token middleware
console.log('⚠️ User attempting API call without valid Directus token')

// Invitation process
console.log('✅ Invitation email sent')
console.log('❌ Failed to send email:', error)

// Email notifications
console.log('Email sent:', response.status)
```

### Conflict Analysis

**✅ No Active Conflict**

| Aspect | Native Directus | Custom Implementation | Conflict? |
|--------|----------------|----------------------|-----------|
| Activity tracking | Automatic | Schema only (unused) | ❌ No - not active |
| Storage | directus_activity | activity_log (doesn't exist) | ❌ No - not created |
| API access | Built-in endpoints | None | ❌ No |
| Automatic logging | Yes (all operations) | No | ❌ No |

**Analysis:**

1. **No Duplication:** The custom `activity_log` schema is defined in TypeScript but never used
2. **Wasted Effort:** Custom schema definition serves no purpose if Directus native activity is available
3. **Opportunity:** Could remove custom schema and use native `directus_activity` collection
4. **Console Logs:** Current console logging could be replaced with proper activity queries

### Recommendation

**✅ COMPLETED - Custom Activity Schema Eliminated**

> **STATUS:** All action items have been completed. The project now uses Directus native activity tracking.

**Completed Action Items:**

1. ✅ **Removed** custom `ActivityLog` interface from `/types/directus-schema.ts`
2. ✅ **Removed** all references to `activity_log` collection
3. ✅ **Using** native `directus_activity` collection for all tracking
4. ✅ **Created** composable to query activities: `/composables/useActivityLog.ts`
5. ℹ️ **Console logging** kept for debugging (serves different purpose than activity tracking)

**Implemented Composable:**

Location: `/composables/useActivityLog.ts`

**Features:**
- `getRecentActivity(limit, collections?)` - Get recent activities
- `getUserActivity(userId, limit)` - Get activities for specific user
- `getCollectionActivity(collections, limit)` - Filter by collections
- `getActivityByAction(action, limit)` - Filter by action type
- `getItemActivity(collection, itemId)` - Get activities for specific item
- `getLoginActivity(limit)` - Security monitoring
- `getHOAActivity(limit)` - HOA-specific activities

**Usage Example:**
```typescript
const { getRecentActivity, getHOAActivity } = useActivityLog()

// Get recent HOA activities
const activities = await getHOAActivity(50)

// Get specific collection activities
const memberActivities = await getCollectionActivity(['hoa_members'])
```

**Benefits Achieved:**
- ✅ Zero maintenance (Directus handles tracking automatically)
- ✅ Automatic tracking (no manual logging code needed)
- ✅ Rich filtering and querying capabilities
- ✅ Revision tracking included
- ✅ Works with all Directus operations
- ✅ Type-safe composable with comprehensive methods

---

## 3. User Invitation & Token System

### Directus Native Capabilities

**Built-in Features:**
- `inviteUser()` SDK function sends invitation email with token
- Token automatically generated and managed by Directus
- `acceptUserInvite()` SDK function to complete invitation
- User created with status `invited` until accepted
- Custom invite URLs via `USER_INVITE_URL_ALLOW_LIST` environment variable
- Email templates configurable in Directus

**Native Flow:**

1. **Invite User:**
```typescript
await client.inviteUser(
  'user@example.com',
  'role-uuid',
  'https://yourapp.com/accept-invite' // Custom URL
)
```

2. **Directus Sends Email:**
   - Email contains: `https://yourapp.com/accept-invite?token={invite_token}`
   - Token stored in `directus_users` table

3. **Accept Invitation:**
```typescript
await client.acceptUserInvite(token, password)
```

4. **Result:**
   - User status changes from `invited` to `active`
   - User can now log in with email/password

**Configuration:**
```env
USER_INVITE_URL_ALLOW_LIST=https://yourapp.com
EMAIL_TRANSPORT=smtp
EMAIL_FROM=noreply@yourapp.com
```

### Current Custom Implementation

**Complete Custom System Across 3 Endpoints**

#### 1. Invite Member (`/server/api/hoa/invite-member.post.ts`)

**Custom Features:**
```typescript
- Creates record in custom `hoa_invitations` collection
- Generates 32-byte hex token via randomBytes()
- 7-day expiration
- Stores: email, organization, role, invited_by
- Sends custom SendGrid email template
- Does NOT create Directus user yet
```

**Data Structure:**
```typescript
{
  id: UUID
  email: string
  token: string // 32-byte hex
  organization: FK
  role: 'HOA Admin' | 'Board Member' | 'Homeowner'
  invited_by: FK to user
  status: 'pending' | 'accepted' | 'expired'
  expires_at: datetime // 7 days
  created_at: datetime
}
```

#### 2. Verify Invitation (`/server/api/hoa/verify-invitation.post.ts`)

**Custom Logic:**
```typescript
- Validates token exists in hoa_invitations
- Checks status is 'pending'
- Checks not expired
- Returns invitation details (email, org name, role)
- Does NOT expose sensitive fields
```

#### 3. Accept Invitation (`/server/api/hoa/accept-invitation.post.ts`)

**Complex Multi-Step Process:**
```typescript
1. Validate token and expiration
2. Verify organization exists
3. Check no duplicate user with email
4. CREATE Directus user with password
5. CREATE hoa_member record with personal info
6. UPDATE invitation status to 'accepted'
7. Auto-login user (set session tokens)
8. SEND notification email to inviter
```

**Creates TWO Records:**
```typescript
// 1. Directus User
createTypedDirectusItem('directus_users', {
  email,
  password,
  role: roleId,
  status: 'active',
  provider: 'default'
})

// 2. HOA Member
createTypedDirectusItem('hoa_members', {
  user_id,
  organization_id,
  role,
  first_name,
  last_name,
  phone,
  address,
  unit_number
})
```

### Conflict Analysis

**🔴 Major Conflict - Complete Feature Duplication**

| Aspect | Native Directus | Custom Implementation | Conflict? |
|--------|----------------|----------------------|-----------|
| Invitation storage | directus_users (invited status) | hoa_invitations table | 🔴 Yes - separate system |
| Token generation | Automatic (Directus) | Manual (randomBytes) | 🔴 Yes - duplicate logic |
| Token expiration | Configurable | Hardcoded 7 days | 🔴 Yes - different approach |
| Email sending | Directus email system | SendGrid custom templates | 🔴 Yes - different provider |
| User creation | On invite (status=invited) | On acceptance only | 🔴 Yes - different timing |
| Accept flow | acceptUserInvite() | Custom multi-step process | 🔴 Yes - complete reimplementation |
| Role assignment | On invite | On acceptance | ⚠️ Different timing |
| Additional data | N/A | HOA member record + personal info | ✅ Custom feature |
| Notifications | Basic email | Custom SendGrid templates + inviter notification | ⚠️ Enhanced feature |

**Why Custom System Was Built:**

The custom invitation system adds **significant HOA-specific functionality** that Directus native invitations don't support:

1. ✅ **Multi-tenant Organization Context:** Invitation tied to specific HOA organization
2. ✅ **Role-Based Invitations:** HOA Admin, Board Member, Homeowner roles
3. ✅ **Member Data Collection:** First name, last name, phone, address, unit number
4. ✅ **Dual Record Creation:** Creates both Directus user AND hoa_member record
5. ✅ **Custom Email Templates:** Branded SendGrid templates with org details
6. ✅ **Inviter Tracking:** Knows who sent invitation
7. ✅ **Acceptance Notifications:** Notifies inviter when accepted
8. ✅ **Auto-Login:** User automatically logged in after acceptance
9. ✅ **Invitation Verification:** Separate endpoint to check token validity

**Critical Differences:**

| Feature | Native | Custom | Winner |
|---------|--------|--------|--------|
| Simplicity | ✅ Very simple | ❌ Complex | Native |
| Maintenance | ✅ Zero code | ❌ High | Native |
| Organization context | ❌ No | ✅ Yes | Custom |
| Member data collection | ❌ No | ✅ Yes | Custom |
| Custom email templates | ⚠️ Basic | ✅ Rich SendGrid | Custom |
| Inviter notifications | ❌ No | ✅ Yes | Custom |
| Security surface | ✅ Vetted | ⚠️ Custom crypto | Native |
| Extensibility | ⚠️ Limited | ✅ Full control | Custom |

### Recommendation

**Keep Custom System BUT Add Native Fallback Option**

**Rationale:**

The custom invitation system is **justified** because it provides essential HOA-specific functionality that would be extremely difficult to implement with native Directus invitations:

1. **Multi-tenant architecture requires organization-scoped invitations**
2. **Member data collection is core to HOA management**
3. **Dual record creation (user + member) is business requirement**
4. **Custom email branding is important for white-label HOA platform**

**However, improve the implementation:**

#### Immediate Improvements:

1. **Security Hardening:**
```typescript
// Add rate limiting to prevent token brute force
// Add IP tracking for invitation acceptance
// Consider shorter token expiration (24 hours?)
// Add reCAPTCHA to acceptance page
```

2. **Error Handling:**
```typescript
// Better transaction handling (rollback if member creation fails)
// Detailed error logging to activity collection
// User-friendly error messages
```

3. **Testing:**
```typescript
// Add unit tests for token generation/validation
// Integration tests for full invitation flow
// Test expiration edge cases
```

4. **Monitoring:**
```typescript
// Track invitation acceptance rate
// Alert on expired invitations
// Monitor failed acceptance attempts
```

#### Optional: Hybrid Approach

**Use native invitations for SIMPLE user creation + custom flow for HOA members:**

```typescript
// For admin users or simple cases
await client.inviteUser(email, adminRoleId)

// For HOA members (current custom flow)
await createHOAMemberInvitation(email, orgId, role, memberData)
```

**Don't migrate to native** unless:
- ❌ You're willing to lose organization-scoped invitations
- ❌ You can collect member data separately (worse UX)
- ❌ You don't need custom email templates
- ❌ You don't need inviter notifications

---

## Overall Recommendations

### ✅ Priority 1: Activity Tracking (COMPLETED)

**Action:** Remove custom activity schema, use Directus native
**Status:** ✅ **COMPLETED**
**Effort:** 1-2 hours (actual)
**Impact:** High (reduces maintenance)

**Completed:**
- ✅ Removed `ActivityLog` interface from types
- ✅ Removed `activity_logs` from DirectusSchema
- ✅ Created `/composables/useActivityLog.ts`
- ✅ Comprehensive methods for querying native activity

### 🔄 Priority 2: OAuth Migration to Hooks (IN PROGRESS)

**Action:** Implement hybrid OAuth approach with Directus hooks
**Status:** 🔄 **IMPLEMENTING**
**Effort:** 1-2 days
**Impact:** High (better security, easier maintenance, multi-provider support)
**Risk:** Low (can run in parallel with custom endpoints)

**Completed:**
- ✅ Created `/extensions/hooks/hoa-auth/` directory
- ✅ Implemented `auth.login` hook for monitoring
- ✅ Implemented `items.create` hook for profile creation
- ✅ Added OAuth environment variables to `.env.example`
- ✅ Created comprehensive deployment README

**Next Steps:**
1. **Deploy Hook to Directus** (see `/extensions/hooks/hoa-auth/README.md`)
   ```bash
   cp -r extensions/hooks/hoa-auth /path/to/directus/extensions/hooks/
   # Restart Directus
   ```

2. **Configure Native OAuth** in Directus instance `.env`:
   ```env
   AUTH_PROVIDERS=google
   AUTH_GOOGLE_CLIENT_ID=...
   AUTH_GOOGLE_CLIENT_SECRET=...
   # See .env.example for full configuration
   ```

3. **Test Native OAuth Flow**
   - Visit: `https://admin.605lincolnroad.com/auth/login/google`
   - Verify profile creation in Directus logs
   - Check user and profile records created

4. **Gradual Migration**
   - Run both custom and native OAuth in parallel
   - Monitor for issues
   - Eventually deprecate custom endpoints

### Priority 3: Invitation System (KEEP CUSTOM)

**Action:** Keep custom invitation system, document justification
**Status:** ✅ **DOCUMENTED**
**Recommendation:** No changes needed
**Reason:** Custom features required for HOA multi-tenant architecture

**Custom Features Not Available in Native:**
- Organization-scoped invitations
- Member data collection (name, address, unit)
- Dual record creation (user + hoa_member)
- Custom SendGrid email templates
- Inviter tracking and notifications

### Priority 4: Security Hardening (FUTURE)

**Action:** Review and harden custom endpoints
**Status:** ⏳ **PENDING**
**Effort:** 2-3 days
**Impact:** High (security)
**Timeline:** After OAuth migration complete

**Tasks:**
```typescript
// Rate limiting on invitation endpoints
// Token brute force protection
// Session security audit for custom OAuth (if keeping)
// CSRF protection verification
// Comprehensive test coverage
```

---

## Conclusion

**Summary Table:**

| Feature | Conflict Level | Status | Recommendation |
|---------|---------------|--------|----------------|
| **OAuth/SSO** | ⚠️ Moderate | 🔄 In Progress | Migrate to hybrid with hooks |
| **Activity Tracking** | ✅ None | ✅ Completed | Using native `directus_activity` |
| **User Invitations** | 🔴 Major BUT Justified | ✅ Keep Custom | Maintain for business requirements |

**Key Insights:**

1. ✅ **Activity tracking migrated** - Now using Directus native, zero maintenance
2. 🔄 **OAuth migration in progress** - Implementing hooks-based hybrid approach
3. ✅ **Invitation system justified** - Custom features are business requirements
4. ✅ **Self-hosted advantage** - Can leverage Directus extensions ecosystem

**Implementation Status:**

1. ✅ Removed custom activity_log schema
2. ✅ Created useActivityLog composable
3. ✅ Created Directus authentication hooks
4. ✅ Documented OAuth migration process
5. ⏳ Deploy hooks to Directus instance (next step)
6. ⏳ Configure native OAuth providers (next step)
7. ⏳ Test and validate hybrid approach (next step)

**Next Actions for You:**

1. **Deploy Hooks to Directus:**
   ```bash
   # On your Directus server
   cp -r extensions/hooks/hoa-auth /path/to/directus/extensions/hooks/
   docker-compose restart directus  # or your restart method
   ```

2. **Configure OAuth in Directus `.env`:**
   ```env
   AUTH_PROVIDERS=google
   AUTH_GOOGLE_CLIENT_ID=your-client-id
   AUTH_GOOGLE_CLIENT_SECRET=your-secret
   # See .env.example for complete configuration
   ```

3. **Test Native OAuth:**
   ```
   Visit: https://admin.605lincolnroad.com/auth/login/google
   Check Directus logs for: "HOA Auth Hook: Initialized successfully"
   ```

4. **Review Migration Guide:**
   See `/extensions/hooks/hoa-auth/README.md` for detailed deployment instructions

---

**Generated:** 2025-11-15
**Updated:** 2025-11-15 (Implemented hooks-based approach)
**Author:** Claude Code Analysis
**Branch:** claude/check-directus-conflicts-01VHdEoMX33Uaj8HwmoZQwt8
