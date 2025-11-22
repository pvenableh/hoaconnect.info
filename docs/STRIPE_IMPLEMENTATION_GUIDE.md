# Stripe Payment System Implementation Guide

This guide explains how to use the Stripe payment system in your Property Flow application.

## Table of Contents

1. [Setup & Configuration](#setup--configuration)
2. [Components](#components)
3. [Server Endpoints](#server-endpoints)
4. [Composables](#composables)
5. [Usage Examples](#usage-examples)
6. [Testing](#testing)
7. [Webhooks](#webhooks)
8. [Troubleshooting](#troubleshooting)

---

## Setup & Configuration

### 1. Install Dependencies

The required packages have already been installed:
- `stripe` (server-side SDK)
- `@stripe/stripe-js` (client-side SDK)

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and add your Stripe keys:

```bash
# Stripe Test Keys (for development)
STRIPE_PUBLIC_KEY_TEST=pk_test_xxxxx
STRIPE_SECRET_KEY_TEST=sk_test_xxxxx

# Stripe Live Keys (for production)
STRIPE_PUBLIC_KEY_LIVE=pk_live_xxxxx
STRIPE_SECRET_KEY_LIVE=sk_live_xxxxx

# Stripe Webhook Secret
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

**Getting Your Stripe Keys:**

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Developers → API keys**
3. Copy your **Publishable key** and **Secret key**
4. For webhooks: **Developers → Webhooks → Add endpoint**

### 3. Configure Directus Collections

Follow the instructions in `docs/DIRECTUS_PAYMENT_COLLECTIONS.md` to set up the required database collections:

- `payment_transactions`
- `payment_requests`
- `payment_schedules` (optional)

Update `hoa_organizations` and `hoa_members` with payment-related fields.

---

## Components

### PaymentMethods

The main payment component that allows users to switch between card and bank account payments.

**Location:** `/components/Payment/Methods.vue`

**Usage:**

```vue
<template>
  <PaymentMethods
    :email="user.email"
    :amount="350.00"
    :metadata="{
      organizationId: organization.id,
      memberId: member.id,
      description: 'HOA Dues for January 2025'
    }"
    return-url="/payment/confirmation"
    @success="handlePaymentSuccess"
    @error="handlePaymentError"
  />
</template>

<script setup>
const handlePaymentSuccess = (paymentIntentId) => {
  console.log('Payment successful:', paymentIntentId);
  // Redirect or show success message
};

const handlePaymentError = (error) => {
  console.error('Payment failed:', error);
  // Show error message to user
};
</script>
```

**Props:**
- `email` (required): User's email address
- `amount` (required): Amount in dollars (will be converted to cents)
- `metadata` (optional): Additional data to attach to the payment
- `returnUrl` (optional): Custom return URL after payment (defaults to `/payment/confirmation`)

**Events:**
- `@success`: Emitted when payment is successful (receives `paymentIntentId`)
- `@error`: Emitted when payment fails (receives `Error` object)

---

### PaymentStripeCard

Low-level component that renders the Stripe payment form.

**Location:** `/components/Payment/StripeCard.vue`

**Usage:**

```vue
<PaymentStripeCard
  payment-type="card"
  :email="user.email"
  :amount="35000"
  :metadata="{ organizationId: 'xxx' }"
  return-url="/confirmation"
  @success="handleSuccess"
  @error="handleError"
/>
```

**Props:**
- `paymentType`: `'card'` or `'us_bank_account'`
- `email` (required): User's email
- `amount` (required): Amount in cents
- `metadata` (optional): Additional payment metadata
- `returnUrl` (optional): Custom return URL

---

## Server Endpoints

### POST /api/stripe/paymentintent

Creates a Stripe payment intent.

**Request Body:**
```typescript
{
  amount: number;        // Amount in cents (required)
  email: string;         // User email (required)
  paymentType?: 'card' | 'us_bank_account';
  organizationId?: string;
  memberId?: string;
  paymentRequestId?: string;
  description?: string;
  metadata?: Record<string, any>;
}
```

**Response:**
```typescript
{
  clientSecret: string;
  id: string;
  amount: number;
  currency: string;
}
```

**Example:**
```javascript
const paymentIntent = await $fetch('/api/stripe/paymentintent', {
  method: 'POST',
  body: {
    amount: 35000, // $350.00
    email: 'member@example.com',
    paymentType: 'card',
    organizationId: 'org-uuid',
    memberId: 'member-uuid',
    description: 'January 2025 HOA Dues'
  }
});
```

---

### POST /api/stripe/webhook

Handles Stripe webhook events.

**Supported Events:**
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.succeeded`
- `charge.refunded`
- `customer.subscription.*`

**Automatic Actions:**
- Creates `payment_transactions` records
- Updates `payment_requests` status
- Updates organization subscription status
- Sends confirmation emails (if configured)

---

## Composables

### useStripePayment()

Utility composable for Stripe operations.

**Location:** `/composables/useStripePayment.ts`

**Usage:**

```typescript
const {
  isProcessing,
  error,
  createPaymentIntent,
  calculateProcessingFee,
  calculateTotalWithFees,
  dollarsToCents,
  centsToDollars,
  formatCurrency
} = useStripePayment();

// Create payment intent
const paymentIntent = await createPaymentIntent({
  amount: 35000,
  email: 'user@example.com',
  organizationId: 'org-id'
});

// Calculate fees
const fee = calculateProcessingFee(350.00, 'card'); // Returns 10.45
const total = calculateTotalWithFees(350.00, 'card'); // Returns 360.45

// Convert amounts
const cents = dollarsToCents(350.00); // Returns 35000
const dollars = centsToDollars(35000); // Returns 350.00

// Format currency
const formatted = formatCurrency(350.00); // Returns "$350.00"
```

---

## Usage Examples

### Example 1: Organization Signup with Payment

```vue
<template>
  <div>
    <h1>Complete Your Organization Setup</h1>

    <!-- Step 1: Organization Details -->
    <div v-if="step === 1">
      <OrganizationSetupForm @next="handleOrgSetup" />
    </div>

    <!-- Step 2: Select Plan -->
    <div v-if="step === 2">
      <SubscriptionPlanSelector @select="handlePlanSelect" />
    </div>

    <!-- Step 3: Payment -->
    <div v-if="step === 3">
      <PaymentMethods
        :email="orgData.email"
        :amount="calculatePlanAmount()"
        :metadata="{
          organizationId: newOrganization.id,
          subscriptionPlanId: selectedPlan.id,
          description: `${selectedPlan.name} Subscription`
        }"
        return-url="/dashboard?setup=complete"
        @success="handlePaymentSuccess"
        @error="handlePaymentError"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
const step = ref(1);
const orgData = ref({});
const newOrganization = ref(null);
const selectedPlan = ref(null);

const handleOrgSetup = async (data) => {
  orgData.value = data;
  // Create organization in Directus
  const response = await $fetch('/api/hoa/setup-organization', {
    method: 'POST',
    body: data
  });
  newOrganization.value = response.organization;
  step.value = 2;
};

const handlePlanSelect = (plan) => {
  selectedPlan.value = plan;
  step.value = 3;
};

const calculatePlanAmount = () => {
  // Return monthly or yearly price based on billing cycle
  return selectedPlan.value.price_monthly;
};

const handlePaymentSuccess = async (paymentIntentId) => {
  // Update organization with subscription info
  await $fetch(`/api/directus/items/hoa_organizations/${newOrganization.value.id}`, {
    method: 'PATCH',
    body: {
      subscription_status: 'active',
      subscription_plan: selectedPlan.value.id
    }
  });

  // Redirect to dashboard
  navigateTo('/dashboard?setup=complete');
};

const handlePaymentError = (error) => {
  console.error('Payment failed:', error);
  // Show error to user
};
</script>
```

---

### Example 2: Admin Creates Payment Request

```vue
<template>
  <div>
    <h1>Request Payment from Member</h1>

    <form @submit.prevent="createRequest">
      <select v-model="form.memberId" required>
        <option v-for="member in members" :key="member.id" :value="member.id">
          {{ member.first_name }} {{ member.last_name }}
        </option>
      </select>

      <input v-model="form.title" placeholder="Payment Title" required />
      <input v-model.number="form.amount" type="number" step="0.01" required />
      <input v-model="form.dueDate" type="date" />

      <button type="submit">Create Request</button>
    </form>
  </div>
</template>

<script setup lang="ts">
const form = ref({
  memberId: '',
  title: '',
  amount: 0,
  dueDate: ''
});

const createRequest = async () => {
  const response = await $fetch('/api/directus/items/payment_requests', {
    method: 'POST',
    body: {
      organization: currentOrg.value.id,
      member: form.value.memberId,
      request_type: 'monthly_dues',
      title: form.value.title,
      amount: form.value.amount,
      due_date: form.value.dueDate,
      status: 'active',
      amount_paid: 0,
      amount_remaining: form.value.amount
    }
  });

  // Optionally send email notification
  await $fetch('/api/payments/send-notification', {
    method: 'POST',
    body: { paymentRequestId: response.data.id }
  });

  alert('Payment request created!');
};
</script>
```

---

### Example 3: Member Pays Request

```vue
<template>
  <div>
    <h1>{{ paymentRequest.title }}</h1>
    <p>Amount Due: ${{ paymentRequest.amount_remaining }}</p>

    <PaymentMethods
      :email="user.email"
      :amount="paymentRequest.amount_remaining"
      :metadata="{
        organizationId: paymentRequest.organization,
        memberId: paymentRequest.member,
        paymentRequestId: paymentRequest.id,
        description: paymentRequest.title
      }"
      return-url="/payments?success=true"
      @success="handlePaymentSuccess"
      @error="handlePaymentError"
    />
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const paymentRequest = ref(null);

onMounted(async () => {
  const response = await $fetch(`/api/directus/items/payment_requests/${route.params.id}`);
  paymentRequest.value = response.data;
});

const handlePaymentSuccess = () => {
  // Payment will be automatically recorded via webhook
  navigateTo('/payments?success=true');
};
</script>
```

---

## Testing

### Test Mode

Always use test keys during development:
- Test cards: [Stripe Test Cards](https://stripe.com/docs/testing#cards)
- Use `4242 4242 4242 4242` for successful payments
- Use `4000 0000 0000 9995` for declined payments

### Testing Webhooks Locally

1. Install Stripe CLI:
```bash
brew install stripe/stripe-cli/stripe
```

2. Login to Stripe:
```bash
stripe login
```

3. Forward webhooks to localhost:
```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

4. Get webhook signing secret from output and add to `.env`:
```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

5. Trigger test events:
```bash
stripe trigger payment_intent.succeeded
```

---

## Webhooks

### Production Webhook Setup

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Enter your production URL: `https://yourdomain.com/api/stripe/webhook`
4. Select events to listen to:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.succeeded`
   - `charge.refunded`
   - `customer.subscription.*`
5. Copy the **Signing secret** and add to production environment variables

### Webhook Security

The webhook endpoint verifies Stripe signatures to ensure requests are authentic. Never skip signature verification in production.

---

## Troubleshooting

### Payment Intent Creation Fails

**Error:** `Stripe configuration error: Secret key not found`

**Solution:** Ensure `STRIPE_SECRET_KEY_TEST` (or `STRIPE_SECRET_KEY_LIVE` for production) is set in your `.env` file.

---

### Webhook Signature Verification Fails

**Error:** `Webhook signature verification failed`

**Solution:**
1. Ensure `STRIPE_WEBHOOK_SECRET` is correctly set
2. Use the signing secret from the specific webhook endpoint
3. Test keys have different webhook secrets than live keys

---

### Payment Succeeds But Not Recorded in Database

**Problem:** Payment completes but no transaction record is created.

**Solution:**
1. Check webhook is configured and pointing to correct URL
2. Verify webhook secret is correct
3. Check server logs for webhook processing errors
4. Ensure Directus collections are properly set up

---

### Stripe Elements Not Loading

**Error:** Blank payment form or "Failed to load Stripe"

**Solution:**
1. Verify `STRIPE_PUBLIC_KEY_TEST` is set in `.env`
2. Check browser console for errors
3. Ensure `@stripe/stripe-js` is installed
4. Check network tab for blocked requests

---

## Security Best Practices

1. **Never expose secret keys** - Only use public keys in client-side code
2. **Always verify webhooks** - Use signature verification
3. **Use HTTPS in production** - Stripe requires HTTPS for webhooks
4. **Validate amounts server-side** - Don't trust client-provided amounts
5. **Store minimal card data** - Never store full card numbers
6. **Use test mode for development** - Keep test and live keys separate

---

## Support

For Stripe-specific issues:
- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Support](https://support.stripe.com/)

For implementation issues:
- Check server logs
- Review Directus collection setup
- Verify environment variables
- Test webhook delivery in Stripe Dashboard
