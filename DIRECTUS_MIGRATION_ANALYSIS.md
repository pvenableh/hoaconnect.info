# Directus Migration Analysis: directus-nuxt-layer to Direct SDK Usage

## Executive Summary

The application has initiated a migration from `directus-nuxt-layer` to direct Directus SDK usage. The migration is **partially complete** with several critical issues that need to be addressed:

1. **Type definitions** are well-defined but incomplete
2. **Server-side utilities** are properly set up with typed Directus clients
3. **Client-side composables** have **critical inconsistencies** in their implementation
4. **API endpoints** are implemented with both old and new patterns
5. **Component usage** has **mismatches** with composable return types

---

## 1. COMPOSABLES ANALYSIS

### A. useDirectusAuth.ts
**File:** `/home/user/605-Lincoln/composables/useDirectusAuth.ts`

**Current Implementation State:**
- Uses direct Directus SDK (`createDirectus`, `authentication`, `rest`)
- Proper client initialization with `getAuthClient()` factory
- State management with `useState` for auth state

**Exported Methods:**
```typescript
// State (readonly)
- user
- profile
- isAuthenticated
- loading
- error

// Methods
- login(email, password)
- register(data)
- logout()
- fetchUser()
- refreshTokens()
- requestPasswordReset(email)
- resetPassword(token, password)
- init()
```

**CRITICAL ISSUE #1: Missing `member` property**
- useDirectusAuth does NOT export `member` 
- useDirectusItems tries to import `member`: `const { member } = useDirectusAuth()`
- This will cause a runtime error
- The login endpoint stores member info but it's never returned to the composable

**CRITICAL ISSUE #2: Session token handling inconsistency**
- Auth endpoint uses `session.secure.directusAccessToken` 
- useDirectusAuth stores tokens via `/api/auth/login` endpoint
- No clear mechanism to access stored tokens from composable on client

**Status:** INCOMPLETE - Missing member property export, token refresh might not work properly

---

### B. useDirectusItems.ts
**File:** `/home/user/605-Lincoln/composables/useDirectusItems.ts`

**Current Implementation State:**
- Calls server API endpoints via `$fetch()` 
- Implements multi-tenancy filter for 'hoa_' prefixed collections
- Proper TypeScript typing with DirectusSchema

**Exported Methods:**
```typescript
// Primary methods
- fetchItems<T>(collection, options)
- fetchItem<T>(collection, id, options)
- createItem<T>(collection, data)
- updateItem<T>(collection, id, data)
- deleteItem<T>(collection, id)
- deleteItems<T>(collection, ids)
- aggregate<T>(collection, options)

// Aliases
- list (= fetchItems)
- get (= fetchItem)
- create (= createItem)
- update (= updateItem)
- remove (= deleteItem)
- removeMany (= deleteItems)
```

**CRITICAL ISSUE #3: Return type inconsistency**
```typescript
// Composable returns raw data:
return response as DirectusItem<T>[]

// But components expect wrapped response:
const result = await fetchItems("hoa_members", {...})
return result.data.value || []  // <- ERROR: result doesn't have .data or .value
```

**CRITICAL ISSUE #4: Missing member property from useDirectusAuth**
```typescript
const { member } = useDirectusAuth()  // <- member doesn't exist

// Later usage:
if (!member.value?.organization) { ... }
if (collection.startsWith('hoa_') && member.value?.organization) { ... }
```

**Status:** BROKEN - Return type inconsistency, missing member property will cause runtime errors

---

## 2. SERVER-SIDE UTILITIES ANALYSIS

### A. server/utils/directus.ts
**File:** `/home/user/605-Lincoln/server/utils/directus.ts`

