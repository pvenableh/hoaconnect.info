<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import { toast } from "vue-sonner";
import { acceptInviteSchema, type AcceptInviteSchema } from "~/schemas/auth";

interface Props {
  token: string;
  title?: string;
  description?: string;
  redirectTo?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: "Accept invitation",
  description: "Set up your account to get started",
  redirectTo: "/",
});

const emit = defineEmits<{
  success: [user: any];
  error: [error: Error];
}>();

const { acceptInvite } = useDirectusAuth();
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
  validationSchema: toTypedSchema(acceptInviteSchema),
  initialValues: {
    firstName: "",
    lastName: "",
    password: "",
    confirmPassword: "",
  },
});

const handleBlur = async (fieldName: keyof AcceptInviteSchema) => {
  const result = await form.validateField(fieldName);
  if (result.errors.length > 0) {
    animateValidationError(fieldName as string);
  }
};

const onSubmit = form.handleSubmit(
  async (values: AcceptInviteSchema) => {
    hasSubmitted.value = true;
    loading.value = true;
    const submitBtn = document.querySelector(".submit-button");
    if (submitBtn) {
      animateButtonLoading(submitBtn as HTMLElement);
    }

    try {
      const result = await acceptInvite(props.token, values.password);

      if (submitBtn) {
        animateSuccess(submitBtn as HTMLElement);
      }

      toast.success("Welcome aboard!", {
        description: "Your account has been set up successfully.",
      });

      emit("success", result.user);
      await router.push(props.redirectTo);
    } catch (err: any) {
      const errorMessage =
        err.message || "Failed to accept invitation. The link may be expired.";

      const card = document.querySelector(".auth-card");
      if (card) {
        animateError(card as HTMLElement);
      }

      toast.error("Invitation failed", {
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
        <div class="grid grid-cols-2 gap-4">
          <FormField v-slot="{ componentField }" name="firstName">
            <FormItem class="form-field">
              <FormLabel>First name</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="John"
                  v-bind="componentField"
                  @blur="handleBlur('firstName')"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="lastName">
            <FormItem class="form-field">
              <FormLabel>Last name</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="Doe"
                  v-bind="componentField"
                  @blur="handleBlur('lastName')"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>

        <FormField v-slot="{ componentField }" name="password">
          <FormItem class="form-field">
            <FormLabel>Password</FormLabel>
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
          {{ loading ? "Setting up..." : "Complete setup" }}
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
