<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import { toast } from "vue-sonner";
import {
  passwordResetRequestSchema,
  type PasswordResetRequestSchema,
} from "~/schemas/auth";

interface Props {
  title?: string;
  description?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: "Reset your password",
  description: "Enter your email to receive a password reset link",
});

const emit = defineEmits<{
  success: [];
  error: [error: Error];
}>();

const { requestPasswordReset } = useDirectusAuth();

const loading = ref(false);
const success = ref(false);
const hasSubmitted = ref(false);
const {
  animateError,
  animateValidationError,
  animateSuccess,
  animateButtonLoading,
  resetButtonLoading,
} = useFormAnimations();

const form = useForm({
  validationSchema: toTypedSchema(passwordResetRequestSchema),
  initialValues: {
    email: "",
  },
});

const handleBlur = async (fieldName: keyof PasswordResetRequestSchema) => {
  const result = await form.validateField(fieldName);
  if (result.errors.length > 0) {
    animateValidationError(fieldName as string);
  }
};
const onSubmit = form.handleSubmit(
  async (values: PasswordResetRequestSchema) => {
    hasSubmitted.value = true;
    loading.value = true;
    const submitBtn = document.querySelector(".submit-button");
    if (submitBtn) {
      animateButtonLoading(submitBtn as HTMLElement);
    }

    try {
      await requestPasswordReset(values.email);

      success.value = true;

      if (submitBtn) {
        animateSuccess(submitBtn as HTMLElement);
      }

      toast.success("Reset link sent!", {
        description: "Check your email for the password reset link.",
      });

      emit("success");
    } catch (err: any) {
      const errorMessage =
        err.message || "Failed to send reset link. Please try again.";

      const card = document.querySelector(".auth-card");
      if (card) {
        animateError(card as HTMLElement);
      }

      toast.error("Request failed", {
        description: errorMessage,
      });

      emit("error", err);
    } finally {
      loading.value = false;
      if (submitBtn) {
        resetButtonLoading(submitBtn as HTMLElement);
      }
    }
  },
  async () => {
    hasSubmitted.value = true;
    Object.keys(form.errors.value).forEach((fieldName) => {
      animateValidationError(fieldName);
    });
  }
);
</script>

<template>
  <Card class="w-full max-w-md mx-auto auth-card">
    <CardHeader>
      <CardTitle>{{ title }}</CardTitle>
      <CardDescription>{{ description }}</CardDescription>
    </CardHeader>

    <CardContent>
      <div v-if="success" class="space-y-4">
        <Alert>
          <AlertDescription>
            Check your email for a link to reset your password. If it doesn't
            appear within a few minutes, check your spam folder.
          </AlertDescription>
        </Alert>
        <Button as-child variant="outline" class="w-full">
          <NuxtLink to="/auth/login"> Back to login </NuxtLink>
        </Button>
      </div>

      <form v-else @submit="onSubmit" class="space-y-4">
        <FormField v-slot="{ componentField }" name="email">
          <FormItem class="form-field">
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input
                type="email"
                placeholder="name@example.com"
                v-bind="componentField"
                @blur="handleBlur('email')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <Button type="submit" class="w-full submit-button" :disabled="loading">
          {{ loading ? "Sending..." : "Send reset link" }}
        </Button>
      </form>
    </CardContent>

    <CardFooter v-if="!success" class="flex justify-center">
      <NuxtLink to="/auth/login" class="text-sm text-primary hover:underline">
        Back to login
      </NuxtLink>
    </CardFooter>
  </Card>
</template>
