# Directus Data Model & OAuth Configuration Analysis
**Project:** 605-Lincoln HOA Management System  
**Date:** 2025-11-15  
**Status:** Self-hosted Directus with custom extensions

---

## EXECUTIVE SUMMARY

This Directus project implements a **multi-tenant HOA (Homeowners Association) management system** with three core collections:

1. **`profiles`** - Extended user profile data (1:1 with directus_users)
2. **`hoa_members`** - HOA organization membership records (N:N relationship)
3. **`hoa_organizations`** - Multi-tenant organization records

The system uses a **hybrid OAuth approach** with native Directus OAuth + custom hooks for HOA-specific logic. User data flows through multiple collections during authentication and member onboarding.

---

## 1. COLLECTION SCHEMA & FIELDS

### 1.1 `profiles` Collection
**Purpose:** Extended user profile information beyond Directus system user fields

**Type:** Application collection  
**Relationship:** 1:1 with `directus_users` (via `user_id` foreign key)

**Fields:**

| Field | Type | Description | OAuth Data |
|-------|------|-------------|-----------|
| `id` | UUID | Primary key | - |
| `user_id` | FK→directus_users | Reference to Directus user | ✅ Set on creation |
| `display_name` | String | User's display name | ✅ From OAuth name |
| `bio` | String | User biography | ✅ Optional |
| `avatar_url` | String | Avatar URL | ✅ From OAuth picture |
| `phone` | String | Phone number | ❌ Collected on signup |
| `phone_verified` | Boolean | Phone verification status | ❌ Manual |
| `secondary_email` | String | Additional email | ❌ User provided |
| `secondary_email_verified` | Boolean | Verification status | ❌ Manual |
| **Address Fields** | | | |
| `address_line1` | String | Street address | ❌ User provided |
| `address_line2` | String | Apartment/unit number | ❌ User provided |
| `city` | String | City | ❌ User provided |
| `state_province` | String | State/province | ❌ User provided |
| `postal_code` | String | ZIP/postal code | ❌ User provided |
| `country` | String | Country | ❌ User provided |
| **OAuth/Social** | | | |
| `google_id` | String | Google account ID | ✅ From OAuth |
| `google_profile` | JSON | Full Google profile data | ✅ From OAuth |
| `github_id` | String | GitHub account ID | ❌ Not implemented |
| `linkedin_id` | String | LinkedIn account ID | ❌ Not implemented |
| **Preferences** | | | |
| `timezone` | String | User timezone | ❌ User provided |
| `locale` | String | Language preference | ❌ User provided |
| `currency` | String | Preferred currency | ❌ User provided |
| `newsletter_subscribed` | Boolean | Email list subscription | ❌ User provided |
| `notifications_enabled` | Boolean | Push notifications | ❌ Default true |
| `notification_preferences` | JSON | Detailed notification settings | ❌ User provided |
| **Professional** | | | |
| `company` | String | Company name | ❌ User provided |
| `job_title` | String | Job title | ❌ User provided |
| `website` | String | Website URL | ❌ User provided |
| `skills` | Array | Skills list | ❌ User provided |
| **Metadata** | | | |
| `last_activity` | DateTime | Last login timestamp | ✅ Auto on login |
| `onboarding_completed` | Boolean | Onboarding status | ✅ Auto on completion |
| `profile_completed_percentage` | Number | Profile completion % | ❌ Manual calculation |
| `metadata` | JSON | Custom fields | ✅ Flexible |
| **System** | | | |
| `status` | Enum | 'active', 'inactive', 'suspended' | ✅ Set to 'active' |
| `date_created` | DateTime | Creation timestamp | ✅ Auto |
| `date_updated` | DateTime | Last update timestamp | ✅ Auto |

**How Created:**
- **On Regular Signup:** `/api/auth/register.post.ts` creates both directus_user and profile
- **On OAuth Login:** Hook `items.create` in `/extensions/hooks/hoa-auth/index.js` automatically creates profile for new users
- **Google OAuth Data Captured:**
  - `display_name` ← `${first_name} ${last_name}`
  - `google_id` ← `external_identifier` from directus_users
  - `google_profile` ← Full OAuth response (optional)

---

### 1.2 `hoa_members` Collection
**Purpose:** Organization membership records that link users to HOA organizations with roles

**Type:** Application collection (Core to multi-tenant system)  
**Relationships:**
- FK → `directus_users.id` (via `user` field)
- FK → `hoa_organizations.id` (via `organization` field)
- FK → `directus_roles.id` (via `role` field)

**Fields:**

