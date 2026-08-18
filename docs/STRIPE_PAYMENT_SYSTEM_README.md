# Stripe Payment System - Complete Implementation

A complete Stripe payment integration for Property Flow HOA management system, supporting both subscription payments on signup and member payment collection for HOA dues and assessments.

## 🎯 Features

### ✅ Implemented Features

1. **Flexible Payment Methods**
   - Credit/Debit Card payments
   - US Bank Account (ACH) payments
   - Automatic processing fee calculation
   - No fees for bank transfers

2. **Organization Signup Payments**
   - Subscription plan selection
   - Payment collection during organization setup
   - Trial period support
   - Automatic subscription management

3. **HOA Payment Collection**
   - Admin creates payment requests for members
   - Members view and pay outstanding requests
   - Support for:
     - Monthly HOA dues
     - Special assessments
     - Late fees
     - Custom charges

4. **Payment Tracking**
   - Complete payment transaction history
   - Payment request status tracking (active, paid, overdue, partially paid)
   - Receipt generation and email delivery
   - Automatic status updates via webhooks

5. **Security & Compliance**
   - PCI-compliant (all card data handled by Stripe)
   - Webhook signature verification
   - Server-side amount validation
   - Secure API key management

## 📁 File Structure

```
/home/user/605-Lincoln/
├── components/
│   └── Payment/
│       ├── StripeCard.vue          # Stripe Elements payment form
│       └── Methods.vue              # Payment method selector (card/bank)
├── composables/
│   └── useStripePayment.ts         # Stripe utility functions
├── pages/
│   ├── payment/
│   │   └── confirmation.vue        # Payment success/failure page
│   ├── payments/
│   │   └── index.vue               # Member payment requests list
│   └── admin/
│       └── payment-requests/
│           └── create.vue          # Admin creates payment requests
├── server/
│   └── api/
│       └── stripe/
│           ├── paymentintent.post.ts  # Create payment intents
│           └── webhook.post.ts        # Handle Stripe webhooks
└── docs/
    ├── DIRECTUS_PAYMENT_COLLECTIONS.md      # Database schema
    ├── STRIPE_IMPLEMENTATION_GUIDE.md       # Detailed guide
    └── STRIPE_PAYMENT_SYSTEM_README.md      # This file
```

## 🚀 Quick Start

### 1. Configuration

Add to your `.env` file:

```env
# Stripe Test Keys (Development)
STRIPE_PUBLIC_KEY_TEST=pk_test_xxxxx
STRIPE_SECRET_KEY_TEST=sk_test_xxxxx

# Stripe Live Keys (Production)
STRIPE_PUBLIC_KEY_LIVE=pk_live_xxxxx
STRIPE_SECRET_KEY_LIVE=sk_live_xxxxx

# Webhook Secret
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

### 2. Set Up Directus Collections

Follow instructions in `docs/DIRECTUS_PAYMENT_COLLECTIONS.md` to create:

- `payment_transactions` - All payment records
- `payment_requests` - Admin-created payment requests
- `payment_schedules` - Recurring payment schedules (optional)

Update existing collections:
- `hoa_organizations` - Add subscription fields
- `hoa_members` - Add payment tracking fields

### 3. Configure Webhooks

**Local Development:**
```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

**Production:**
1. Add webhook endpoint: `https://yourdomain.com/api/stripe/webhook`
2. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.succeeded`
   - `charge.refunded`
3. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

## 📖 Usage Examples

### Example 1: Simple Payment Form

```vue
<template>
  <PaymentMethods
    :email="user.email"
    :amount="350.00"
    :metadata="{ organizationId: org.id }"
    @success="onSuccess"
    @error="onError"
  />
</template>

<script setup>
const onSuccess = (paymentIntentId) => {
  console.log('Payment successful!', paymentIntentId);
};