**Provides:**
```typescript
function getTypedDirectus()
  - Returns typed Directus client with admin access
  - Uses staticToken(config.directus.staticToken)
  - Includes rest() and createDirectus<DirectusSchema>

async function getUserDirectus(event)
  - Returns typed client with user authentication
  - Extracts token from session: session.directusAccessToken
  - Proper error handling for missing auth

async function updateTypedDirectusItem<T>(collection, id, data)
  - Type-safe item updates
  - Handles complex objects

async function createTypedDirectusItem<T>(collection, data)
  - Type-safe item creation

async function readTypedDirectusItems<T>(collection, query)
  - Type-safe reads with typing

async function readTypedDirectusItem<T>(collection, id, query)
  - Single item read with typing

async function deleteTypedDirectusItem<T>(collection, id)
  - Type-safe deletion

async function refreshUserTokens(refreshToken)
  - Token refresh mechanism
```

**Status:** WELL IMPLEMENTED - Properly uses typed Directus SDK

---

### B. server/utils/directus-typed.ts
**File:** `/home/user/605-Lincoln/server/utils/directus-typed.ts`

**Status:** DUPLICATE/LEGACY
- Nearly identical to directus.ts but with less functionality
- Both files provide same core functionality
- Should be consolidated

---

## 3. SERVER API ENDPOINTS ANALYSIS

### Authentication Endpoints

#### POST /api/auth/login.post.ts
```typescript
// Uses direct Directus SDK
// Steps:
1. Creates auth client with authentication('session')
2. Calls authClient.login(email, password)
3. Creates another client with the token
4. Calls readMe() to get user details
5. Queries hoa_members for organization association
6. Sets session with directusAccessToken

// Returns session with:
- user: { id, email, first_name, last_name, role, organization, member_id }
- directusAccessToken, directusRefreshToken
```

**Issues:**
- Uses `hoa_members` collection (application-specific)
- Hardcoded HOA member lookup

#### POST /api/auth/register.post.ts
```typescript
// Uses admin Directus for creation
// Steps:
1. Creates user via createUser()
2. Creates profile record
3. Auto-logs in the user
4. Sets session

// Imports note:
- Uses old import style: createDirectus, rest, createUser, createItem, readRole
- Mixes authentication patterns
```

**Issues:**
- Uses both `authentication('json')` and admin token patterns
- Tries to access `rest.readItems()` which doesn't match Directus SDK patterns

---

### Directus Proxy Endpoints

#### GET /api/directus/items/[collection].get.ts
```typescript
// Proxies read operations to Directus via SDK
// Uses: getUserDirectus(event)
// Supports filtering, sorting, pagination, search
// Status: WORKING
```

#### POST /api/directus/items/[collection].post.ts
```typescript
// Proxies create operations
// Uses: getUserDirectus(event)
// Status: WORKING
```

#### [collection]/[...id].ts (Dynamic CRUD)
```typescript
// Uses: useDirectusServer() - UNDEFINED UTILITY
// Attempts to use createItems() - NOT IMPORTED
// Supports: GET (single/multiple), POST (create), PATCH (update), DELETE

// CRITICAL ISSUES:
- Line 24: useDirectusServer() is not defined anywhere
- Line 74: createItems() is imported from @directus/sdk but not imported at top
- Method GET case is inefficient (calls both readItem and readItems)
```

**Status:** BROKEN - References undefined utility, missing import

---

### HOA Organization Endpoints

#### POST /api/hoa/setup-organization.post.ts
```typescript
// Uses getTypedDirectus()
// Creates:
1. hoa_organization record
2. directus_user account
3. hoa_member record
4. Auto-login
5. Welcome email

// Status: WELL IMPLEMENTED
```

#### POST /api/hoa/invite-member.post.ts
```typescript
// Uses getTypedDirectus()
// Creates invitation record
// Sends email via SendGrid
// Status: WELL IMPLEMENTED
```

#### POST /api/hoa/accept-invitation.post.ts
```typescript
// Assumed to handle invitation acceptance
// Status: NOT EXAMINED
```

#### POST /api/hoa/verify-invitation.post.ts
```typescript
// Handles invitation verification
// Status: PARTIAL (uses getTypedDirectus but implementation not shown)
```

#### GET /api/hoa/check-slug.get.ts
#### GET /api/hoa/by-slug.get.ts
#### GET /api/hoa/by-domain.get.ts
```typescript
// Status: NOT EXAMINED
```