| Field | Type | Description | Data Source |
|-------|------|-------------|------------|
| `id` | UUID | Primary key | - |
| `user` | FK→directus_users | The user who is a member | ✅ From login/OAuth |
| `organization` | FK→hoa_organizations | The HOA organization | ✅ From invite/setup |
| `role` | FK→directus_roles | User's role in org (HOA Admin, Board Member, etc.) | ✅ From invite/setup |
| **Member Info** | | | |
| `first_name` | String | Member's first name | ✅ From signup/invite |
| `last_name` | String | Member's last name | ✅ From signup/invite |
| `email` | String | Member's email | ✅ From signup/invite |
| `phone` | String | Member contact phone | ✅ From signup/invite |
| `member_type` | Enum | 'owner', 'tenant', 'guest' | ✅ Auto to 'owner' on setup |
| **Address** | | | |
| `unit` | FK→hoa_units | Property unit they own/occupy | ❌ Optional |
| **Status & Dates** | | | |
| `status` | String | 'active', 'inactive', 'pending' | ✅ Set on creation |
| `date_created` | DateTime | When membership created | ✅ Auto |
| `date_updated` | DateTime | Last update | ✅ Auto |

**How Created:**
1. **During Organization Setup** (`/api/hoa/setup-organization.post.ts`):
   - Admin creates HOA organization
   - Admin becomes first HOA member with role "HOA Admin"
   
2. **During Member Invitation** (`/api/hoa/accept-invitation.post.ts`):
   - Invitation token verified
   - New directus_user created
   - New hoa_member record created with:
     - Email from invitation
     - Organization from invitation
     - Role from invitation
     - Member data (first_name, last_name, phone) from signup form

3. **During OAuth Login** (`/api/auth/oauth/google/callback.get.ts`):
   - If user exists in hoa_members, organization context is set in session
   - If user is NEW OAuth user, NO hoa_member created (user must be invited to org)

**Key Query:** Users can have **multiple hoa_member records** (one per organization they join)

---

### 1.3 `hoa_organizations` Collection
**Purpose:** Top-level organizations (individual HOAs) supporting multi-tenant architecture

**Type:** Application collection  
**Relationships:**
- 1:N with `hoa_members` (members of this org)
- 1:N with `hoa_invitations` (pending invites for this org)
- 1:N with `hoa_units` (property units in this org)

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | String | Organization name (e.g., "605 Lincoln Road HOA") |
| `slug` | String | URL-friendly slug (unique, validated format) |
| `custom_domain` | String | Optional white-label domain |
| `domain_verified` | Boolean | Domain verification status |
| **Contact Info** | | |
| `street_address` | String | Organization address |
| `city` | String | City |
| `state` | String | State |
| `zip` | String | ZIP code |
| `phone` | String | Organization phone |
| `email` | String | Organization email |
| **Management** | | |
| `subscription_plan` | FK→subscription_plans | Optional subscription tier |
| `member_count` | Number | Cached member count |
| `settings` | JSON | Organization-specific settings |
| **Status & Dates** | | |
| `status` | String | 'active', 'inactive', 'suspended' |
| `date_created` | DateTime | Creation timestamp |
| `date_updated` | DateTime | Last update |

**How Created:**
- `/api/hoa/setup-organization.post.ts` - Admin creates new HOA during onboarding
- Requires unique slug validation
- Creator automatically becomes first admin member

---

### 1.4 System Collections Used

#### `directus_users` (Directus System Collection)
Stores authentication credentials and system user info.

**Key Fields:**
- `id` - User identifier
- `email` - Email address (must be unique)
- `password` - Hashed password (only for local auth)
- `first_name`, `last_name` - User name
- `provider` - 'default', 'google', 'github', etc.
- `external_identifier` - OAuth provider's user ID
- `auth_data` - Additional OAuth data
- `role` - FK to directus_roles
- `status` - 'active', 'suspended', 'archived'

**OAuth Data Stored:**
- `provider` ← Set to 'google' on Google OAuth
- `external_identifier` ← Google's sub identifier
- `first_name` ← Google's given_name
- `last_name` ← Google's family_name

#### `directus_roles` (Directus System Collection)
Defines system roles with permissions.

**HOA Roles Created in Directus:**
- "HOA Admin" - Full organization admin access
- "Board Member" - Board-level access
- "Homeowner" - Basic member access
- "Guest" - Read-only access

#### `directus_activity` (Directus System Collection)
Native activity tracking (used instead of custom activity_log).

**Tracks:**
- Login attempts
- User creation
- Item creation/update/delete
- Who made changes and when

---

### 1.5 `hoa_invitations` Collection
**Purpose:** Tracks member invitations to organizations

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `email` | String | Email being invited |
| `organization` | FK→hoa_organizations | Which org this invite is for |
| `role` | FK→directus_roles | Role being offered |
| `invited_by` | FK→directus_users | Who sent the invitation |
| `token` | String | 64-char hex token (randomBytes(32)) |
| `invitation_status` | Enum | 'pending', 'accepted', 'expired', 'cancelled' |
| `expires_at` | DateTime | 7 days from creation |
| `accepted_at` | DateTime | When acceptance confirmed |
| `status` | String | 'published', 'draft' |
| `date_created` | DateTime | Creation timestamp |