const onError = (error) => {
  console.error('Payment failed:', error);
};
</script>
```

### Example 2: Organization Setup with Payment

```vue
<template>
  <div>
    <!-- Step 1: Org Details -->
    <OrganizationSetupForm
      v-if="step === 1"
      :beta-mode="false"
      @success="handleOrgCreated"
    />

    <!-- Step 2: Select Plan -->
    <SubscriptionPlanSelector
      v-if="step === 2"
      @select="handlePlanSelected"
    />

    <!-- Step 3: Payment -->
    <PaymentMethods
      v-if="step === 3"
      :email="orgData.email"
      :amount="selectedPlan.price_monthly"
      :metadata="{
        organizationId: organization.id,
        subscriptionPlanId: selectedPlan.id,
        description: `${selectedPlan.name} Subscription`
      }"
      return-url="/dashboard?setup=complete"
      @success="handlePaymentSuccess"
    />
  </div>
</template>

<script setup lang="ts">
const step = ref(1);
const organization = ref(null);
const selectedPlan = ref(null);

const handleOrgCreated = (data) => {
  organization.value = data.organization;
  step.value = 2;
};

const handlePlanSelected = (plan) => {
  selectedPlan.value = plan;
  step.value = 3;
};

const handlePaymentSuccess = async () => {
  // Update organization subscription
  await $fetch(`/api/directus/items/hoa_organizations/${organization.value.id}`, {
    method: 'PATCH',
    body: {
      subscription_status: 'active',
      subscription_plan: selectedPlan.value.id
    }
  });

  navigateTo('/dashboard');
};
</script>
```

### Example 3: Admin Request Payment

```javascript
// Create a payment request
const response = await $fetch('/api/directus/items/payment_requests', {
  method: 'POST',
  body: {
    organization: 'org-uuid',
    member: 'member-uuid',
    request_type: 'monthly_dues',
    title: 'January 2025 HOA Dues',
    description: 'Monthly dues for January',
    amount: 350.00,
    due_date: '2025-01-31',
    status: 'active',
    amount_paid: 0,
    amount_remaining: 350.00
  }
});

// Send notification email
await $fetch('/api/payments/send-notification', {
  method: 'POST',
  body: { paymentRequestId: response.data.id }
});
```

### Example 4: Member Pays Request

```vue
<template>
  <div>
    <h1>{{ request.title }}</h1>
    <p>Amount Due: ${{ request.amount_remaining }}</p>

    <PaymentMethods
      :email="user.email"
      :amount="request.amount_remaining"
      :metadata="{
        organizationId: request.organization,
        memberId: request.member,
        paymentRequestId: request.id
      }"
      @success="navigateTo('/payments?success=true')"
    />
  </div>
</template>
```

## 🔧 Composable: useStripePayment()

```typescript
const {
  isProcessing,       // Ref<boolean> - Payment processing state
  error,              // Ref<Error | null> - Last error
  createPaymentIntent,      // Create payment intent
  calculateProcessingFee,   // Calculate Stripe fee
  calculateTotalWithFees,   // Calculate total with fees
  dollarsToCents,           // Convert $ to cents
  centsToDollars,           // Convert cents to $
  formatCurrency            // Format as currency string
} = useStripePayment();

// Examples:
const fee = calculateProcessingFee(100, 'card');     // 3.20
const total = calculateTotalWithFees(100, 'card');   // 103.20
const cents = dollarsToCents(100);                    // 10000
const formatted = formatCurrency(100);                 // "$100.00"
```

## 🎨 Components API

### PaymentMethods

Main payment component with card/bank toggle.

**Props:**
```typescript
{
  email: string;              // Required - User email
  amount: number;             // Required - Amount in dollars
  metadata?: object;          // Optional - Custom metadata
  returnUrl?: string;         // Optional - Return URL after payment
}
```

**Events:**
```typescript
{
  success: (paymentIntentId: string) => void;
  error: (error: Error) => void;
}
```

### PaymentStripeCard

Low-level Stripe Elements form.

**Props:**
```typescript
{
  paymentType: 'card' | 'us_bank_account';
  email: string;              // Required
  amount: number;             // Required - Amount in cents
  metadata?: object;          // Optional
  returnUrl?: string;         // Optional
}
```

## 🔐 Security

✅ **Implemented:**
- PCI compliance (Stripe handles all card data)
- Webhook signature verification
- Server-side amount validation
- Secure API key storage in environment variables
- No card data stored in database

⚠️ **Best Practices:**
- Never expose secret keys client-side
- Always use HTTPS in production
- Verify webhook signatures
- Validate all amounts server-side
- Use test mode during development

## 🧪 Testing

### Test Cards

```
Success:      4242 4242 4242 4242
Declined:     4000 0000 0000 9995
Insufficient: 4000 0000 0000 9995
```

[More test cards](https://stripe.com/docs/testing#cards)

### Test Webhooks

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks
stripe listen --forward-to http://localhost:3000/api/stripe/webhook

# Trigger events
stripe trigger payment_intent.succeeded
stripe trigger charge.succeeded
```

