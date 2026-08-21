<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ref, onMounted } from "vue";
import { useForm, Field as VeeField } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { z } from "zod";

const { $gsap } = useNuxtApp();
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "vue-sonner";
import { Loader2, ArrowLeft, Mail } from "lucide-vue-next";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();

const emit = defineEmits<{
  (e: "submit", values: { email: string }): void;
  (e: "back-to-login"): void;
}>();

const formSchema = toTypedSchema(
  z.object({
    email: z.string().email("Please enter a valid email address"),
  })
);

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: formSchema,
  initialValues: {
    email: "",
  },
});

const cardRef = ref<HTMLElement | null>(null);
const successRef = ref<HTMLElement | null>(null);
const isSuccess = ref(false);
const submittedEmail = ref("");

const onSubmit = handleSubmit(async (values) => {
  try {
    submittedEmail.value = values.email!;
    emit("submit", { email: values.email! });

    // Animate transition to success state
    const cardEl = cardRef.value;
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
                { opacity: 0, y: 10 },
                { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }
              );
            }
          });
        },
      });
    }
  } catch (error) {
    toast.error("Request failed", {
      description: "Please try again later.",
    });
  }
});

</script>

<template>
  <div :class="cn('flex flex-col gap-6', props.class)">
    <div ref="cardRef" class="glass-surface glass-surface--strong enter-rise p-8 sm:p-10">
      <div class="mb-7 space-y-1.5">
        <h1 class="type-section type-flush">Reset your password</h1>
        <p class="type-meta">
          {{
            isSuccess
              ? "Check your email for a reset link"
              : "Enter your email and we'll send you a link to reset your password"
          }}
        </p>
      </div>
        <form v-if="!isSuccess" @submit="onSubmit" class="space-y-2">
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

          <div class="flex flex-col gap-3 pt-3">
            <Button type="submit" size="lg" class="w-full rounded-full" :disabled="isSubmitting">
              <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
              {{ isSubmitting ? "Sending..." : "Send reset link" }}
            </Button>

            <button
              type="button"
              class="inline-flex items-center justify-center gap-1 text-sm t-text-muted hover:t-text transition-colors"
              @click="emit('back-to-login')"
            >
              <ArrowLeft class="h-3.5 w-3.5" />
              Back to login
            </button>
          </div>
        </form>

        <div v-else ref="successRef" class="space-y-4 text-center">
          <div
            class="mx-auto flex h-12 w-12 items-center justify-center rounded-full t-bg-accent/10"
          >
            <Mail class="h-6 w-6 t-text-accent" />
          </div>
          <div class="space-y-2">
            <p class="type-meta">We've sent a password reset link to</p>
            <p class="font-medium t-text">{{ submittedEmail }}</p>
            <p class="type-meta">Please check your inbox and spam folder.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            class="w-full rounded-full mt-4"
            @click="emit('back-to-login')"
          >
            <ArrowLeft class="mr-2 h-4 w-4" />
            Back to login
          </Button>
        </div>
    </div>
  </div>
</template>
