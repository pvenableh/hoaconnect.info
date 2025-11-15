# Data Model Visual Guide

## 1. Complete Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        AUTHENTICATION & USER CREATION                        │
└──────────────────────────────────────────────────────────────────────────────┘

SCENARIO A: Regular Signup
─────────────────────────
  Signup Form
      ↓
      ├─→ POST /api/auth/register.post.ts
      │
      ├─→ Create directus_user
      │   ├─ email: "user@example.com"
      │   ├─ password: hashed
      │   ├─ first_name, last_name
      │   ├─ provider: "local"
      │   └─ status: "active"
      │
      └─→ Hook: items.create (directus_users)
          │
          └─→ Auto-create profile
              ├─ user_id: (from user)
              ├─ display_name: "{first_name} {last_name}"
              └─ status: "active"

Result: User created, NO organization context
Session: { user, directusAccessToken, organization: null }


SCENARIO B: Google OAuth
────────────────────────
  "Sign in with Google" Button
      ↓
      ├─→ Redirect to Google Auth
      │
      ├─→ Google OAuth Callback: /api/auth/oauth/google/callback.get.ts
      │
      ├─→ Check if user exists (by email)
      │   │
      │   ├─ YES → Update existing user's OAuth fields
      │   │
      │   └─ NO → Create NEW directus_user
      │       ├─ email: (from Google)
      │       ├─ first_name: (from Google given_name)
      │       ├─ last_name: (from Google family_name)
      │       ├─ provider: "google"
      │       ├─ external_identifier: (from Google sub)
      │       ├─ auth_data: (full Google profile)
      │       └─ status: "active"
      │
      └─→ Hook: items.create (directus_users)
          │
          └─→ Auto-create profile
              ├─ user_id: (from user)
              ├─ display_name: "{first_name} {last_name}"
              ├─ google_id: (from external_identifier)
              ├─ avatar_url: (from Google picture, optional)
              └─ status: "active"

      ├─→ Query hoa_members
      │   │
      │   ├─ FOUND → Organization exists
      │   │           Session: { user, organization, member_id }
      │   │
      │   └─ NOT FOUND → No organization
      │                   Session: { user, organization: null }
      │
      └─→ Redirect to /dashboard

Result: User created, organization context SET ONLY IF already member


SCENARIO C: Organization Setup
───────────────────────────────
  "Create New Organization" Form
      ↓
      ├─→ POST /api/hoa/setup-organization.post.ts
      │
      ├─→ Create hoa_organizations
      │   ├─ name: "605 Lincoln Road HOA"
      │   ├─ slug: "605-lincoln" (must be unique)
      │   ├─ street_address, city, state, zip
      │   ├─ phone, email
      │   └─ status: "published"
      │
      ├─→ Create directus_user (admin)
      │   ├─ email, password, first_name, last_name
      │   ├─ role: "HOA Admin"
      │   ├─ provider: "local"
      │   └─ status: "active"
      │
      ├─→ Hook: items.create (directus_users)
      │   │
      │   └─→ Auto-create profile
      │
      ├─→ Create hoa_members (link user to org as admin)
      │   ├─ user: (new user id)
      │   ├─ organization: (new org id)
      │   ├─ role: "HOA Admin"
      │   ├─ first_name, last_name, email, phone
      │   ├─ member_type: "owner"
      │   └─ status: "published"
      │
      ├─→ Auto-login user
      │   └─→ Set session with organization context
      │       Session: { user, organization: (org id), member_id: (member id) }
      │
      └─→ Send welcome email

Result: User + Organization + Member + Profile all created together