**Process:**
1. HOA Admin calls `/api/hoa/invite-member.post.ts`
2. Creates hoa_invitations record with token
3. Sends email via SendGrid with accept link: `/hoa/accept-invite?token={token}`
4. New member visits link and calls `/api/hoa/accept-invitation.post.ts`
5. System creates directus_user + hoa_member records
6. Updates invitation status to 'accepted'

---

## 2. COLLECTION RELATIONSHIPS (ERD)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Directus System Collections                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  directus_users         directus_roles      directus_activity    │
│    (system)              (system)            (auto-tracked)       │
│  ┌─────────────┐      ┌─────────────┐     ┌──────────────────┐   │
│  │ id          │      │ id          │     │ id               │   │
│  │ email       │      │ name        │     │ action           │   │
│  │ password    │      │ permissions │     │ user             │   │
│  │ first_name  │      │ admin_access│     │ timestamp        │   │
│  │ last_name   │      │ app_access  │     │ collection       │   │
│  │ provider    │◄─┐   │             │     │ item             │   │
│  │ external_id │  │   └─────────────┘     └──────────────────┘   │
│  │ auth_data   │  │        ▲                                      │
│  │ role        ├──┘        │                                      │
│  │ status      │           │ (assigned to roles)                  │
│  └─────────────┘           │                                      │
│        ▲                    │                                      │
│        │ 1:1                │                                      │
│        │                    │                                      │
│        ├─────────────┐      │                                      │
│        │             │      │                                      │
└────────┼─────────────┼──────┼──────────────────────────────────────┘
         │             │      │
┌────────┼─────────────┼──────┼──────────────────────────────────────┐
│        │             │      │        Application Collections        │
├────────┼─────────────┼──────┼──────────────────────────────────────┤
│        │             │      │                                      │
│   profiles        ┌──┴──────┴──┐                                  │
│ ┌─────────────┐   │             │                                 │
│ │ id          │   │ hoa_members │      hoa_organizations          │
│ │ user_id     ├───┤ ┌─────────────────┐ ┌──────────────────────┐  │
│ │ (FK to user)│   │ │ id              │ │ id                   │  │
│ │             │   │ │ user            │ │ name                 │  │
│ │ display_name│   │ │ (FK→user)       │ │ slug                 │  │
│ │ bio         │   │ │ organization    │─┤ (FK→org)             │  │
│ │ avatar_url  │   │ │ (FK→org)        │ │ custom_domain        │  │
│ │ google_id   │   │ │ role            │ │ street_address       │  │
│ │ google_prof │   │ │ (FK→role)       │ │ city/state/zip       │  │
│ │             │   │ │ member_type     │ │ phone/email          │  │
│ │ phone       │   │ │ status          │ │ subscription_plan    │  │
│ │ address_*   │   │ │ date_created    │ │ settings             │  │
│ │ timezone    │   │ │ date_updated    │ │ status               │  │
│ │ locale      │   │ │                 │ │ date_created         │  │
│ │ status      │   │ └─────────────────┘ └──────────────────────┘  │
│ │ date_*      │   │        ▲                     ▲                 │
│ └─────────────┘   │        │ N:N                 │ 1:N             │
│                   │        └─────────────────────┘                 │
│                   │                                                │
│                   │    hoa_invitations                             │
│                   │  ┌──────────────────┐                          │
│                   │  │ id               │                          │
│                   │  │ email            │                          │
│                   │  │ organization     ├─────────┐                │
│                   │  │ (FK→org)         │         │                │
│                   │  │ role             │         │                │
│                   │  │ (FK→role)        │         │                │
│                   │  │ invited_by       │         │                │
│                   │  │ token            │         │                │
│                   │  │ status           │         │                │
│                   │  │ expires_at       │         │                │
│                   │  └──────────────────┘         │                │
│                   │           ▲                   │                │
│                   │           │ 1:N               │                │
│                   │           └───────────────────┘                │
│                   │                                                │
│                   │         hoa_units                              │
│                   │     ┌──────────────────┐                       │
│                   │     │ id               │                       │
│                   │     │ organization     │                       │
│                   │     │ (FK→org)         │                       │
│                   │     │ unit_number      │                       │
│                   │     │ status           │                       │
│                   │     └──────────────────┘                       │
│                   │                                                │
└───────────────────┴────────────────────────────────────────────────┘

