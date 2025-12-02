// server/api/coupons/record-usage.post.ts
/**
 * Record coupon usage after successful sign-up/purchase
 * This should be called after the payment/registration is confirmed
 */

import { createItem } from "@directus/sdk";
import { z } from "zod";

const recordUsageSchema = z.object({
  couponId: z.string().min(1, "Coupon ID is required"),
  userId: z.string().min(1, "User ID is required"),
  organizationId: z.string().min(1, "Organization ID is required"),
  planId: z.string().min(1, "Plan ID is required"),
  discountApplied: z.number().min(0, "Discount applied must be non-negative"),
});

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const validation = recordUsageSchema.safeParse(body);

    if (!validation.success) {
      throw createError({
        statusCode: 400,
        message: validation.error.errors[0]?.message || "Invalid request",
      });
    }

    const { couponId, userId, organizationId, planId, discountApplied } =
      validation.data;

    // Use admin client to record usage
    const directus = getTypedDirectus();

    const usage = await directus.request(
      createItem("coupon_usage", {
        coupon: couponId,
        user: userId,
        organization: organizationId,
        subscription_plan: planId,
        discount_applied: discountApplied,
        used_at: new Date().toISOString(),
      })
    );

    return {
      success: true,
      usageId: (usage as any).id,
    };
  } catch (error: any) {
    console.error("[/api/coupons/record-usage] Error:", error);

    // If it's already a createError, re-throw
    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      message: "Failed to record coupon usage",
    });
  }
});
