<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import { toast } from "vue-sonner";
import { passwordResetSchema, type PasswordResetSchema } from "~/schemas/auth";

interface Props {
  token: string;
  title?: string;
  description?: string;
  redirectTo?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: "Set new password",
  description: "Enter your new password below",
  redirectTo: "/auth/login",
});

const emit = defineEmits<{
  success: [];
  error: [error: Error];
}>();

const { resetPassword } = useDirectusAuth();
const router = useRouter();

const loading = ref(false);
const hasSubmitted = ref(false);
const {
  animateError,
  animateValidationError,
  animateSuccess,
  animateButtonLoading,
  resetButtonLoading,
} = useFormAnimations();

const form = useForm({
  validationSchema: toTypedSchema(passwordResetSchema),
  initialValues: {
    password: "",
    confirmPassword: "",
  },
});

const handleBlur = async (fieldName: keyof PasswordResetSchema) => {
  const result = await form.validateField(fieldName);
  if (result.errors.length > 0) {
    animateValidationError(fieldName as string);
  }
};

const onSubmit = form.handleSubmit(
  async (values: PasswordResetSchema) => {
    hasSubmitted.value = true;
    loading.value = true;
    const submitBtn = document.querySelector(".submit-button");
    if (submitBtn) {
      animateButtonLoading(submitBtn as HTMLElement);
    }

    try {
      await resetPassword(props.token, values.password);

      if (submitBtn) {
        animateSuccess(submitBtn as HTMLElement);
      }

      toast.success("Password reset!", {
        description: "Your password has been successfully reset.",
      });

      emit("success");
      await router.push(props.redirectTo);
    } catch (err: any) {
      const errorMessage =
        err.message || "Failed to reset password. The link may be expired.";

      const card = document.querySelector(".auth-card");
      if (card) {
        animateError(card as HTMLElement);
      }

      toast.error("Reset failed", {
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
      <form @submit="onSubmit" class="space-y-4">
        <FormField v-slot="{ componentField }" name="password">
          <FormItem class="form-field">
            <FormLabel>New password</FormLabel>
            <FormControl>
              <Input
                type="password"
                placeholder="••••••••"
                v-bind="componentField"
                @blur="handleBlur('password')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="confirmPassword">
          <FormItem class="form-field">
            <FormLabel>Confirm password</FormLabel>
            <FormControl>
              <Input
                type="password"
                placeholder="••••••••"
                v-bind="componentField"
                @blur="handleBlur('confirmPassword')"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <Button type="submit" class="w-full submit-button" :disabled="loading">
          {{ loading ? "Resetting..." : "Reset password" }}
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