KEY RELATIONSHIPS:
• profiles (1:1) → directus_users (user_id)
• hoa_members (N:N) → directus_users (user field) & hoa_organizations
• hoa_invitations (N:1) → hoa_organizations & directus_roles
• hoa_organizations (1:N) → hoa_members, hoa_invitations, hoa_units
```

---

## 3. OAUTH DATA FLOW (GOOGLE)

### 3.1 OAuth Configuration

**Location:** `/extensions/hooks/hoa-auth/` (Directus hooks)  
**Approach:** Hybrid - Native Directus OAuth + Custom Hooks for HOA logic

**Configuration (in Directus `.env`):**
```env
AUTH_PROVIDERS=google
AUTH_GOOGLE_DRIVER=openid
AUTH_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
AUTH_GOOGLE_CLIENT_SECRET=your-client-secret
AUTH_GOOGLE_ISSUER_URL=https://accounts.google.com
AUTH_GOOGLE_IDENTIFIER_KEY=email
AUTH_GOOGLE_ALLOW_PUBLIC_REGISTRATION=true
AUTH_GOOGLE_DEFAULT_ROLE_ID=your-default-role-uuid
```

### 3.2 Login Flow Sequence Diagram

#### Scenario A: New User Signing Up with Google OAuth

```
User                 App                  Directus                Directus Hooks
  │                  │                       │                          │
  ├─Click "Sign in with Google"────────────►│                          │
  │                  │                       │                          │
  │                  │◄──Redirect to Google OAuth────────────────────────┤
  │                  │                       │                          │
  │  ┌──────────────────────────────────────────────────────────────┐  │
  │  │ User logs in at Google                                       │  │
  │  │ Returns: {                                                   │  │
  │  │   sub: "115237018652...",                                   │  │
  │  │   email: "user@gmail.com",                                  │  │
  │  │   given_name: "John",                                       │  │
  │  │   family_name: "Doe",                                       │  │
  │  │   picture: "https://..."                                    │  │
  │  │ }                                                            │  │
  │  └──────────────────────────────────────────────────────────────┘  │
  │                  │                       │                          │
  │  ┌──Callback to Directus (/auth/callback)─────────────────────────►│
  │  │ Payload: {                                                      │
  │  │   provider: "google",                                           │
  │  │   profile: { ... full Google profile ... }                      │
  │  │ }                                                               │
  │  │                                                                 │
  │  │ Step 1: Check if user exists by email                          │
  │  │  - Query: directus_users WHERE email = "user@gmail.com"        │
  │  │  - Result: NOT FOUND (new user)                                │
  │  │                                                                 │
  │  │ Step 2: Create directus_user record                            │
  │  │  - email: "user@gmail.com"                                     │
  │  │  - first_name: "John"                                          │
  │  │  - last_name: "Doe"                                            │
  │  │  - provider: "google"                                          │
  │  │  - external_identifier: "115237018652..."                      │
  │  │  - auth_data: { picture: "https://..." }                       │
  │  │  - role: AUTH_GOOGLE_DEFAULT_ROLE_ID                           │
  │  │  - status: "active"                                            │
  │  │                                                                 │
  │  │  Result: directus_users[id: "uuid-123"]                        │
  │  │
  │  ├─Trigger: items.create event for directus_users ─────────────────►│
  │  │                                                                    │
  │  │ HOA Auth Hook (items.create):                                    │
  │  │  - Detect: collection = "directus_users", provider = "google"   │
  │  │  - Create profile record:                                       │
  │  │    {                                                             │
  │  │      id: "uuid-profile",                                        │
  │  │      user_id: "uuid-123",                                       │
  │  │      display_name: "John Doe",                                  │
  │  │      status: "active",                                          │
  │  │      google_id: "115237018652...",                              │
  │  │      date_created: now                                          │
  │  │    }                                                             │
  │  │  - Note: No hoa_member created (user not invited to org)        │
  │  │  - Result: profile[id: "uuid-profile"]                          │
  │  │                                                                 │
  │  │ Step 3: Retrieve full user details                              │
  │  │  - Query: directus_users[id: "uuid-123"] with role expanded    │
  │  │  - Result: {id, email, first_name, last_name, role}           │
  │  │                                                                 │
  │  │ Step 4: Check for HOA member association                        │
  │  │  - Query: hoa_members WHERE user = "uuid-123"                  │
  │  │  - Result: [] (empty, user not a member of any org)            │
  │  │                                                                 │
  │  │ Step 5: Set session and return                                 │
  │  │  - Session: {                                                  │
  │  │      user: {                                                   │
  │  │        id: "uuid-123",                                         │
  │  │        email: "user@gmail.com",                                │
  │  │        first_name: "John",                                     │
  │  │        last_name: "Doe",                                       │
  │  │        role: {...},                                            │
  │  │        organization: null,      ◄── No org yet                 │
  │  │        member_id: null          ◄── Not a member yet           │
  │  │      },                                                         │
  │  │      directusAccessToken: "...",                               │
  │  │      directusRefreshToken: "..."                               │
  │  │    }                                                            │
  │  │                                                                 │
  │  └─Return: Redirect to /dashboard ◄──────────────────────────────┬─┘
  │                  │                                                │
  └──Render dashboard (without org context)──────────────────────────┘


