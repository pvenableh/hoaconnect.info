<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ref, onMounted, watch } from "vue";
import { useForm, Field as VeeField } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { z } from "zod";
import { useDebounce } from "@vueuse/core";

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
import { Loader2, Check, X, CheckCircle2 } from "lucide-vue-next";

const props = defineProps<{
  class?: HTMLAttributes["class"];
  token?: string;
}>();

const emit = defineEmits<{
  (e: "submit", values: { password: string; token: string }): void;
  (e: "login"): void;
}>();

const formSchema = toTypedSchema(
  z
    .object({
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

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: formSchema,
  initialValues: {
    password: "",
    confirmPassword: "",
  },
});

const cardRef = ref<InstanceType<typeof Card> | null>(null);
const successRef = ref<HTMLElement | null>(null);
const isSuccess = ref(false);
const passwordValue = ref("");
const debouncedPassword = useDebounce(passwordValue, 300);

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
    emit("submit", { password: values.password, token: props.token || "" });

    // Animate transition to success state
    const cardEl = cardRef.value?.$el;
    if (cardEl && $gsap) {
      $gsap.to(cardEl.querySelector("form"), {
        opacity: 0,
        y: -10,
        duration: 0.2,
        onComplete: () => {
          isSuccess.value = true;
          nextTick(() => {
            if (successRef.value && $gsap) {
              $gsap.fromTo(
                successRef.value,
                { opacity: 0, y: 10, scale: 0.95 },
                {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  duration: 0.3,
                  ease: "power2.out",
                }
              );
            }
          });
        },
      });
    }
  } catch (error) {
    toast.error("Password reset failed", {
      description: "Please try again or request a new reset link.",
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
        <CardTitle class="text-2xl">
          {{ isSuccess ? "Password reset successful" : "Set new password" }}
        </CardTitle>
        <CardDescription>
          {{
            isSuccess
              ? "Your password has been updated successfully"
              : "Enter your new password below"
          }}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form v-if="!isSuccess" @submit="onSubmit" class="space-y-2">
          <VeeField v-slot="{ field, errors }" name="password">
            <FormCustomInput
              id="password"
              label="New Password"
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
              label="Confirm New Password"
              type="password"
              v-bind="field"
              :error-message="errors[0]"
            />
          </VeeField>

          <div class="flex flex-col gap-3 pt-2">
            <Button type="submit" class="w-full" :disabled="isSubmitting">
              <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
              {{ isSubmitting ? "Resetting password..." : "Reset password" }}
            </Button>
          </div>
        </form>

        <div v-else ref="successRef" class="space-y-4 text-center">
          <div
            class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
          >
            <CheckCircle2 class="h-6 w-6 text-green-600" />
          </div>
          <div class="space-y-2">
            <p class="text-sm text-muted-foreground">
              Your password has been successfully reset. You can now sign in
              with your new password.
            </p>
          </div>
          <Button type="button" class="w-full mt-4" @click="emit('login')">
            Continue to login
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