---

## 4. DIRECTUS SDK CONFIGURATION

### In nuxt.config.ts
```typescript
runtimeConfig: {
  // Server-only
  directusServerToken: process.env.DIRECTUS_STATIC_TOKEN
  directus: {
    url: process.env.DIRECTUS_URL
    staticToken: process.env.DIRECTUS_STATIC_TOKEN
  }
  
  // Public (exposed to client)
  public: {
    directus: {
      url: process.env.DIRECTUS_URL
      websocketUrl: process.env.DIRECTUS_WEBSOCKET_URL
    }
  }
}
```

**Status:** PROPERLY CONFIGURED

---

## 5. TYPE DEFINITIONS

### types/directus-schema.ts
**File:** `/home/user/605-Lincoln/types/directus-schema.ts`

**Defines:**
- DirectusUser (system collection)
- DirectusRole (system collection)
- DirectusFile (system collection)
- UserProfile (custom)
- UserSettings (custom)
- UserInvitation (custom)
- ActivityLog (custom)
- OAuthToken (custom)
- PasswordReset (custom)
- UserSession (custom)

**Schema:**
```typescript
interface DirectusSchema {
  directus_users: DirectusUser
  directus_roles: DirectusRole
  directus_files: DirectusFile
  profiles: UserProfile
  user_settings: UserSettings
  user_invitations: UserInvitation
  activity_logs: ActivityLog
  oauth_tokens: OAuthToken
  password_resets: PasswordReset
  user_sessions: UserSession
}
```

**CRITICAL ISSUE #5: Missing HOA Collections**
- No HoaOrganization type
- No HoaMember type
- No HoaInvitation type
- No HoaUnit type
- No HoaDocument type
- These are used throughout the application!

**Status:** INCOMPLETE - Missing HOA-specific types

---

## 6. COMPONENT USAGE PATTERNS

### Components Using Composables:

#### Auth/LoginForm.vue
```typescript
const { login } = useDirectusAuth()
await login(email, password)
emit('success', user)
```
**Status:** WORKS - Direct method call

#### Auth/RegisterForm.vue
```typescript
const { register } = useDirectusAuth()
await register({ email, password, firstName, lastName, phone })
emit('success', user)
```
**Status:** WORKS - Direct method call

#### InviteMemberForm.vue
```typescript
const { fetchItems } = useDirectusItems()

const { data: rolesData } = await fetchItems("directus_roles", {...})
const { data: unitsData } = await fetchItems("hoa_units", {...})

if (rolesData.value) { roles.value = rolesData.value }
if (unitsData.value) { units.value = unitsData.value }
```
**Status:** BROKEN - fetchItems returns array, not { data } object

#### OrganizationSetupForm.vue
```typescript
const { fetchItems } = useDirectusItems()

const { data } = await fetchItems("subscription_plans", {...})
if (data.value) { subscriptionPlans.value = data.value }
```
**Status:** BROKEN - Same issue as above

#### AppNav.vue / AppFooter.vue
```typescript
// Not examined but likely similar pattern
```

---

## 7. PAGE USAGE PATTERNS

### pages/members/index.vue
```typescript
const { fetchItems, create, update, deleteOne } = useDirectusItems()

const { data: members, refresh: refreshMembers } = await useAsyncData(
  'hoa-members-list',
  async () => {
    if (!organization.value?.id) return []
    const result = await fetchItems("hoa_members", {...})
    return result.data.value || []  // <- BROKEN
  }
)
```
**Status:** BROKEN - result.data.value doesn't exist

### pages/dashboard.vue
```typescript
const result = await fetchItems("hoa_documents", {...})
return result.data.value || []  // <- BROKEN
```
**Status:** BROKEN - Same pattern error

---

## 8. MISSING FUNCTIONALITY FROM directus-nuxt-layer

### What Should Be There:

1. **useDirectusServer()** composable/utility
   - Currently referenced in [collection]/[...id].ts but not defined
   - Should return authenticated Directus client for server context

