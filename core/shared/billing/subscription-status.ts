// Stripe subscription status → the org's `subscription_status`.
//
// `null` means "leave the org alone". A subscription created with
// `payment_behavior: "default_incomplete"` (every self-serve checkout) starts
// `incomplete` and, if the board closes the card form, ends
// `incomplete_expired` 23 hours later. Neither was ever paid, so neither may
// move the org: mapping them to `expired` (as the webhook used to) locked a
// trial org out of its own workspace the moment a board opened checkout.

export type OrgSubscriptionStatus = "active" | "trial" | "canceled" | "expired";

export function orgStatusForStripeSubscription(
  stripeStatus: string,
  eventType?: string
): OrgSubscriptionStatus | null {
  if (stripeStatus === "incomplete" || stripeStatus === "incomplete_expired") return null;
  if (eventType === "customer.subscription.deleted") return "canceled";
  switch (stripeStatus) {
    case "trialing":
      return "trial";
    case "active":
      return "active";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "past_due":
      return "expired";
    default:
      return "active";
  }
}