Result in Database:
  directus_users[id="uuid-123"]:
    email: "user@gmail.com"
    first_name: "John"
    last_name: "Doe"
    provider: "google"
    external_identifier: "115237018652..."
    status: "active"

  profiles[id="uuid-profile"]:
    user_id: "uuid-123"
    display_name: "John Doe"
    google_id: "115237018652..."
    status: "active"

  hoa_members: [EMPTY] ← User needs to be invited to org
```

#### Scenario B: Existing User Signing In with Google OAuth

```
User                 App                  Directus                Directus Hooks
  │                  │                       │                          │
  ├─Click "Sign in with Google"────────────►│                          │
  │                  │                       │                          │
  │  ┌──Callback (same as above)──────────────────────────────────────┐ │
  │  │ Step 1: Check if user exists by email                          │ │
  │  │  - Query: directus_users WHERE email = "user@gmail.com"        │ │
  │  │  - Result: FOUND (existing user) ◄─── Different from Scenario A│ │
  │  │                                                                 │ │
  │  │ Step 2: Update user record (refresh OAuth data)                │ │
  │  │  - Update: directus_users[id: "uuid-123"]                      │ │
  │  │  - Set: first_name, last_name, provider from OAuth             │ │
  │  │  - No profile creation (profile already exists)                │ │
  │  │                                                                 │ │
  │  │ Step 3: Retrieve full user details                             │ │
  │  │  - Query: directus_users[id: "uuid-123"] with role expanded   │ │
  │  │                                                                 │ │
  │  │ Step 4: Check for HOA member association                       │ │
  │  │  - Query: hoa_members WHERE user = "uuid-123"                 │ │
  │  │  - Result: [{                                                  │ │
  │  │      id: "uuid-member-456",                                    │ │
  │  │      organization: "uuid-org-abc",    ◄─── User is a member!  │ │
  │  │      role: "...",                                              │ │
  │  │      status: "active"                                          │ │
  │  │    }]                                                           │ │
  │  │                                                                 │ │
  │  │ Step 5: Set session with organization context                  │ │
  │  │  - Session: {                                                  │ │
  │  │      user: {                                                   │ │
  │  │        id: "uuid-123",                                         │ │
  │  │        email: "user@gmail.com",                                │ │
  │  │        first_name: "John",                                     │ │
  │  │        last_name: "Doe",                                       │ │
  │  │        role: {...},                                            │ │
  │  │        organization: "uuid-org-abc", ◄─── Set!                 │ │
  │  │        member_id: "uuid-member-456"  ◄─── Set!                 │ │
  │  │      },                                                         │ │
  │  │      directusAccessToken: "...",                               │ │
  │  │      directusRefreshToken: "..."                               │ │
  │  │    }                                                            │ │
  │  │                                                                 │ │
  │  └─Return: Redirect to /dashboard ◄─────────────────────────────┬──┘
  │                  │                                                │
  └──Render dashboard (WITH org context) ────────────────────────────┘


Result in Database:
  [No new records - all existing]
  
  Session now includes:
    user.organization: "uuid-org-abc"
    user.member_id: "uuid-member-456"
```

### 3.3 OAuth Data Mapping

| Google OAuth Field | Directus Field | Profile Field | Description |
|------------------|-----------------|--------------|-------------|
| `email` | `directus_users.email` | - | Email address (must be unique) |
| `given_name` | `directus_users.first_name` | - | First name |
| `family_name` | `directus_users.last_name` | - | Last name |
| `picture` | `profiles.avatar_url` | `avatar_url` | Profile picture URL |
| `sub` | `directus_users.external_identifier` | `profiles.google_id` | Google user ID |
| `[full]` | `directus_users.auth_data` | - | Full OAuth response (optional) |
| (N/A) | `directus_users.provider` | - | Set to "google" |
| (N/A) | `directus_users.status` | - | Set to "active" |

---

## 4. USER ONBOARDING FLOWS

### 4.1 Signup with Organization (Setup New HOA)

```
Flow: /api/hoa/setup-organization.post.ts

Input:
  organizationName: "605 Lincoln Road HOA"
  slug: "605-lincoln"
  street_address: "605 Lincoln Road"
  city: "Example City"
  state: "CA"
  zip: "12345"
  email: "admin@hoa.com"
  password: "password123"
  firstName: "Jane"
  lastName: "Smith"
  phone: "+1-555-1234"