SCENARIO D: Member Invitation Flow
───────────────────────────────────
  Step 1: Admin sends invitation
  ─────────────────────────────
    POST /api/hoa/invite-member.post.ts
        ↓
        ├─→ Create hoa_invitations
        │   ├─ email: "newmember@example.com"
        │   ├─ organization: (org id)
        │   ├─ role: (role id)
        │   ├─ invited_by: (admin id)
        │   ├─ token: randomBytes(32).toString('hex') ← 64-char hex
        │   ├─ invitation_status: "pending"
        │   ├─ expires_at: (7 days from now)
        │   └─ status: "published"
        │
        └─→ Send email with link: /hoa/accept-invite?token={token}

  Step 2: Member accepts invitation
  ──────────────────────────────────
    POST /api/hoa/accept-invitation.post.ts
        ↓
        ├─→ Validate token
        │   ├─ Find in hoa_invitations
        │   ├─ Check status = "pending"
        │   ├─ Check not expired
        │   └─ Check email not already registered
        │
        ├─→ Create directus_user
        │   ├─ email: (from invitation)
        │   ├─ password: (from form)
        │   ├─ first_name, last_name: (from form)
        │   ├─ role: (from invitation)
        │   ├─ provider: "local"
        │   └─ status: "active"
        │
        ├─→ Hook: items.create (directus_users)
        │   │
        │   └─→ Auto-create profile
        │
        ├─→ Create hoa_members
        │   ├─ user: (new user id)
        │   ├─ organization: (from invitation)
        │   ├─ role: (from invitation)
        │   ├─ first_name, last_name, email, phone: (from form)
        │   ├─ member_type: "owner"
        │   └─ status: "published"
        │
        ├─→ Update hoa_invitations
        │   ├─ invitation_status: "accepted"
        │   └─ accepted_at: (now)
        │
        ├─→ Auto-login user
        │   └─→ Set session with organization context
        │
        └─→ Send notification email to inviter

Result: User + Member + Profile created, ready to use organization


┌──────────────────────────────────────────────────────────────────────────────┐
│                           OAUTH DATA MAPPING                                 │
└──────────────────────────────────────────────────────────────────────────────┘

Google OAuth Response
─────────────────────
{
  sub: "115237018652...",           ──────┐
  email: "user@gmail.com",          ──┐   │
  given_name: "John",               ──┤   │
  family_name: "Doe",               ──┤   │
  picture: "https://...",           ──┤   │
  email_verified: true              ──┤   │
}                                       │   │
                                        │   │
                    ┌───────────────────┘   │
                    │                       │
                    ↓                       ↓
         directus_users            profiles
         ──────────────            ────────
         email ◄──────────────────────┘
         first_name ◄────────────────────── given_name
         last_name  ◄────────────────────── family_name
         external_identifier ◄────────────── sub
         provider = "google"                 
         auth_data = {full response}    google_id ◄──── sub
                                        display_name ◄── "{given_name} {family_name}"
                                        avatar_url ◄──── picture


┌──────────────────────────────────────────────────────────────────────────────┐
│                        COLLECTION STRUCTURE                                   │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ directus_users (System Collection)                              │
├─────────────────────────────────────────────────────────────────┤
│ id           │ email             │ password (hashed)            │
│ first_name   │ last_name         │ provider (local/google/...)  │
│ external_id  │ auth_data         │ role (FK→roles)              │
│ status       │ date_created      │ date_updated                 │
└─────────────────────────────────────────────────────────────────┘
                      ↓ 1:1
┌─────────────────────────────────────────────────────────────────┐
│ profiles (Application Collection)                               │
├─────────────────────────────────────────────────────────────────┤
│ id           │ user_id (FK→users)   │ display_name              │
│ bio          │ avatar_url           │ google_id                 │
│ google_profile│ phone               │ phone_verified            │
│ address_*    │ timezone             │ locale                    │
│ company      │ job_title            │ website                   │
│ status       │ date_created         │ date_updated              │
│ metadata     │ onboarding_completed │ profile_completed_%      │
└─────────────────────────────────────────────────────────────────┘
       ↑ 1:1                         ↑ N:N
       │                             │
       └──────────────┬──────────────┘
                      │
┌─────────────────────────────────────────────────────────────────┐
│ hoa_members (Application Collection - Core)                     │
├─────────────────────────────────────────────────────────────────┤
│ id           │ user (FK→users)      │ organization (FK→orgs)    │
│ role (FK→roles)  │ first_name       │ last_name                │
│ email        │ phone               │ member_type              │
│ status       │ date_created        │ date_updated             │
└─────────────────────────────────────────────────────────────────┘
       ↑ N:1                         ↑ 1:N
       │                             │
       └──────────────┬──────────────┘
                      │
┌─────────────────────────────────────────────────────────────────┐
│ hoa_organizations (Multi-tenant Root)                           │
├─────────────────────────────────────────────────────────────────┤
│ id           │ name                 │ slug (unique)             │
│ street_address  │ city              │ state                    │
│ zip          │ phone               │ email                    │
│ custom_domain│ domain_verified     │ subscription_plan        │
│ settings     │ member_count        │ status                   │
│ date_created │ date_updated        │                          │
└─────────────────────────────────────────────────────────────────┘
       ↑ 1:N                         ↑ 1:N
       │                             │
       │                    ┌────────┘
       │                    │
