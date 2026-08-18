# Directus Collections for Payment System

This document outlines the required Directus collections for the Stripe payment system integration.

## Collections Overview

### 1. `payment_transactions`
Stores all payment transactions made through Stripe.

**Fields:**
```
- id (UUID, primary key)
- status (string, required) - 'pending', 'succeeded', 'failed', 'canceled', 'refunded'
- date_created (timestamp)
- date_updated (timestamp)
- user_created (many-to-one → directus_users)
- user_updated (many-to-one → directus_users)

Payment Details:
- organization (many-to-one → hoa_organizations, required)
- member (many-to-one → hoa_members, nullable) - The member who made the payment
- payment_request (many-to-one → payment_requests, nullable) - Link to request if paying a specific request
- amount (decimal, required) - Amount in dollars (e.g., 150.00)
- currency (string, default: 'usd')
- description (text, nullable)

Stripe Fields:
- stripe_payment_intent_id (string, unique, required)
- stripe_charge_id (string, nullable)
- stripe_customer_id (string, nullable)
- stripe_payment_method_id (string, nullable)
- payment_method_type (string) - 'card', 'us_bank_account'
- last4 (string, nullable) - Last 4 digits of card/account
- receipt_url (string, nullable)
- receipt_email (string, nullable)

Fees & Processing:
- processing_fee (decimal, nullable) - Stripe processing fee
- net_amount (decimal, nullable) - Amount after fees

Metadata:
- metadata (json, nullable) - Additional Stripe metadata
- notes (text, nullable) - Internal notes
```

**Permissions:**
- Admin: Full access
- Member: Read (own records only), Create
- Public: No access

---

### 2. `payment_requests`
Allows admins to request payments from members (HOA dues, assessments, etc.).

**Fields:**
```
- id (UUID, primary key)
- status (string, required) - 'draft', 'active', 'paid', 'partially_paid', 'overdue', 'canceled'
- date_created (timestamp)
- date_updated (timestamp)
- user_created (many-to-one → directus_users)
- user_updated (many-to-one → directus_users)

Request Details:
- organization (many-to-one → hoa_organizations, required)
- member (many-to-one → hoa_members, required) - Member who needs to pay
- request_type (string, required) - 'monthly_dues', 'assessment', 'late_fee', 'other'
- title (string, required) - e.g., "January 2025 HOA Dues"
- description (text, nullable)
- amount (decimal, required) - Amount requested in dollars
- due_date (date, nullable)

Payment Tracking:
- amount_paid (decimal, default: 0) - Total amount paid so far
- amount_remaining (decimal) - Calculated: amount - amount_paid
- paid_at (timestamp, nullable)
- transactions (one-to-many → payment_transactions) - Related payments

Notifications:
- email_sent (boolean, default: false)
- email_sent_at (timestamp, nullable)
- reminder_sent (boolean, default: false)
- reminder_sent_at (timestamp, nullable)

Metadata:
- notes (text, nullable)
- metadata (json, nullable)
```

**Permissions:**
- Admin: Full access
- Member: Read (own records only)
- Public: No access

**Triggers/Hooks:**
- When status changes to 'paid', update `paid_at` timestamp
- When creating a request, send email notification to member
- Calculate `amount_remaining` automatically

---

### 3. `payment_schedules` (Optional - for recurring payments)
Manages recurring payment schedules for HOA dues.

**Fields:**
```
- id (UUID, primary key)
- status (string, required) - 'active', 'paused', 'completed', 'canceled'
- date_created (timestamp)
- date_updated (timestamp)

Schedule Details:
- organization (many-to-one → hoa_organizations, required)
- member (many-to-one → hoa_members, required)
- title (string, required) - e.g., "Monthly HOA Dues"
- description (text, nullable)
- amount (decimal, required)
- frequency (string, required) - 'monthly', 'quarterly', 'annually'
- start_date (date, required)
- end_date (date, nullable)
- next_payment_date (date, required)

Metadata:
- total_payments_generated (integer, default: 0)
- last_payment_generated_at (timestamp, nullable)
```