Creates:
  1. hoa_organizations[1]
     {
       id: "uuid-org",
       name: "605 Lincoln Road HOA",
       slug: "605-lincoln",
       street_address: "605 Lincoln Road",
       city: "Example City",
       state: "CA",
       zip: "12345",
       status: "published"
     }

  2. directus_users[1]
     {
       id: "uuid-user-1",
       email: "admin@hoa.com",
       first_name: "Jane",
       last_name: "Smith",
       role: "HOA Admin role UUID",
       status: "active",
       provider: "local"
     }

  3. hoa_members[1]
     {
       id: "uuid-member-1",
       user: "uuid-user-1",
       organization: "uuid-org",
       role: "HOA Admin role UUID",
       first_name: "Jane",
       last_name: "Smith",
       email: "admin@hoa.com",
       phone: "+1-555-1234",
       member_type: "owner",
       status: "published"
     }

  4. profiles[1] ← Via auth hook
     {
       id: "uuid-profile-1",
       user_id: "uuid-user-1",
       display_name: "Jane Smith",
       status: "active"
     }

  5. Session + Auto-login + Welcome email
```

### 4.2 Member Invitation & Acceptance Flow

```
Flow: /api/hoa/invite-member.post.ts → /api/hoa/accept-invitation.post.ts

Step 1: Invite Member
Input:
  email: "member@example.com"
  firstName: "John"
  lastName: "Doe"
  organizationId: "uuid-org"
  roleId: "uuid-role-homeowner"

Creates:
  hoa_invitations[1]
    {
      id: "uuid-invite",
      email: "member@example.com",
      organization: "uuid-org",
      role: "uuid-role-homeowner",
      invited_by: "uuid-user-1",
      token: "randomBytes(32).hex()", ← 64-char hex
      invitation_status: "pending",
      expires_at: "7 days from now",
      status: "published"
    }

Sends Email:
  To: member@example.com
  Link: {APP_URL}/hoa/accept-invite?token={token}

Step 2: Accept Invitation
Input:
  token: "..." ← from email link
  password: "password456"
  firstName: "John"
  lastName: "Doe"
  phone: "+1-555-5678"

Validates:
  1. Find hoa_invitations by token
  2. Check status = "pending"
  3. Check not expired
  4. Check email not already registered

Creates:
  1. directus_users[1]
     {
       id: "uuid-user-2",
       email: "member@example.com",
       password: "hashed_password456",
       first_name: "John",
       last_name: "Doe",
       role: "uuid-role-homeowner",
       status: "active",
       provider: "local"
     }

  2. hoa_members[1]
     {
       id: "uuid-member-2",
       user: "uuid-user-2",
       organization: "uuid-org",
       role: "uuid-role-homeowner",
       first_name: "John",
       last_name: "Doe",
       email: "member@example.com",
       phone: "+1-555-5678",
       member_type: "owner",
       status: "published"
     }

  3. profiles[1] ← Via auth hook
     {
       id: "uuid-profile-2",
       user_id: "uuid-user-2",
       display_name: "John Doe",
       status: "active"
     }

Updates:
  hoa_invitations[uuid-invite]
    invitation_status: "accepted"
    accepted_at: "now"

Session + Auto-login + Notification email to inviter
```

---

## 5. DATA OVERLAP & REDUNDANCY ANALYSIS

### 5.1 Redundancy Identified

#### Issue #1: User Name Fields Stored in Multiple Places

| Collection | Fields | Source | Purpose |
|-----------|--------|--------|---------|
| `directus_users` | `first_name`, `last_name` | Auth/OAuth | System user record |
| `profiles` | `display_name` | Derived from user | UI display |
| `hoa_members` | `first_name`, `last_name`, `email` | Signup/invite | Member records |

**Analysis:**
- `directus_users.first_name/last_name` are the "source of truth"
- `profiles.display_name` is derived (manually set to "{first_name} {last_name}")
- `hoa_members.first_name/last_name` duplicates directus_users data

**Recommendation:**
- Keep hoa_members fields for now (required for member management)
- Consider using VIEW or AUTO-COMPUTED field for profiles.display_name

#### Issue #2: Email Stored in Multiple Places

| Collection | Field | Source | Sync |
|-----------|-------|--------|------|
| `directus_users` | `email` | OAuth/signup | ✅ Primary |
| `hoa_members` | `email` | Copied from signup | ❌ Manual |
| `hoa_invitations` | `email` | User input on invite | ❌ Not synced |

**Analysis:**
- Directus doesn't automatically sync email to hoa_members
- If user changes email, hoa_members.email becomes stale
- invitation emails stored separately (invitation email != user email)

**Recommendation:**
- Add trigger/hook to sync email when directus_users.email updated
- Or use FK + query pattern instead of stored email

#### Issue #3: Organization Context Duplication

| Storage | Data | Purpose |
|---------|------|---------|
| `hoa_members.organization` | FK to org | Query member's org |
| `session.user.organization` | org ID | Multi-tenant filtering |
| URL slug | org identifier | Routing |

**Analysis:**
- Necessary for multi-tenant architecture
- Session caching improves performance
- No redundancy here, just distribution

---

### 5.2 Missing Relationships

#### Issue #4: No Direct Link Between Profiles and HOA Members

**Current:**
```
profile → directus_user ← hoa_member
```

**Problem:**
- Can't query "all profiles for org" directly
- Must join through directus_users

**Impact:** Minor - most queries through hoa_members anyway

---

### 5.3 Data Integrity Concerns

#### Issue #5: Invitation Email vs User Email

When inviting "member@example.com" but user signs up with OAuth and primary email is different:
- hoa_invitations.email = "member@example.com"
- directus_users.email = "oauth_linked@gmail.com"
- hoa_members.email = "member@example.com"

**Risk:** Inconsistent state if invitation isn't accepted quickly

**Mitigation:** Current flow requires accepting invitation, so less of an issue

---

## 6. FIELD COMPLETENESS BY SCENARIO

### 6.1 Regular Signup Flow

```
User fills form: email, password, firstName, lastName

