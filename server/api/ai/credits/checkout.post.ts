// POST /api/ai/credits/checkout — start a Stripe Checkout Session to buy an
// AI-credit pack. The wallet is credited by the Stripe webhook on
// payment_intent.succeeded (idempotent on the PI id), never here — so a closed
// browser tab can't lose a paid top-up. Returns the hosted Checkout URL.

import { packById } from "~~/shared/ai/credits";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody(event);
  const orgId = String(body?.orgId || "").trim();
  const packId = String(body?.packId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  await requireOrgComposeAccess(event, orgId);

  const pack = packById(packId);
  if (!pack) throw createError({ statusCode: 400, message: "Unknown credit pack" });

  // Same-origin return path only (defends against open-redirect).
  const rawReturn = String(body?.returnPath || "/");
  const returnPath = rawReturn.startsWith("/") ? rawReturn : "/";
  const base = (useRuntimeConfig().public.appUrl as string) || "http://localhost:3000";

  const meta = {
    kind: "ai_credits",
    org_id: orgId,
    pack_id: pack.id,
    credits: String(pack.credits),
  };

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pack.priceUsd * 100,
          product_data: {
            name: `AI Credits — ${pack.label}`,
            description: `${pack.credits.toLocaleString()} credits`,
          },
        },
      },
    ],
    // metadata on the PaymentIntent is what the existing webhook reads.
    payment_intent_data: { metadata: meta },
    metadata: meta,
    success_url: `${base}${returnPath}?credits=success`,
    cancel_url: `${base}${returnPath}?credits=cancel`,
  });

  return { url: session.url };
});
