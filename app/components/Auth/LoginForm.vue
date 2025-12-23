<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ref, onMounted, computed } from "vue";
import { useForm, Field as VeeField } from "vee-validate";
import { toTypedSchema } from "@vee-validate/zod";
import { z } from "zod";

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
import { Loader2, AlertCircle } from "lucide-vue-next";

const props = defineProps<{
  class?: HTMLAttributes["class"];
  isLoading?: boolean;
  organizationName?: string | null;
  allowedDomain?: string | null;
}>();

const emit = defineEmits<{
  (e: "submit", values: { email: string; password: string }): void;
  (e: "forgot-password"): void;
  (e: "register"): void;
}>();

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const formSchema = toTypedSchema(loginSchema);

const { handleSubmit, isSubmitting, resetForm, values, setErrors, setFieldError } = useForm<LoginFormValues>({
  validationSchema: formSchema,
  initialValues: {
    email: "",
    password: "",
  },
});

// Track form-level error (e.g., from server)
const formError = ref<string | null>(null);

// Expose method to set errors from parent
const setFormError = (message: string | null, fieldErrors?: { email?: string; password?: string }) => {
  formError.value = message;
  if (fieldErrors) {
    if (fieldErrors.email) {
      setFieldError('email', fieldErrors.email);
    }
    if (fieldErrors.password) {
      setFieldError('password', fieldErrors.password);
    }
  }
};

// Clear form error when user starts typing
const clearFormError = () => {
  formError.value = null;
};

defineExpose({ setFormError, resetForm });

const cardRef = ref<InstanceType<typeof Card> | null>(null);

// Combined loading state from form submission and external loading
const isProcessing = computed(() => isSubmitting.value || props.isLoading);

// Extract email domain from input
const getEmailDomain = (email: string): string | null => {
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : null;
};

// Validate email domain matches organization's allowed domain
const validateEmailDomain = (email: string): boolean => {
  if (!props.allowedDomain) return true; // No restriction if no allowed domain

  const emailDomain = getEmailDomain(email);
  if (!emailDomain) return false;

  // Compare the email domain with the organization's custom domain
  const normalizedAllowedDomain = props.allowedDomain.toLowerCase().replace(/^www\./, "");
  return emailDomain === normalizedAllowedDomain;
};

const onSubmit = handleSubmit(async (values) => {
  console.log('[LoginForm] Form submitted, emitting to parent...');

  // Note: Removed email domain validation that was comparing user email domain
  // against the website's custom domain. Users can have any email address.

  try {
    emit("submit", { email: values.email!, password: values.password! });
  } catch (error) {
    console.error('[LoginForm] Error emitting submit:', error);
    toast.error("Login failed", {
      description: "Please check your credentials and try again.",
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
          {{ organizationName ? `Login to ${organizationName}` : 'Login to your account' }}
        </CardTitle>
        <CardDescription>
          <template v-if="allowedDomain">
            Enter your {{ allowedDomain }} email to login
          </template>
          <template v-else>
            Enter your email below to login to your account
          </template>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form @submit="onSubmit" class="space-y-2">
          <!-- Form-level error alert -->
          <Transition
            enter-active-class="transition-all duration-300 ease-out"
            leave-active-class="transition-all duration-200 ease-in"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-2"
          >
            <div
              v-if="formError"
              class="flex items-center gap-2 p-3 mb-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md"
            >
              <AlertCircle class="h-4 w-4 flex-shrink-0" />
              <span>{{ formError }}</span>
            </div>
          </Transition>

          <VeeField v-slot="{ field, errors }" name="email">
            <FormCustomInput
              id="email"
              label="Email"
              type="email"
              :placeholder="allowedDomain ? `you@${allowedDomain}` : 'm@example.com'"
              v-bind="field"
              :error-message="errors[0]"
              variant="underline"
              :disabled="isProcessing"
              @input="clearFormError"
            />
          </VeeField>

          <VeeField v-slot="{ field, errors }" name="password">
            <FormCustomInput
              id="password"
              type="password"
              v-bind="field"
              :error-message="errors[0]"
              variant="underline"
              :disabled="isProcessing"
              @input="clearFormError"
            >
              <template #label>
                <label for="password" class="text-sm font-medium leading-none">
                  Password
                </label>
              </template>
              <template #label-end>
                <button
                  type="button"
                  class="text-sm text-muted-foreground underline-offset-4 hover:underline hover:text-foreground transition-colors"
                  @click="emit('forgot-password')"
                  :disabled="isProcessing"
                >
                  Forgot your password?
                </button>
              </template>
            </FormCustomInput>
          </VeeField>

          <div class="flex flex-col gap-3 pt-2">
            <Button type="submit" class="w-full" :disabled="isProcessing">
              <Loader2 v-if="isProcessing" class="mr-2 h-4 w-4 animate-spin" />
              {{ isProcessing ? "Verifying credentials..." : "Login" }}
            </Button>

            <p class="text-center text-sm text-muted-foreground">
              Don't have an account?
              <button
                type="button"
                class="text-foreground underline-offset-4 hover:underline font-medium transition-colors"
                @click="emit('register')"
                :disabled="isProcessing"
              >
                Sign up
              </button>
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  </div>
</template>