Created Records:
✅ directus_users:    email, password, first_name, last_name, role, status
✅ profiles:          user_id, display_name, status
❌ hoa_members:       NOT CREATED (no org context)

User is logged in but has NO organization
→ Cannot access HOA features until invited to org
→ Must be invited via /api/hoa/invite-member.post.ts
```

### 6.2 Google OAuth Signup Flow

```
User clicks "Sign in with Google"
Google returns: email, given_name, family_name, picture, sub

Created Records:
✅ directus_users:    email, first_name, last_name, provider, external_identifier, status
✅ profiles:          user_id, display_name, google_id, status
❌ hoa_members:       NOT CREATED

User is logged in but has NO organization
→ Same as regular signup - must be invited
```

### 6.3 Organization Setup Flow

```
Admin fills form: org details, firstName, lastName, email, password

Created Records:
✅ hoa_organizations: name, slug, street_address, city, state, zip, phone, email
✅ directus_users:    email, first_name, last_name, password, role, status
✅ hoa_members:       first_name, last_name, email, phone, member_type, status
✅ profiles:          user_id, display_name, status

User is logged in WITH organization
→ Full access to org dashboard
```

### 6.4 Member Invitation Flow

```
Admin invites: email, firstName, lastName, phone, organization, role

Step 1 - Invitation Created:
✅ hoa_invitations:   email, organization, role, invited_by, token, status

Step 2 - Member Accepts:
✅ directus_users:    email, password, first_name, last_name, role, status
✅ hoa_members:       first_name, last_name, email, phone, organization, role
✅ profiles:          user_id, display_name, status

Member is logged in WITH organization
→ Full access to org dashboard
```

---

## 7. IMPLEMENTATION NOTES

### 7.1 Hooks Implementation

**Location:** `/extensions/hooks/hoa-auth/index.js`

**Hooks Deployed:**

1. **`auth.login` action**
   - Triggered after any successful login (password, OAuth, etc.)
   - Checks if user has HOA member record
   - Logs login for activity tracking
   - Does NOT create member records (too early - no org context)

2. **`items.create` action (directus_users)**
   - Triggered when new user is created
   - Automatically creates profile record
   - Stores Google ID if OAuth user
   - Does NOT create hoa_member (requires separate invite flow)

3. **`auth.login` filter**
   - For logging/monitoring
   - Can add validation logic if needed

### 7.2 API Endpoint Overview

| Endpoint | Purpose | Creates | Method |
|----------|---------|---------|--------|
| `/api/auth/register.post.ts` | Regular signup | directus_user, profile | Direct + Hook |
| `/api/auth/login.post.ts` | Password login | (none) | Query hoa_members |
| `/api/auth/oauth/google/callback.get.ts` | OAuth login | directus_user, profile | Direct + Hook |
| `/api/hoa/setup-organization.post.ts` | New HOA setup | org, directus_user, hoa_member, profile | Direct + Hook |
| `/api/hoa/invite-member.post.ts` | Send invitation | hoa_invitation | Direct |
| `/api/hoa/accept-invitation.post.ts` | Accept invite | directus_user, hoa_member, profile | Direct + Hook |

### 7.3 Multi-Tenant Filtering

The system uses `hoa_members` to determine organization context:

```typescript
// In useDirectusItems composable
const { member } = useDirectusAuth()