**Permissions:**
- Admin: Full access
- Member: Read (own records only)
- Public: No access

**Triggers/Hooks:**
- Cron job to generate `payment_requests` based on `next_payment_date`
- Update `next_payment_date` after generating request

---

### 4. Existing Collection Updates

#### `hoa_organizations`
**Add Fields:**
```
Subscription Management (Already exists):
- stripe_customer_id (string, unique, nullable)
- stripe_subscription_id (string, nullable)
- subscription_status (string) - 'active', 'trial', 'canceled', 'expired'
- subscription_plan (many-to-one → subscription_plans, nullable)
- billing_cycle (string) - 'monthly', 'yearly'
- trial_ends_at (timestamp, nullable)

Payment Settings (NEW):
- default_monthly_dues (decimal, nullable) - Default monthly dues amount
- payment_grace_period_days (integer, default: 7) - Days before payment is overdue
- late_fee_amount (decimal, nullable)
- late_fee_enabled (boolean, default: false)
- payment_instructions (text, nullable) - Custom message for payment requests
```

#### `hoa_members`
**Add Fields:**
```
Payment Tracking (NEW):
- total_payments (decimal, default: 0) - Lifetime payments
- last_payment_date (timestamp, nullable)
- last_payment_amount (decimal, nullable)
- payment_status (string) - 'current', 'overdue', 'delinquent'
- outstanding_balance (decimal, default: 0)
```

#### `subscription_plans` (Already exists)
No changes needed - this collection already has the required fields.

---

## Relationships Diagram

```
hoa_organizations
  ├─→ subscription_plans (many-to-one)
  ├─→ payment_transactions (one-to-many)
  ├─→ payment_requests (one-to-many)
  └─→ payment_schedules (one-to-many)

hoa_members
  ├─→ payment_transactions (one-to-many)
  ├─→ payment_requests (one-to-many)
  └─→ payment_schedules (one-to-many)

payment_requests
  └─→ payment_transactions (one-to-many)
```

---

## Setup Instructions

### 1. Create Collections in Directus Admin Panel

1. **Create `payment_transactions` collection**
   - Go to Settings → Data Model
   - Create new collection
   - Add all fields as specified above
   - Set up proper field types and validations

2. **Create `payment_requests` collection**
   - Create new collection
   - Add all fields as specified above
   - Set up relationships to organizations and members

3. **Create `payment_schedules` collection** (Optional)
   - Create new collection for recurring payments

4. **Update `hoa_organizations` collection**
   - Add new payment settings fields

5. **Update `hoa_members` collection**
   - Add payment tracking fields

### 2. Set Up Permissions

For each collection, configure role-based permissions:

**Admin Role:**
- CRUD access to all payment collections
- Can view all transactions and requests

**Member Role:**
- Can view own payment_transactions
- Can view own payment_requests
- Can create payment_transactions (when making payments)
- Cannot modify or delete

### 3. Create Flows (Optional)

Create Directus Flows for automation:

1. **Email Notification Flow**
   - Trigger: When `payment_requests` item is created
   - Action: Send email to member with payment link

2. **Payment Confirmation Flow**
   - Trigger: When `payment_transactions` status changes to 'succeeded'
   - Actions:
     - Update related `payment_request` status
     - Update `hoa_members.last_payment_date` and `total_payments`
     - Send receipt email

3. **Overdue Payment Flow** (Optional)
   - Trigger: Scheduled (daily)
   - Action: Check `payment_requests` past due_date and send reminders

4. **Recurring Payment Flow** (Optional)
   - Trigger: Scheduled (daily)
   - Action: Generate `payment_requests` from `payment_schedules`

---

## Database Indexes

For optimal performance, create these indexes:

```sql
-- payment_transactions
CREATE INDEX idx_payment_transactions_org ON payment_transactions(organization);
CREATE INDEX idx_payment_transactions_member ON payment_transactions(member);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX idx_payment_transactions_stripe_pi ON payment_transactions(stripe_payment_intent_id);

-- payment_requests
CREATE INDEX idx_payment_requests_org ON payment_requests(organization);
CREATE INDEX idx_payment_requests_member ON payment_requests(member);
CREATE INDEX idx_payment_requests_status ON payment_requests(status);
CREATE INDEX idx_payment_requests_due_date ON payment_requests(due_date);
```

---

## Sample Data

### Payment Request Example
```json
{
  "organization": "uuid-of-organization",
  "member": "uuid-of-member",
  "request_type": "monthly_dues",
  "title": "January 2025 HOA Dues",
  "description": "Monthly homeowner association dues for January 2025",
  "amount": 350.00,
  "due_date": "2025-01-31",
  "status": "active"
}
```

### Payment Transaction Example
```json
{
  "organization": "uuid-of-organization",
  "member": "uuid-of-member",
  "payment_request": "uuid-of-request",
  "amount": 350.00,
  "currency": "usd",
  "status": "succeeded",
  "stripe_payment_intent_id": "pi_xxxxxxxxxxxxx",
  "stripe_charge_id": "ch_xxxxxxxxxxxxx",
  "payment_method_type": "card",
  "last4": "4242",
  "processing_fee": 10.45,
  "net_amount": 339.55,
  "description": "Payment for January 2025 HOA Dues"
}
```

---

## TypeScript Types

After creating these collections, update `/types/directus.ts` with:

```typescript
export interface PaymentTransaction {
  id: ID;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded';
  date_created: string;
  date_updated: string;
  user_created?: ID | DirectusUser;
  user_updated?: ID | DirectusUser;
  organization: ID | HoaOrganization;
  member?: ID | HoaMember;
  payment_request?: ID | PaymentRequest;
  amount: number;
  currency: string;
  description?: string;
  stripe_payment_intent_id: string;
  stripe_charge_id?: string;
  stripe_customer_id?: string;
  stripe_payment_method_id?: string;
  payment_method_type?: 'card' | 'us_bank_account';
  last4?: string;
  receipt_url?: string;
  receipt_email?: string;
  processing_fee?: number;
  net_amount?: number;
  metadata?: any;
  notes?: string;
}

export interface PaymentRequest {
  id: ID;
  status: 'draft' | 'active' | 'paid' | 'partially_paid' | 'overdue' | 'canceled';
  date_created: string;
  date_updated: string;
  user_created?: ID | DirectusUser;
  user_updated?: ID | DirectusUser;
  organization: ID | HoaOrganization;
  member: ID | HoaMember;
  request_type: 'monthly_dues' | 'assessment' | 'late_fee' | 'other';
  title: string;
  description?: string;
  amount: number;
  due_date?: string;
  amount_paid: number;
  amount_remaining: number;
  paid_at?: string;
  transactions?: PaymentTransaction[];
  email_sent: boolean;
  email_sent_at?: string;
  reminder_sent: boolean;
  reminder_sent_at?: string;
  notes?: string;
  metadata?: any;
}

export interface PaymentSchedule {
  id: ID;
  status: 'active' | 'paused' | 'completed' | 'canceled';
  date_created: string;
  date_updated: string;
  organization: ID | HoaOrganization;
  member: ID | HoaMember;
  title: string;
  description?: string;
  amount: number;
  frequency: 'monthly' | 'quarterly' | 'annually';
  start_date: string;
  end_date?: string;
  next_payment_date: string;
  total_payments_generated: number;
  last_payment_generated_at?: string;
}
```

---

## Next Steps

1. Create the collections in Directus admin panel
2. Set up permissions for each role
3. Add sample subscription plans if not already present
4. Test creating payment requests manually
5. Integrate with Stripe payment components in the Nuxt app