2. **Member/Organization context** in useDirectusAuth
   - Should expose current member and organization
   - useDirectusItems needs this for filtering

3. **Consistent return types**
   - fetchItems should return Promise<DirectusItem<T>[]>
   - Should NOT wrap in .data.value structure

4. **Collection type imports**
   - Missing types for hoa_organizations, hoa_members, hoa_invitations, hoa_units, hoa_documents
   - These are critical for the HOA functionality

---

## 9. INCOMPLETE/TODO SECTIONS

### Auth Endpoint Issues:
1. `/api/auth/register.post.ts` - Mixes authentication patterns, uses non-existent `rest.readItems()`
2. No `/api/auth/me` endpoint (referenced in useDirectusAuth but not found)
3. No `/api/auth/refresh` endpoint (referenced in useDirectusAuth but not found)
4. No OAuth callback implementation fully examined

### Dynamic Endpoint Issues:
1. `[collection]/[...id].ts` - References undefined useDirectusServer()
2. `[collection]/[...id].ts` - Imports createItems() but uses it without importing
3. `[collection]/[...id].ts` - Inconsistent with typed utility pattern

### Type Definition Gaps:
1. Missing HOA organization types
2. Missing HOA member types
3. Missing HOA invitation types
4. No proper schema for aggregate responses

### Composable Issues:
1. useDirectusItems - expects member from useDirectusAuth (doesn't exist)
2. useDirectusItems - return type mismatch (raw array vs wrapped object)
3. useDirectusAuth - member property not exposed
4. useDirectusAuth - unclear how tokens are refreshed on client

---

## 10. SUMMARY TABLE

| Component | Status | Issues |
|-----------|--------|--------|
| useDirectusAuth | PARTIAL | Missing member export, token handling unclear |
| useDirectusItems | BROKEN | Return type mismatch, member not found |
| useSelectedOrg | WORKING | Uses broken useDirectusItems pattern |
| server/utils/directus.ts | GOOD | Well-implemented typed client |
| server/utils/directus-typed.ts | LEGACY | Duplicate, should be removed |
| /api/auth/login.post.ts | WORKING | Uses SDK properly |
| /api/auth/register.post.ts | BROKEN | Mixed patterns, invalid imports |
| /api/directus/items/[].get.ts | WORKING | Properly uses typed client |
| /api/directus/items/[].post.ts | WORKING | Properly uses typed client |
| /api/directus/items/[collection]/[...id].ts | BROKEN | Undefined utility, missing import |
| /api/hoa/setup-organization.post.ts | WORKING | Uses typed client properly |
| /api/hoa/invite-member.post.ts | WORKING | Uses typed client properly |
| types/directus-schema.ts | INCOMPLETE | Missing HOA types |
| Auth components | WORKING | Direct method calls work |
| InviteMemberForm | BROKEN | Wrong composable usage |
| OrganizationSetupForm | BROKEN | Wrong composable usage |
| pages/members/index.vue | BROKEN | Wrong composable usage |
| pages/dashboard.vue | BROKEN | Wrong composable usage |

---

## RECOMMENDED FIXES (Priority Order)

### CRITICAL (Breaks application):
1. Fix useDirectusItems return type - should return raw array
2. Fix useDirectusAuth to expose member/organization
3. Fix components/pages using wrong data structure
4. Fix [collection]/[...id].ts endpoint (undefined utility, missing import)
5. Fix auth/register.post.ts endpoint

### HIGH (Functionality gaps):
1. Add missing HOA types to directus-schema.ts
2. Implement missing auth endpoints (/api/auth/me, /api/auth/refresh)
3. Remove duplicate directus-typed.ts utility

### MEDIUM (Code quality):
1. Consolidate Directus utility files
2. Ensure consistent error handling across endpoints
3. Add proper token refresh mechanism on client

### LOW (Polish):
1. Add more specific types for nested objects
2. Add constants for collection names
3. Add validation schemas for API responses
