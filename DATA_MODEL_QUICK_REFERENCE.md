# Data Model & OAuth Quick Reference

## Core Collections

### 1. `directus_users` (System)
- **Purpose:** Authentication credentials
- **Key Fields:** email, password, first_name, last_name, provider, external_identifier, auth_data
- **Relations:** 1:1 → profiles, 1:N → hoa_members

### 2. `profiles` (1:1 with directus_users)
- **Purpose:** Extended user profile data
- **Key Fields:** user_id, display_name, google_id, avatar_url, address_*, phone, timezone, etc.
- **Created By:** Auth hook on user creation (automatic)
- **OAuth Data Captured:** display_name, google_id, avatar_url

### 3. `hoa_members` (Organization membership)
- **Purpose:** Link users to organizations with roles
- **Key Fields:** user (FK→users), organization (FK→orgs), role (FK→roles), first_name, last_name, email, phone, member_type
- **Created By:** Organization setup OR invitation acceptance
- **Critical:** Users can have MULTIPLE hoa_members (one per org)

### 4. `hoa_organizations` (Multi-tenant)
- **Purpose:** Top-level HOA organization records
- **Key Fields:** name, slug (unique), street_address, city, state, zip, phone, email, settings, subscription_plan
- **Relations:** 1:N → hoa_members, 1:N → hoa_invitations, 1:N → hoa_units

### 5. `hoa_invitations`
- **Purpose:** Member invitations to organizations
- **Key Fields:** email, organization, role, invited_by, token (64-char hex), invitation_status, expires_at (7 days)
- **Flow:** Create → Email with token → Accept (creates directus_user + hoa_member)

---

## Data Flow Overview

### Regular Signup
```
Form input → directus_users → profiles (via hook)
Result: User created, NO org context
```

### Google OAuth
```
Google login → directus_users → profiles (via hook)
Result: User created, NO org context (must be invited to org)
```

### Organization Setup
```
Admin form → hoa_organizations + directus_users + hoa_members + profiles (via hook)
Result: User created AS ORG ADMIN with full org context
```

### Member Invitation
```
Admin invite → hoa_invitations
↓
Member accepts → directus_users + hoa_members + profiles (via hook)
Result: User created as ORG MEMBER with org context
```

---

## OAuth Data Mapping (Google)

| Source | Destination | Field |
|--------|-------------|-------|
| `email` | directus_users.email | Email address |
| `given_name` | directus_users.first_name | First name |
| `family_name` | directus_users.last_name | Last name |
| `picture` | profiles.avatar_url | Avatar URL |
| `sub` | directus_users.external_identifier + profiles.google_id | Google user ID |
| (auto) | directus_users.provider | Set to "google" |
| (auto) | directus_users.status | Set to "active" |
| (auto) | profiles.status | Set to "active" |

---

## Key Findings

### Strengths ✅
1. **Well-structured multi-tenant architecture** - Clear separation of concerns
2. **Automatic profile creation** - Via Directus hooks (items.create)
3. **Flexible authentication** - Supports local + Google OAuth
4. **Activity tracking** - Uses native directus_activity (auto-tracked)
5. **Type-safe server code** - Full TypeScript schema definitions

### Issues ⚠️
1. **Data redundancy:**
   - User names stored in 3 places: directus_users, profiles, hoa_members
   - Email stored in: directus_users, hoa_members, hoa_invitations
   - No sync when directus_users.email changes

2. **Client-side type mismatches:**
   - useDirectusAuth missing `member` and `organization` exports
   - useDirectusItems expects member property (doesn't exist)
   - Component return type mismatches (raw array vs wrapped object)

3. **Type definition gaps:**
   - types/directus.ts missing HOA collections in DirectusSchema
   - Inconsistent types across codebase (have directus-schema.ts but also directus.ts)

4. **OAuth UX:**
   - New OAuth users must be invited to org (two-step experience)
   - No self-serve org creation for OAuth users

---

## Collection Relationships

```
directus_users (1) ←──── profiles (1:1)
    ↓
 (1:N) ↓
 role ↓
    ↓
directus_roles
    ↑
    │ assigned to
    │
hoa_invitations ────→ (1:N) hoa_members (N:1) ←───── (N:N) hoa_organizations
                                                      │
                                                      ├→ (1:N) hoa_units
                                                      └→ (1:N) hoa_documents
```

---

## What Happens During OAuth Login

### New User (doesn't exist):
1. ✅ Create directus_user (email, first_name, last_name, provider="google", external_identifier)
2. ✅ Hook creates profile (display_name, google_id)
3. ❌ NO hoa_member created (needs invite to org)
4. Session: { user, directusAccessToken, organization: null, member_id: null }

### Existing User (has hoa_member):
1. ✅ Update directus_user (refresh OAuth data)
2. ✅ Skip profile creation (already exists)
3. ✅ Query hoa_members for org context
4. Session: { user, directusAccessToken, organization: "uuid", member_id: "uuid" }

---

## Recommended Fixes

### Critical (Breaks functionality)
- [ ] Add email sync hook (when directus_users.email changes → hoa_members.email)
- [ ] Fix useDirectusAuth to export member and organization
- [ ] Fix useDirectusItems return type inconsistencies
- [ ] Complete type definitions in directus.ts

### Important
- [ ] Add self-serve org creation for OAuth users
- [ ] Implement invitation resend/management UI
- [ ] Add email change validation

### Nice-to-have
- [ ] Use computed fields for names (reduce redundancy)
- [ ] Add more OAuth providers (GitHub, Microsoft)
- [ ] Consolidate utility files (directus.ts vs directus-typed.ts)

---

## File References

**Types:**
- `/types/directus-schema.ts` - Comprehensive schema ✅
- `/types/directus.ts` - API types (needs updating)

**Server Utilities:**
- `/server/utils/directus.ts` - Typed client factory

**Auth Endpoints:**
- `/server/api/auth/register.post.ts` - Signup
- `/server/api/auth/login.post.ts` - Login
- `/server/api/auth/oauth/google/callback.get.ts` - OAuth callback

**HOA Endpoints:**
- `/server/api/hoa/setup-organization.post.ts` - New org setup
- `/server/api/hoa/invite-member.post.ts` - Send invite
- `/server/api/hoa/accept-invitation.post.ts` - Accept invite

**Hooks:**
- `/extensions/hooks/hoa-auth/index.js` - Authentication hooks

**Documentation:**
- `/DATA_MODEL_ANALYSIS.md` - Full detailed analysis (this file)
- `/DIRECTUS_CONFLICTS_ANALYSIS.md` - Feature overlap analysis
- `/DIRECTUS_MIGRATION_ANALYSIS.md` - Migration status

---

**Status:** Production-ready with improvements needed  
**Generated:** 2025-11-15  
**Analysis Type:** Comprehensive data model & OAuth configuration review
