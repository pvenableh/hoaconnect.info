# Current Profiles Collection Analysis

## Your Current Data Structure

```json
{
  "id": "9661703e-54fe-406b-a09d-efc3f18cee4b",
  "status": "published",
  "sort": null,
  "user_created": "58968fbb-5a20-4142-b1a7-9b2730300fea",
  "date_created": "2025-11-15T18:44:15.564Z",
  "user_updated": null,
  "date_updated": null,

  "display_name": "Peter Hoffman",           // ✅ KEEP
  "bio": "Lorem ipsum...",                    // ❌ REMOVE
  "avatar_url": null,                         // ✅ KEEP
  "phone": "5555555555",                      // ✅ KEEP
  "phone_verified": true,                     // ⚠️ LIKELY REMOVE
  "secondary_email": null,                    // ❌ REMOVE

  "address_line1": "123 Test Street",         // ❌ REMOVE (conflicts with hoa_units!)
  "address_line2": null,                      // ❌ REMOVE
  "city": "Miami Beach",                      // ❌ REMOVE
  "state": "FL",                              // ❌ REMOVE
  "zip": "33139",                             // ❌ REMOVE

  "company": "Hue",                           // ❌ REMOVE
  "title": "Digital Director",                // ❌ REMOVE
  "website": null,                            // ❌ REMOVE

  "newsletter_subscribed": true,              // ❌ REMOVE
  "marketing_emails": true,                   // ❌ REMOVE
  "product_updates": null,                    // ❌ REMOVE

  "timezone": "EST",                          // ✅ KEEP
  "locale": "en",                             // ✅ KEEP
  "user_id": "58968fbb-5a20-4142-b1a7-9b2730300fea", // ✅ KEEP

  "onboarding_completed": true,               // ⚠️ SIMPLIFY (move to directus_users?)
  "onboard_step": 8,                          // ⚠️ SIMPLIFY
  "profile_completion": 5,                    // ❌ REMOVE

  "metadata": null                            // ✅ KEEP
}
```

---

## 🚨 Critical Issue: Address Data Conflict

### The Problem

You're storing addresses in **TWO places**:

```
profiles.address_line1 = "123 Test Street"
profiles.city = "Miami Beach"
profiles.state = "FL"
profiles.zip = "33139"

VS

hoa_units.street_address = "???"
hoa_units.city = "???"
hoa_units.state = "???"
hoa_units.zip_code = "???"
```

### Which Address Is This?

Is Peter Hoffman's address in `profiles`:
- ✅ His **personal mailing address** (where he lives)?
- ✅ His **HOA property address** (the unit he owns)?
- ❌ Something else entirely?

### The HOA Use Case

In HOA management, you typically need:

1. **Property Address** - The HOA unit (123 Oak Lane, Unit 4B)
   - Stored in: `hoa_units.street_address/city/state/zip_code`
   - Linked via: `hoa_members.unit` (FK to hoa_units)

2. **Mailing Address** - Where to send correspondence (could be different!)
   - Example: Owner lives in NYC but owns condo in Miami
   - Should this be in `profiles`? Or in `hoa_members` (org-specific)?

### Recommended Solution

**Option A: Property Address Only (Most Common)**
```
Remove from profiles: address_line1, address_line2, city, state, zip

Use instead:
hoa_members → hoa_units → street_address, city, state, zip_code
```

**Option B: Support Mailing Address (If Needed)**
```
Rename in profiles:
address_line1 → mailing_address_line1
city → mailing_city
state → mailing_state
zip → mailing_zip

Keep property address in:
hoa_units.street_address, city, state, zip_code
```

**Option C: Move to hoa_members (Org-Specific)**
```
Remove from profiles entirely

Add to hoa_members:
mailing_address_line1, mailing_city, mailing_state, mailing_zip

Why? Mailing preferences might differ per organization
```

**My Recommendation:** **Option A** unless you have a specific use case for mailing addresses different from property addresses.

---

## ❌ Fields to Remove

### 1. Bio
```json
"bio": "Lorem ipsum dolor sit amet..."
```
**Why Remove:**
- HOA is not a social network
- Residents don't need public bios
- Adds unnecessary UI complexity

**Typical Use Cases:**
- Social media profiles
- Professional networking sites
- Content creator platforms

**HOA Alternative:**
- If you need "notes about resident" → Add `admin_notes` to `hoa_members` (only visible to admins)

---

