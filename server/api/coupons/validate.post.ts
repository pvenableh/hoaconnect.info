// server/api/coupons/validate.post.ts
/**
 * Validate a coupon code for sign-up
 * Checks if the coupon exists, is active, not expired, and applicable to the plan
 */

import { readItems, aggregate } from "@directus/sdk";
import { z } from "zod";

const validateSchema = z.object({
  code: z.string().min(1, "Coupon code is required"),
  planId: z.string().optional(),
  purchaseAmount: z.number().optional(),
});

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const validation = validateSchema.safeParse(body);

    if (!validation.success) {
      throw createError({
        statusCode: 400,
        message: validation.error.errors[0]?.message || "Invalid request",
      });
    }

    const { code, planId, purchaseAmount } = validation.data;

    // Use public directus client for coupon validation (no auth required during sign-up)
    const directus = getPublicDirectus();

    // Look up the coupon by code
    const coupons = await directus.request(
      readItems("coupons", {
        filter: {
          code: { _eq: code.toUpperCase() },
          status: { _eq: "active" },
        },
        fields: [
          "id",
          "code",
          "title",
          "description",
          "type",
          "amount",
          "valid_from",
          "valid_until",
          "max_uses",
          "max_uses_per_user",
          "min_purchase_amount",
          "is_first_purchase_only",
          "status",
          // Include applicable plans if configured
          "applicable_plans.subscription_plan_id",
        ],
        limit: 1,
      })
    );

    if (!coupons || coupons.length === 0) {
      return {
        valid: false,
        coupon: null,
        error: "Invalid coupon code",
      };
    }

    const coupon = coupons[0] as any;
    const now = new Date();

    // Check if coupon has started
    if (coupon.valid_from) {
      const validFrom = new Date(coupon.valid_from);
      if (now < validFrom) {
        return {
          valid: false,
          coupon: null,
          error: "This coupon is not yet active",
        };
      }
    }

    // Check if coupon has expired
    if (coupon.valid_until) {
      const validUntil = new Date(coupon.valid_until);
      if (now > validUntil) {
        return {
          valid: false,
          coupon: null,
          error: "This coupon has expired",
        };
      }
    }

    // Check minimum purchase amount
    if (
      coupon.min_purchase_amount &&
      purchaseAmount !== undefined &&
      purchaseAmount < coupon.min_purchase_amount
    ) {
      return {
        valid: false,
        coupon: null,
        error: `Minimum purchase of $${coupon.min_purchase_amount.toFixed(2)} required`,
      };
    }

    // Check max uses if applicable
    if (coupon.max_uses) {
      const usageCount = await directus.request(
        aggregate("coupon_usage", {
          aggregate: { count: ["*"] },
          query: {
            filter: {
              coupon: { _eq: coupon.id },
            },
          },
        })
      );

      const currentUses = (usageCount as any)?.[0]?.count || 0;
      if (currentUses >= coupon.max_uses) {
        return {
          valid: false,
          coupon: null,
          error: "This coupon has reached its usage limit",
        };
      }
    }

    // Check plan applicability if plans are restricted and a plan ID is provided
    if (planId && coupon.applicable_plans && coupon.applicable_plans.length > 0) {
      const applicablePlanIds = coupon.applicable_plans.map(
        (p: any) => p.subscription_plan_id
      );
      if (!applicablePlanIds.includes(planId)) {
        return {
          valid: false,
          coupon: null,
          error: "This coupon is not valid for the selected plan",
        };
      }
    }

    // Calculate discount if purchase amount is provided
    let discountAmount: number | undefined;
    let discountedPrice: number | undefined;

    if (purchaseAmount !== undefined) {
      if (coupon.type === "percentage") {
        discountAmount =
          Math.round((purchaseAmount * coupon.amount) / 100 * 100) / 100;
      } else {
        discountAmount = Math.min(coupon.amount, purchaseAmount);
      }
      discountedPrice = Math.max(0, purchaseAmount - discountAmount);
    }

    // Return valid coupon (without sensitive nested data)
    return {
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        title: coupon.title,
        description: coupon.description,
        type: coupon.type,
        amount: coupon.amount,
      },
      discountAmount,
      discountedPrice,
    };
  } catch (error: any) {
    console.error("[/api/coupons/validate] Error:", error);

    // If it's already a createError, re-throw
    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      message: "Failed to validate coupon",
    });
  }
});
