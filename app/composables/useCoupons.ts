// composables/useCoupons.ts
/**
 * useCoupons - Composable for coupon/promo code functionality
 *
 * Provides methods to validate, apply, and track coupon usage during sign-up.
 *
 * Usage:
 * const { validateCoupon, applyCoupon, calculateDiscount } = useCoupons()
 * const result = await validateCoupon('WELCOME20', 'plan-id')
 */

// Local interface - will be replaced by auto-generated types once collections are created
export interface CouponData {
  id: string
  code: string
  title?: string | null
  description?: string | null
  type: 'percentage' | 'amount'
  amount: number
  valid_from?: string | null
  valid_until?: string | null
  max_uses?: number | null
  max_uses_per_user?: number | null
  min_purchase_amount?: number | null
  is_first_purchase_only?: boolean | null
  status?: 'active' | 'inactive' | 'expired'
}

export interface CouponValidationResult {
  valid: boolean
  coupon: CouponData | null
  error?: string
  discountAmount?: number
  discountedPrice?: number
}

export interface AppliedCoupon {
  coupon: CouponData
  originalPrice: number
  discountAmount: number
  finalPrice: number
}

export const useCoupons = () => {
  const appliedCoupon = ref<AppliedCoupon | null>(null)
  const isValidating = ref(false)
  const validationError = ref<string | null>(null)

  /**
   * Validate a coupon code
   * @param code - The coupon code to validate
   * @param planId - Optional subscription plan ID to check applicability
   * @param purchaseAmount - Optional purchase amount to check minimum requirements
   */
  const validateCoupon = async (
    code: string,
    planId?: string,
    purchaseAmount?: number
  ): Promise<CouponValidationResult> => {
    if (!code?.trim()) {
      return { valid: false, coupon: null, error: 'Please enter a coupon code' }
    }

    isValidating.value = true
    validationError.value = null

    try {
      const result = await $fetch('/api/coupons/validate', {
        method: 'POST',
        body: {
          code: code.trim().toUpperCase(),
          planId,
          purchaseAmount,
        },
      })

      if (!result.valid) {
        validationError.value = result.error || 'Invalid coupon code'
        return result as CouponValidationResult
      }

      return result as CouponValidationResult
    } catch (error: any) {
      const errorMessage = error?.data?.message || error?.message || 'Failed to validate coupon'
      validationError.value = errorMessage
      return { valid: false, coupon: null, error: errorMessage }
    } finally {
      isValidating.value = false
    }
  }

  /**
   * Calculate discount amount based on coupon type
   * @param coupon - The coupon to apply
   * @param originalPrice - The original price before discount
   */
  const calculateDiscount = (coupon: CouponData, originalPrice: number): number => {
    if (!coupon || originalPrice <= 0) return 0

    if (coupon.type === 'percentage') {
      return Math.round((originalPrice * coupon.amount) / 100 * 100) / 100
    } else {
      // Fixed amount discount - can't exceed original price
      return Math.min(coupon.amount, originalPrice)
    }
  }

  /**
   * Apply a validated coupon to a price
   * @param coupon - The validated coupon
   * @param originalPrice - The original price
   */
  const applyCoupon = (coupon: CouponData, originalPrice: number): AppliedCoupon => {
    const discountAmount = calculateDiscount(coupon, originalPrice)
    const finalPrice = Math.max(0, originalPrice - discountAmount)

    const applied: AppliedCoupon = {
      coupon,
      originalPrice,
      discountAmount,
      finalPrice,
    }

    appliedCoupon.value = applied
    return applied
  }

  /**
   * Remove the currently applied coupon
   */
  const removeCoupon = () => {
    appliedCoupon.value = null
    validationError.value = null
  }

  /**
   * Record coupon usage after successful signup/purchase
   * @param couponId - The coupon ID
   * @param userId - The user ID
   * @param organizationId - The organization ID
   * @param planId - The subscription plan ID
   * @param discountApplied - The discount amount applied
   */
  const recordUsage = async (
    couponId: string,
    userId: string,
    organizationId: string,
    planId: string,
    discountApplied: number
  ): Promise<boolean> => {
    try {
      await $fetch('/api/coupons/record-usage', {
        method: 'POST',
        body: {
          couponId,
          userId,
          organizationId,
          planId,
          discountApplied,
        },
      })
      return true
    } catch (error) {
      console.error('Failed to record coupon usage:', error)
      return false
    }
  }

  /**
   * Format discount display text
   * @param coupon - The coupon to format
   */
  const formatDiscount = (coupon: CouponData): string => {
    if (coupon.type === 'percentage') {
      return `${coupon.amount}% off`
    } else {
      return `$${coupon.amount.toFixed(2)} off`
    }
  }

  return {
    // State
    appliedCoupon: readonly(appliedCoupon),
    isValidating: readonly(isValidating),
    validationError: readonly(validationError),

    // Methods
    validateCoupon,
    calculateDiscount,
    applyCoupon,
    removeCoupon,
    recordUsage,
    formatDiscount,
  }
}
