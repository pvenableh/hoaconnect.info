// Single source of truth for the public pricing page (fallback + static copy).
//
// HOA Connect is priced as a FLAT monthly fee per building, selected by a size
// band (unit count only picks the band; it never multiplies the price). The
// live page prefers the Directus `subscription_plans` fetch; this array is the
// structurally-identical fallback and the source for static copy.
//
// Mirrors the app's Directus seed (scripts/add-subscription-tier-fields.ts) and
// the AI economics canon (shared/ai/credits.ts: 1,000 credits = $1, 4× margin).

/** Billing is always per building. Never "unit". */
export const BILLED_PER = "building" as const;

/** 1,000 credits = $1 to the user (mirrors shared/ai/credits.ts). */
export const CREDITS_PER_DOLLAR = 1000;

export interface PricingTier {
  slug: string;
  name: string;
  /** Human label for the unit band this flat price covers. */
  unitRange: string;
  /** Flat monthly fee per building (null = contact-only). */
  monthly: number | null;
  /** Annual = monthly × 10 (2 months free). */
  annual: number | null;
  /** Standard one-time onboarding fee. */
  onboarding: number | null;
  /** Included AI credits per month. */
  includedCredits: number | null;
  /** Approx. USD value of the included AI credits (credits ÷ 1000). */
  includedAiValueUsd: number | null;
  featured: boolean;
  contactOnly: boolean;
  features: string[];
}

export const PRICING: PricingTier[] = [
  {
    slug: "boutique",
    name: "Boutique",
    unitRange: "Up to 30 units",
    monthly: 249,
    annual: 2490,
    onboarding: 1500,
    includedCredits: 10000,
    includedAiValueUsd: 10,
    featured: false,
    contactOnly: false,
    features: [
      "Branded resident portal",
      "Document library",
      "Announcements with email",
      "Resident directory",
      "Meeting management",
    ],
  },
  {
    slug: "mid",
    name: "Mid",
    unitRange: "31–60 units",
    monthly: 449,
    annual: 4490,
    onboarding: 2500,
    includedCredits: 25000,
    includedAiValueUsd: 25,
    featured: true,
    contactOnly: false,
    features: [
      "Everything in Boutique",
      "Financial dashboard",
      "Budget vs actual reporting",
      "Channels & messaging",
      "Project management",
    ],
  },
  {
    slug: "larger",
    name: "Larger",
    unitRange: "61–100 units",
    monthly: 699,
    annual: 6990,
    onboarding: 3500,
    includedCredits: 50000,
    includedAiValueUsd: 50,
    featured: false,
    contactOnly: false,
    features: [
      "Everything in Mid",
      "Advanced reporting",
      "Custom branding",
      "Priority onboarding",
      "Larger AI allowance",
    ],
  },
  {
    slug: "grand",
    name: "Grand",
    unitRange: "101–200 units",
    monthly: 999,
    annual: 9990,
    onboarding: 5000,
    includedCredits: 100000,
    includedAiValueUsd: 100,
    featured: false,
    contactOnly: false,
    features: [
      "Everything in Larger",
      "Multi-board support",
      "Dedicated onboarding",
      "Generous AI allowance",
      "Priority support",
    ],
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    unitRange: "200+ units",
    monthly: null,
    annual: null,
    onboarding: null,
    includedCredits: null,
    includedAiValueUsd: null,
    featured: false,
    contactOnly: true,
    features: [
      "Everything in Grand",
      "Custom integrations",
      "SLA guarantee",
      "Custom AI allowance",
      "White-glove onboarding",
    ],
  },
];

/**
 * Signature onboarding is a bespoke, hand-designed site (1033 Lenox tier). It's
 * an onboarding UPGRADE, not a separate plan — recurring still scales with
 * building size. Custom-invoiced via Stripe (50% deposit / 50% on launch), so
 * there is no fixed Stripe price.
 */
export const SIGNATURE = {
  name: "Signature",
  fromUsd: 9000,
  cta: "Contact us",
  blurb:
    "A bespoke, hand-designed site in the spirit of 1033 Lenox — built around your building's brand. Plan-independent: your monthly subscription still follows your building size.",
  features: [
    "Bespoke design & art direction",
    "Custom front-end build",
    "Brand & identity work",
    "Content & photography guidance",
    "50% deposit / 50% on launch",
  ],
} as const;

/** AI credit top-up packs — mirrors shared/ai/credits.ts CREDIT_PACKS. */
export const CREDIT_PACKS = [
  { id: "small", label: "Small", priceUsd: 10, credits: 10000 },
  { id: "medium", label: "Medium", priceUsd: 25, credits: 27500 },
  { id: "large", label: "Large", priceUsd: 100, credits: 120000 },
] as const;
