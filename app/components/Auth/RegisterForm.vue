<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ref, onMounted, watch } from "vue";
import { useForm, Field as VeeField } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { z } from "zod";
import { refDebounced } from "@vueuse/core";
import type { AppliedCoupon } from "@/composables/useCoupons";

const { $gsap } = useNuxtApp();
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "vue-sonner";
import { Loader2, Check, X } from "lucide-vue-next";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();

const emit = defineEmits<{
  (
    e: "submit",
    values: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      coupon?: AppliedCoupon;
    }
  ): void;
  (e: "login"): void;
}>();

// Coupon state
const appliedCoupon = ref<AppliedCoupon | null>(null);

const handleCouponApplied = (coupon: AppliedCoupon) => {
  appliedCoupon.value = coupon;
};

const handleCouponRemoved = () => {
  appliedCoupon.value = null;
};

const handleCouponError = (error: string) => {
  toast.error("Invalid coupon", {
    description: error,
  });
};

const formSchema = toTypedSchema(
  z
    .object({
      firstName: z.string().min(1, "First name is required"),
      lastName: z.string().min(1, "Last name is required"),
      email: z.string().email("Please enter a valid email address"),
      password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number"),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    })
);

const { handleSubmit, isSubmitting, values } = useForm({
  validationSchema: formSchema,
  initialValues: {
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  },
});

const cardRef = ref<InstanceType<typeof Card> | null>(null);
const passwordValue = ref("");
const debouncedPassword = refDebounced(passwordValue, 300);

const passwordRequirements = ref([
  { label: "At least 8 characters", met: false },
  { label: "One uppercase letter", met: false },
  { label: "One lowercase letter", met: false },
  { label: "One number", met: false },
]);

watch(debouncedPassword, (newPassword) => {
  const reqs = passwordRequirements.value;
  if (reqs[0]) reqs[0].met = newPassword.length >= 8;
  if (reqs[1]) reqs[1].met = /[A-Z]/.test(newPassword);
  if (reqs[2]) reqs[2].met = /[a-z]/.test(newPassword);
  if (reqs[3]) reqs[3].met = /[0-9]/.test(newPassword);
});

const onSubmit = handleSubmit(async (values) => {
  try {
    const { confirmPassword, ...submitValues } = values;
    emit("submit", {
      ...submitValues,
      coupon: appliedCoupon.value || undefined,
    });
  } catch (error) {
    toast.error("Registration failed", {
      description: "Please try again later.",
    });
  }
});

onMounted(() => {
  const el = cardRef.value?.$el;
  if (el && $gsap) {
    $gsap.fromTo(
      el,
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }
    );
  }
});
</script>

<template>
  <div :class="cn('flex flex-col gap-6', props.class)">
    <Card ref="cardRef">
      <CardHeader>
        <CardTitle class="text-2xl">Create an account</CardTitle>
        <CardDescription>
          Enter your details below to create your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form @submit="onSubmit" class="space-y-2">
          <div class="grid grid-cols-2 gap-4">
            <VeeField v-slot="{ field, errors }" name="firstName">
              <FormCustomInput
                id="firstName"
                label="First name"
                type="text"
                placeholder="John"
                v-bind="field"
                :error-message="errors[0]"
              />
            </VeeField>

            <VeeField v-slot="{ field, errors }" name="lastName">
              <FormCustomInput
                id="lastName"
                label="Last name"
                type="text"
                placeholder="Doe"
                v-bind="field"
                :error-message="errors[0]"
              />
            </VeeField>
          </div>

          <VeeField v-slot="{ field, errors }" name="email">
            <FormCustomInput
              id="email"
              label="Email"
              type="email"
              placeholder="m@example.com"
              v-bind="field"
              :error-message="errors[0]"
            />
          </VeeField>

          <VeeField v-slot="{ field, errors }" name="password">
            <FormCustomInput
              id="password"
              label="Password"
              type="password"
              v-bind="field"
              :error-message="errors[0]"
              @input="passwordValue = ($event.target as HTMLInputElement).value"
            >
              <template #after>
                <div class="mt-2 mb-3 space-y-1">
                  <TransitionGroup
                    enter-active-class="transition-all duration-200 ease-out"
                    leave-active-class="transition-all duration-150 ease-in"
                    enter-from-class="opacity-0 -translate-x-2"
                    enter-to-class="opacity-100 translate-x-0"
                    leave-from-class="opacity-100 translate-x-0"
                    leave-to-class="opacity-0 -translate-x-2"
                  >
                    <div
                      v-for="req in passwordRequirements"
                      :key="req.label"
                      class="flex items-center gap-2 text-xs"
                      :class="
                        req.met ? 'text-green-600' : 'text-muted-foreground'
                      "
                    >
                      <Check v-if="req.met" class="h-3 w-3" />
                      <X v-else class="h-3 w-3" />
                      <span>{{ req.label }}</span>
                    </div>
                  </TransitionGroup>
                </div>
              </template>
            </FormCustomInput>
          </VeeField>

          <VeeField v-slot="{ field, errors }" name="confirmPassword">
            <FormCustomInput
              id="confirmPassword"
              label="Confirm Password"
              type="password"
              v-bind="field"
              :error-message="errors[0]"
            />
          </VeeField>

          <!-- Coupon Code Input -->
          <FormCouponCodeInput
            id="couponCode"
            class="pt-2"
            @applied="handleCouponApplied"
            @removed="handleCouponRemoved"
            @error="handleCouponError"
          />

          <div class="flex flex-col gap-3 pt-2">
            <Button type="submit" class="w-full" :disabled="isSubmitting">
              <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
              {{ isSubmitting ? "Creating account..." : "Create account" }}
            </Button>

            <p class="text-center text-sm text-muted-foreground">
              Already have an account?
              <button
                type="button"
                class="text-foreground underline-offset-4 hover:underline font-medium transition-colors"
                @click="emit('login')"
              >
                Sign in
              </button>
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