## 📊 Payment Flow

### Signup Payment Flow

```
1. User creates organization
2. User selects subscription plan
3. User enters payment details
4. Stripe creates payment intent
5. User confirms payment
6. Stripe processes payment
7. Webhook updates organization
8. User redirected to dashboard
```

### HOA Payment Flow

```
1. Admin creates payment request
2. Member receives email notification
3. Member views payment request
4. Member enters payment details
5. Stripe creates payment intent
6. Member confirms payment
7. Stripe processes payment
8. Webhook creates transaction record
9. Webhook updates payment request status
10. Member receives receipt
```

## 🐛 Troubleshooting

### Common Issues

**1. "Stripe not configured"**
- Check `STRIPE_PUBLIC_KEY_TEST` is set in `.env`
- Verify key starts with `pk_test_` (or `pk_live_`)

**2. Webhook signature verification failed**
- Ensure `STRIPE_WEBHOOK_SECRET` is correct
- Use correct secret for test/live mode
- Check webhook endpoint URL is correct

**3. Payment succeeds but not recorded**
- Verify webhook is configured in Stripe Dashboard
- Check server logs for webhook errors
- Ensure Directus collections exist

**4. Elements not loading**
- Check browser console for errors
- Verify `@stripe/stripe-js` is installed
- Check network tab for blocked requests

## 📚 Documentation

- **Database Schema:** `docs/DIRECTUS_PAYMENT_COLLECTIONS.md`
- **Implementation Guide:** `docs/STRIPE_IMPLEMENTATION_GUIDE.md`
- **Stripe Docs:** https://stripe.com/docs
- **Stripe Dashboard:** https://dashboard.stripe.com

## 🚧 Future Enhancements

Possible additions:
- [ ] Recurring payment schedules
- [ ] Automatic late fee calculation
- [ ] Payment plan support (installments)
- [ ] Refund management interface
- [ ] Payment analytics dashboard
- [ ] Multi-currency support
- [ ] Apple Pay / Google Pay
- [ ] ACH debit for recurring payments
- [ ] Payment reminders via email/SMS

## 💡 Tips

1. **Always test with test keys first**
2. **Set up webhooks early** - Critical for payment tracking
3. **Monitor Stripe Dashboard** - Check for failed payments
4. **Handle errors gracefully** - Show clear messages to users
5. **Test edge cases** - Declined cards, slow networks, etc.
6. **Keep Stripe updated** - Update SDK regularly
7. **Log everything** - Makes debugging much easier

## 📞 Support

**Stripe Issues:**
- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Support](https://support.stripe.com)

**Implementation Issues:**
- Check server logs
- Review webhook delivery in Stripe Dashboard
- Verify Directus collections
- Test with Stripe CLI

---

## Summary

The Stripe payment system is now fully implemented with:

✅ Payment components (card & bank account)
✅ Server endpoints (payment intent & webhooks)
✅ Payment utilities composable
✅ Organization signup payment flow
✅ HOA payment request system
✅ Member payment portal
✅ Admin payment management
✅ Complete documentation

**Next Steps:**

1. Add your Stripe API keys to `.env`
2. Create Directus collections using the schema documentation
3. Set up webhooks in Stripe Dashboard
4. Test with Stripe test cards
5. Integrate into your organization setup flow
6. Deploy and configure production webhooks

The system is production-ready and follows Stripe best practices for security and reliability.