### 2. Address Fields (See Critical Issue Above)
```json
"address_line1": "123 Test Street",
"address_line2": null,
"city": "Miami Beach",
"state": "FL",
"zip": "33139"
```
**Why Remove:**
- Conflicts with `hoa_units` data model
- Creates data sync issues
- Unclear which address this represents

**HOA Solution:**
```typescript
// Get property address
const member = await directus.items('hoa_members').readOne(memberId, {
  fields: ['*', 'unit.street_address', 'unit.city', 'unit.state', 'unit.zip_code']
})

console.log(member.unit.street_address) // "123 Oak Lane, Unit 4B"
```

---

### 3. Professional Fields
```json
"company": "Hue",
"title": "Digital Director",
"website": null
```
**Why Remove:**
- Not relevant to HOA management
- Privacy concern (many residents won't want to share)
- LinkedIn-style features don't fit HOA use case

**Exceptions:**
- If you're building a "resident directory" with optional professional info → Keep, but make **entirely optional**
- Consider: Do board members want their job titles visible? Do residents?

---

### 4. Marketing Preferences
```json
"newsletter_subscribed": true,
"marketing_emails": true,
"product_updates": null
```
**Why Remove:**
- This is **SaaS product** language, not HOA language
- HOAs send "community updates" not "product updates"
- Better location: `directus_users` email preferences

**HOA Solution:**

**Option A: Use directus_users Preferences**
```typescript
// Directus has native email notification settings
directus_users.email_notifications = true/false
```

**Option B: Create notification_preferences Collection (If Complex)**
```sql
CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES directus_users(id),

  -- HOA-specific notifications
  board_meeting_reminders boolean DEFAULT true,
  community_announcements boolean DEFAULT true,
  maintenance_alerts boolean DEFAULT true,
  financial_statements boolean DEFAULT true,
  emergency_alerts boolean DEFAULT true,

  -- Delivery preferences
  email_enabled boolean DEFAULT true,
  sms_enabled boolean DEFAULT false,
  push_enabled boolean DEFAULT true
);
```

**My Recommendation:** Start with `directus_users.email_notifications`, add dedicated table only if you need granular control.

---

### 5. Secondary Email
```json
"secondary_email": null
```
**Why Remove:**
- Adds verification complexity
- Primary email in `directus_users.email` is sufficient for most HOAs
- Increases support burden ("Which email did you send it to?")

**Exception:**
- If you have a use case for "personal email" vs "work email" → Consider, but unlikely for HOA

---

### 6. Profile Completion Percentage
```json
"profile_completion": 5
```
**Why Remove:**
- Only useful for social networks trying to increase engagement
- HOAs don't need gamification
- Creates maintenance burden (recalculate on every field update)

**Exception:**
- If you're tracking onboarding tasks for new members → Use simpler boolean flags

---

## ⚠️ Fields to Simplify

### Phone Verification
```json
"phone_verified": true
```
**Current:** Full verification system
**Question:** Do you actually verify phone numbers programmatically?

**Recommendations:**

**If you DON'T verify:**
```sql
-- Remove the field entirely
ALTER TABLE profiles DROP COLUMN phone_verified;
```

**If you DO verify (SMS/voice):**
```sql
-- Keep it, but add verification timestamp
ALTER TABLE profiles ADD COLUMN phone_verified_at timestamp;
```

**If you MIGHT verify later:**
```sql
-- Keep the boolean, default to false
phone_verified boolean DEFAULT false
```

---

### Onboarding Tracking
```json
"onboarding_completed": true,
"onboard_step": 8
```

**Current:** Step-by-step onboarding (8 steps?)

**Questions:**
1. What are the 8 onboarding steps?
2. Are these user-facing steps or admin setup?
3. Does onboarding differ per organization?

**Recommendations:**

**Option A: Simplify to Boolean**
```sql
-- Just track if they completed initial setup
onboarding_completed boolean DEFAULT false
-- Remove: onboard_step
```

**Option B: Use Metadata**
```json
{
  "metadata": {
    "onboarding": {
      "completed": true,
      "steps": {
        "profile": true,
        "payment": true,
        "documents": true,
        "tour": true
      },
      "completed_at": "2025-11-15T18:44:15.564Z"
    }
  }
}
```

**Option C: Dedicated Onboarding Table (If Complex)**
```sql
CREATE TABLE user_onboarding (
  user_id uuid PRIMARY KEY,
  profile_setup boolean DEFAULT false,
  payment_method_added boolean DEFAULT false,
  documents_reviewed boolean DEFAULT false,
  welcome_tour_completed boolean DEFAULT false,
  completed_at timestamp
);
```

**My Recommendation:** **Option A** (boolean) for MVP, **Option B** (metadata) if you need flexibility without schema changes.

---

## ✅ Fields to Keep

### Essential User Data
```json
"user_id": "58968fbb-5a20-4142-b1a7-9b2730300fea",  // ✅ Required FK
"display_name": "Peter Hoffman",                     // ✅ Preferred name
"avatar_url": null,                                  // ✅ Profile photo
"phone": "5555555555",                               // ✅ HOA contact
"timezone": "EST",                                   // ✅ Meeting times
"locale": "en",                                      // ✅ i18n support
"metadata": null                                     // ✅ Flexibility
```

### System Fields (Keep)
```json
"id": "...",
"status": "published",
"date_created": "2025-11-15T18:44:15.564Z",
"date_updated": null,
"user_created": "...",
"user_updated": null
```

---

## 🏗️ Recommended Schema Changes

### Remove These Columns
```sql
ALTER TABLE profiles
  DROP COLUMN IF EXISTS bio,
  DROP COLUMN IF EXISTS secondary_email,
  DROP COLUMN IF EXISTS address_line1,
  DROP COLUMN IF EXISTS address_line2,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS state,
  DROP COLUMN IF EXISTS zip,
  DROP COLUMN IF EXISTS company,
  DROP COLUMN IF EXISTS title,
  DROP COLUMN IF EXISTS website,
  DROP COLUMN IF EXISTS newsletter_subscribed,
  DROP COLUMN IF EXISTS marketing_emails,
  DROP COLUMN IF EXISTS product_updates,
  DROP COLUMN IF EXISTS profile_completion;
```

### Optional: Simplify Onboarding
```sql
-- Keep boolean, remove step tracking
ALTER TABLE profiles DROP COLUMN IF EXISTS onboard_step;
```

### Optional: Remove Phone Verification
```sql
-- Only if you don't actually verify
ALTER TABLE profiles DROP COLUMN IF EXISTS phone_verified;
```

### Add Missing Field (If Using OAuth)
```sql
-- Track Google OAuth connection
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_id varchar(255);
CREATE INDEX IF NOT EXISTS idx_profiles_google ON profiles(google_id);
```

---

## 📊 Final Minimal Schema

```sql
CREATE TABLE profiles (
  -- System
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(20) DEFAULT 'active',
  sort integer,
  user_created uuid REFERENCES directus_users(id),
  date_created timestamp DEFAULT CURRENT_TIMESTAMP,
  user_updated uuid REFERENCES directus_users(id),
  date_updated timestamp,

  -- User Reference
  user_id uuid UNIQUE NOT NULL REFERENCES directus_users(id) ON DELETE CASCADE,

  -- Display
  display_name varchar(255),
  avatar_url varchar(500),

  -- Contact
  phone varchar(50),
  phone_verified boolean DEFAULT false,  -- Optional: remove if not verifying

  -- OAuth
  google_id varchar(255),

  -- Localization
  timezone varchar(100) DEFAULT 'America/New_York',
  locale varchar(10) DEFAULT 'en-US',

  -- Onboarding
  onboarding_completed boolean DEFAULT false,

  -- Flexibility
  metadata jsonb
);

CREATE INDEX idx_profiles_user ON profiles(user_id);
CREATE INDEX idx_profiles_google ON profiles(google_id);
CREATE INDEX idx_profiles_status ON profiles(status);
```

**Total Fields:** ~17 fields (including system fields)
**Down From:** ~30+ fields

---

## 🎯 Separate O2M Collections (As You Mentioned)

Great approach for structured data you need to query!

### Pets Collection
```sql
CREATE TABLE hoa_pets (
  id uuid PRIMARY KEY,
  member_id uuid REFERENCES hoa_members(id),  -- Org-specific!

  name varchar(100),
  type varchar(50),          -- dog, cat, bird, etc.
  breed varchar(100),
  weight numeric(5,2),
  color varchar(50),
  registration_number varchar(100),

  status varchar(20) DEFAULT 'active',
  date_created timestamp,
  date_updated timestamp
);
```

**Why `member_id` not `user_id`?**
- Pet registrations are **org-specific**
- Same user might own units in multiple HOAs
- Each HOA has different pet policies

### Vehicles Collection
```sql
CREATE TABLE hoa_vehicles (
  id uuid PRIMARY KEY,
  member_id uuid REFERENCES hoa_members(id),  -- Org-specific!

  make varchar(100),
  model varchar(100),
  year integer,
  color varchar(50),
  license_plate varchar(20),
  parking_spot varchar(50),

  status varchar(20) DEFAULT 'active',
  date_created timestamp,
  date_updated timestamp
);
```

### Emergency Contacts
```sql
CREATE TABLE emergency_contacts (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES directus_users(id),  -- Could be user-level
  -- OR
  member_id uuid REFERENCES hoa_members(id),   -- Or org-specific

  name varchar(255),
  relationship varchar(100),
  phone varchar(50),
  email varchar(255),
  priority integer DEFAULT 1,  -- 1 = primary, 2 = secondary

  date_created timestamp
);
```

---

## 🔄 Migration Strategy

### Step 1: Export Important Data (Backup)
```sql
-- Backup any address data
CREATE TABLE profiles_address_backup AS
SELECT
  id,
  user_id,
  address_line1,
  address_line2,
  city,
  state,
  zip,
  date_created
FROM profiles
WHERE address_line1 IS NOT NULL;

-- Backup professional data (if anyone cares)
CREATE TABLE profiles_professional_backup AS
SELECT id, user_id, company, title, website
FROM profiles
WHERE company IS NOT NULL OR title IS NOT NULL;
```

### Step 2: Analyze Data
```sql
-- How many profiles have address data?
SELECT COUNT(*) FROM profiles WHERE address_line1 IS NOT NULL;

-- How many have professional data?
SELECT COUNT(*) FROM profiles WHERE company IS NOT NULL;

-- How many verified phones?
SELECT COUNT(*) FROM profiles WHERE phone_verified = true;
```

### Step 3: Drop Unnecessary Columns
```sql
-- Run the ALTER TABLE statements above
-- Start with clearly unnecessary fields (bio, company, etc.)
-- Hold off on address fields until you decide Option A/B/C
```

### Step 4: Update Application Code
- Remove form fields for deleted columns
- Update TypeScript interfaces
- Remove validation rules
- Update display components

---

## 📝 Updated TypeScript Interface

```typescript
export interface Profile {
  // System
  id: ID
  status: 'active' | 'inactive' | 'suspended'
  sort?: number | null
  user_created?: ID | DirectusUser
  date_created?: string
  user_updated?: ID | DirectusUser | null
  date_updated?: string | null

  // User Reference
  user_id: ID | DirectusUser

  // Display
  display_name?: string | null
  avatar_url?: string | null

  // Contact
  phone?: string | null
  phone_verified?: boolean  // Optional: remove if not verifying

  // OAuth
  google_id?: string | null

  // Localization
  timezone?: string | null
  locale?: string | null

  // Onboarding
  onboarding_completed?: boolean

  // Flexibility
  metadata?: Record<string, any> | null
}
```

---

## ✅ Recommendations Summary

### Remove Immediately
- ✅ `bio` - Not needed for HOA
- ✅ `company`, `title`, `website` - Not relevant
- ✅ `newsletter_subscribed`, `marketing_emails`, `product_updates` - Wrong model
- ✅ `profile_completion` - Gamification not needed

### Decide Based on Use Case
- ⚠️ **Address fields** - Conflicts with `hoa_units`, pick Option A/B/C
- ⚠️ `secondary_email` - Remove unless you have specific use case
- ⚠️ `phone_verified` - Remove if you don't verify programmatically

### Simplify
- ⚠️ Onboarding - Keep `onboarding_completed`, remove `onboard_step`, or move to metadata

### Keep
- ✅ `user_id`, `display_name`, `avatar_url`, `phone`, `timezone`, `locale`, `metadata`

### Add
- ✅ `google_id` - Track OAuth connections

### Create as O2M
- ✅ `hoa_pets` collection (member_id FK)
- ✅ `hoa_vehicles` collection (member_id FK)
- ✅ `emergency_contacts` collection (user_id or member_id FK)

---

## 🤔 Questions for You

1. **Address fields:** Do you need to support mailing addresses different from property addresses?
2. **Phone verification:** Do you actually verify phone numbers with SMS codes?
3. **Onboarding:** What are the 8 onboarding steps? Are they user-facing or admin setup?
4. **Professional data:** Do you want residents to optionally share company/title in a directory?
5. **Notifications:** What types of notifications do HOA members need?

Let me know your answers and I can provide more specific migration scripts!