┌─────────────────────────────────────────────────────────────────┐
│ hoa_invitations (Invitation tracking)                           │
├─────────────────────────────────────────────────────────────────┤
│ id           │ email               │ organization (FK→orgs)    │
│ role (FK→roles)  │ invited_by (FK→users) │ token              │
│ invitation_status│ expires_at         │ accepted_at            │
│ status       │ date_created        │                          │
└─────────────────────────────────────────────────────────────────┘

KEY: FK = Foreign Key, ↓ = 1:1 relation, → = 1:N relation


┌──────────────────────────────────────────────────────────────────────────────┐
│                    MULTI-TENANT DATA ISOLATION                               │
└──────────────────────────────────────────────────────────────────────────────┘

User "john@example.com" is member of 2 organizations:

hoa_members table:
┌────────────┬──────────────────┬────────────────────┬──────┐
│ user       │ organization     │ role               │ id   │
├────────────┼──────────────────┼────────────────────┼──────┤
│ john_uuid  │ org-605-lincoln  │ HOA Admin          │ m1   │  ← Org 1
│ john_uuid  │ org-elm-street   │ Board Member       │ m2   │  ← Org 2
└────────────┴──────────────────┴────────────────────┴──────┘

On login, session is set to first member's org:
{
  user: { id: john_uuid, email: "john@example.com", ... },
  organization: "org-605-lincoln",        ← Only org 1
  member_id: "m1"
}

User can switch org context in UI (multiple tabs/sidebar)
or visit different org URLs (e.g., /605-lincoln/dashboard vs /elm-street/dashboard)


┌──────────────────────────────────────────────────────────────────────────────┐
│                      SESSION CONTEXT & TOKENS                                │
└──────────────────────────────────────────────────────────────────────────────┘

On successful login/registration:

session = {
  user: {
    id: "uuid-123",
    email: "user@example.com",
    first_name: "John",
    last_name: "Doe",
    role: { id, name, permissions },
    organization: "uuid-org-abc",    ← Multi-tenant context
    member_id: "uuid-member-456"     ← User's member record in org
  },
  directusAccessToken: "token...",
  directusRefreshToken: "refresh...",
  expiresAt: timestamp
}

Token Flow:
1. Sent in HTTP-only cookies (secure)
2. Used for subsequent API requests
3. Auto-refreshed before expiration
4. API endpoints use session.directusAccessToken for Directus SDK


┌──────────────────────────────────────────────────────────────────────────────┐
│                    REDUNDANCY HOTSPOTS                                       │
└──────────────────────────────────────────────────────────────────────────────┘

⚠️ User Names (stored in 3 places):
   directus_users.first_name
   directus_users.last_name
   ↓
   profiles.display_name (derived)
   ↓
   hoa_members.first_name
   hoa_members.last_name

Problem: If directus_users.first_name changes, others don't sync
Solution: Use hook to sync OR use computed field OR FK instead

⚠️ Email Address (stored in 3 places):
   directus_users.email (primary)
   hoa_members.email (copy, not synced)
   hoa_invitations.email (from form, not synced)

Problem: Stale email if user changes directus_users.email
Solution: Add hook to sync email updates to hoa_members


┌──────────────────────────────────────────────────────────────────────────────┐
│                         GOOGLE OAUTH SEQUENCE                                │
└──────────────────────────────────────────────────────────────────────────────┘

User clicks "Sign in with Google"
    │
    ├─→ Redirect: https://accounts.google.com/o/oauth2/auth?...
    │
    ├─→ User logs in at Google (or grants permission)
    │
    ├─→ Google redirects to: /api/auth/oauth/google/callback?code=XXX&state=YYY
    │
    ├─→ Backend exchanges code for tokens
    │
    ├─→ Backend fetches user info from Google
    │   {
    │     sub: "115237...",
    │     email: "user@gmail.com",
    │     given_name: "John",
    │     family_name: "Doe",
    │     picture: "https://..."
    │   }
    │
    ├─→ Check if user exists by email
    │   │
    │   ├─ IF EXISTS:
    │   │  ├─ Update user's OAuth fields (optional)
    │   │  └─ Proceed to login
    │   │
    │   └─ IF NEW:
    │      ├─ Create directus_user
    │      └─ Hook auto-creates profile
    │
    ├─→ Query hoa_members for organization
    │   │
    │   ├─ IF FOUND: Set organization in session
    │   └─ IF NOT FOUND: Leave organization null
    │
    ├─→ Create session with tokens
    │
    └─→ Redirect to /dashboard

Total time: ~500-1000ms (including redirects)