if (collection.startsWith('hoa_') && member.value?.organization) {
  // Automatically filter collections by organization
  filter.organization = { _eq: member.value.organization }
}
```

---

## 8. SUMMARY: STRENGTHS & WEAKNESSES

### Strengths ✅

1. **Well-Structured Multi-Tenant System**
   - Clear separation between system users and org members
   - Organization context automatically set in session
   - Intuitive HOA-focused schema

2. **Flexible Authentication**
   - Supports local passwords, Google OAuth, extensible to more providers
   - Hooks allow custom HOA logic on top of native OAuth

3. **Activity Tracking**
   - Uses Directus native activity (directus_activity)
   - Automatic tracking of all operations
   - No custom schema needed

4. **Proper Invitation System**
   - HOA-specific invitation with member data collection
   - Token-based with expiration
   - Email notifications

5. **Type-Safe Data Access**
   - Full TypeScript schema definitions
   - IDE autocomplete and compile-time errors caught
   - Server-side utilities with proper typing

### Weaknesses & Concerns ⚠️

1. **Data Redundancy**
   - User names stored in 3 places (directus_users, profiles, hoa_members)
   - Emails in hoa_invitations and hoa_members not synced
   - No single source of truth for some fields

2. **Missing Sync Logic**
   - If email changes in directus_users, hoa_members.email not updated
   - No hooks for directus_users updates
   - Potential for stale data

3. **Incomplete Type Definitions**
   - types/directus.ts missing HOA collections in DirectusSchema
   - types/directus-schema.ts has more complete types
   - Inconsistent usage across codebase

4. **Client-Side Composable Issues**
   - useDirectusAuth missing member/organization properties
   - useDirectusItems expects member property that doesn't exist
   - Return type mismatches (raw array vs wrapped object)

5. **Invitation-Only Organization Joining**
   - No self-signup to existing organization
   - OAuth users cannot immediately join org
   - Must wait for invitation

6. **No Auto-Member Creation on OAuth**
   - OAuth users become system users but not org members
   - Requires separate invitation flow
   - Two-step experience for OAuth users wanting to join org

---

## 9. RECOMMENDATIONS

### Immediate Fixes (Critical)

1. **Add Email Sync Hook**
   ```javascript
   // In /extensions/hooks/hoa-auth/
   filter('items.update:directus_users', (payload) => {
     if (payload.email) {
       // Sync to hoa_members
     }
     return payload
   })
   ```

2. **Fix Client Composables**
   - Export `member` and `organization` from useDirectusAuth
   - Fix useDirectusItems return types
   - Update components using wrong data structures

3. **Complete Type Definitions**
   - Ensure types/directus.ts includes all HOA collections
   - Use consistent typing across codebase

### Medium Priority (Important)

4. **Add Self-Serve Organization Joining**
   - Allow OAuth users to create or join organizations
   - Reduce friction in onboarding

5. **Add Email Change Validation**
   - Prevent email conflicts when users change email
   - Validate against existing hoa_invitations

6. **Implement Invitation Resend**
   - Allow re-sending expired invitations
   - Cleanup expired invitations

### Low Priority (Nice-to-Have)

7. **Consolidate User Name Fields**
   - Consider computed fields for names
   - Reduce redundancy

8. **Add More OAuth Providers**
   - GitHub (already configured in types)
   - Microsoft (for enterprise)
   - SAML for enterprise deployments

---

## APPENDIX: File References

### Type Definitions
- `/home/user/605-Lincoln/types/directus-schema.ts` - Comprehensive schema
- `/home/user/605-Lincoln/types/directus.ts` - API types (needs update)

### Server Utilities
- `/home/user/605-Lincoln/server/utils/directus.ts` - Typed client factory
- `/home/user/605-Lincoln/server/utils/directus-typed.ts` - Legacy (remove)

### Authentication Endpoints
- `/home/user/605-Lincoln/server/api/auth/register.post.ts` - Signup
- `/home/user/605-Lincoln/server/api/auth/login.post.ts` - Password login
- `/home/user/605-Lincoln/server/api/auth/oauth/google/callback.get.ts` - OAuth callback

### HOA Endpoints
- `/home/user/605-Lincoln/server/api/hoa/setup-organization.post.ts` - New org setup
- `/home/user/605-Lincoln/server/api/hoa/invite-member.post.ts` - Send invite
- `/home/user/605-Lincoln/server/api/hoa/accept-invitation.post.ts` - Accept invite

### Hooks
- `/home/user/605-Lincoln/extensions/hooks/hoa-auth/index.js` - Auth hooks
- `/home/user/605-Lincoln/extensions/hooks/hoa-auth/README.md` - Deployment guide

### Documentation
- `/home/user/605-Lincoln/DIRECTUS_CONFLICTS_ANALYSIS.md` - Feature analysis
- `/home/user/605-Lincoln/DIRECTUS_MIGRATION_ANALYSIS.md` - Migration status
- `/home/user/605-Lincoln/DIRECTUS_REFACTOR.md` - Refactoring notes

---

**Generated:** 2025-11-15  
**Directus Version:** Self-hosted (with extensions support)  
**Status:** Production-ready with improvements needed
