<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ref, computed, watch } from "vue";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, Tag, Percent } from "lucide-vue-next";
import { refDebounced } from "@vueuse/core";
import type { CouponData, AppliedCoupon } from "@/composables/useCoupons";

export interface CouponCodeInputProps {
  id?: string;
  class?: HTMLAttributes["class"];
  planId?: string;
  purchaseAmount?: number;
  disabled?: boolean;
  label?: string;
}

const props = withDefaults(defineProps<CouponCodeInputProps>(), {
  label: "Promo Code",
});

const emit = defineEmits<{
  (e: "applied", value: AppliedCoupon): void;
  (e: "removed"): void;
  (e: "error", value: string): void;
}>();

const { validateCoupon, applyCoupon, formatDiscount, isValidating, validationError } =
  useCoupons();

const couponCode = ref("");
const debouncedCode = refDebounced(couponCode, 300);
const appliedCouponData = ref<AppliedCoupon | null>(null);
const showInput = ref(false);

const hasAppliedCoupon = computed(() => appliedCouponData.value !== null);

const handleApply = async () => {
  if (!couponCode.value.trim()) return;

  const result = await validateCoupon(
    couponCode.value,
    props.planId,
    props.purchaseAmount
  );

  if (result.valid && result.coupon) {
    const applied = applyCoupon(result.coupon, props.purchaseAmount || 0);
    appliedCouponData.value = applied;
    emit("applied", applied);
  } else if (result.error) {
    emit("error", result.error);
  }
};

const handleRemove = () => {
  appliedCouponData.value = null;
  couponCode.value = "";
  emit("removed");
};

const toggleInput = () => {
  showInput.value = !showInput.value;
  if (!showInput.value) {
    handleRemove();
  }
};

// Watch for purchaseAmount changes to recalculate discount
watch(
  () => props.purchaseAmount,
  (newAmount) => {
    if (appliedCouponData.value && newAmount !== undefined) {
      const recalculated = applyCoupon(appliedCouponData.value.coupon, newAmount);
      appliedCouponData.value = recalculated;
      emit("applied", recalculated);
    }
  }
);
</script>

<template>
  <div :class="cn('flex flex-col gap-2', props.class)">
    <!-- Toggle button when no coupon applied -->
    <button
      v-if="!showInput && !hasAppliedCoupon"
      type="button"
      class="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      @click="toggleInput"
    >
      <Tag class="h-4 w-4" />
      <span>Have a promo code?</span>
    </button>

    <!-- Applied coupon display -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="hasAppliedCoupon && appliedCouponData"
        class="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900"
          >
            <Percent class="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
          <div class="flex flex-col">
            <span class="text-sm font-medium text-green-800 dark:text-green-200">
              {{ appliedCouponData.coupon.code }}
            </span>
            <span class="text-xs text-green-600 dark:text-green-400">
              {{ formatDiscount(appliedCouponData.coupon) }}
              <template v-if="purchaseAmount">
                &mdash; You save ${{ appliedCouponData.discountAmount.toFixed(2) }}
              </template>
            </span>
          </div>
        </div>
        <button
          type="button"
          class="flex h-6 w-6 items-center justify-center rounded-full text-green-600 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900 transition-colors"
          @click="handleRemove"
          aria-label="Remove coupon"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </Transition>

    <!-- Coupon input form -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div v-if="showInput && !hasAppliedCoupon" class="flex flex-col gap-2">
        <div v-if="label" class="flex items-center justify-between">
          <label
            :for="id"
            class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {{ label }}
          </label>
          <button
            type="button"
            class="text-xs text-muted-foreground hover:text-foreground transition-colors"
            @click="toggleInput"
          >
            Cancel
          </button>
        </div>
        <div class="flex gap-2">
          <div class="relative flex-1">
            <Input
              :id="id"
              v-model="couponCode"
              type="text"
              placeholder="Enter code"
              :disabled="disabled || isValidating"
              class="uppercase"
              :class="validationError ? 'border-destructive' : ''"
              @keyup.enter="handleApply"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            :disabled="!couponCode.trim() || isValidating || disabled"
            @click="handleApply"
          >
            <Loader2 v-if="isValidating" class="h-4 w-4 animate-spin" />
            <Check v-else class="h-4 w-4" />
            <span class="sr-only">Apply</span>
          </Button>
        </div>
        <Transition
          enter-active-class="transition-opacity duration-200 ease-out"
          leave-active-class="transition-opacity duration-150 ease-in"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <p
            v-if="validationError"
            class="text-[10px] font-medium uppercase tracking-wide text-destructive"
          >
            {{ validationError }}
          </p>
        </Transition>
      </div>
    </Transition>
  </div>
</template>
