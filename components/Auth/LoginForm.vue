<script setup lang="ts">
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import { toast } from "vue-sonner";
import { loginSchema, type LoginSchema } from "~/schemas/auth";

interface Props {
  title?: string;
  description?: string;
  showOAuth?: boolean;
  redirectTo?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: "Welcome back",
  description: "Enter your credentials to access your account",
  showOAuth: true,
  redirectTo: "/",
});

const emit = defineEmits<{
  success: [user: any];
  error: [error: Error];
}>();

const { login, loginWithGitHub, loginWithGoogle } = useDirectusAuth();
const router = useRouter();

const loading = ref(false);
const {
  formRef,
  animateError,
  animateValidationError,
  animateSuccess,
  animateButtonLoading,
  resetButtonLoading,
} = useFormAnimations();

const form = useForm({
  validationSchema: toTypedSchema(loginSchema),
  initialValues: {
    email: "",
    password: "",
  },
});

watch(
  () => form.errors.value,
  (errors) => {
    (Object.keys(errors) as Array<keyof typeof errors>).forEach((fieldName) => {
      if (errors[fieldName]) {
        animateValidationError(fieldName);
      }
    });
  }
);

const onSubmit = form.handleSubmit(async (values: LoginSchema) => {
  loading.value = true;
  const submitBtn = document.querySelector(".submit-button");
  if (submitBtn) {
    animateButtonLoading(submitBtn as HTMLElement);
  }

  try {
    const result = await login(values.email, values.password);

    if (submitBtn) {
      animateSuccess(submitBtn as HTMLElement);
    }

    toast.success("Welcome back!", {
      description: "You have successfully logged in.",
    });

    emit("success", result.user);
    await router.push(props.redirectTo);
  } catch (err: any) {
    const errorMessage = err.message || "Login failed. Please try again.";

    if (formRef.value) {
      animateError(formRef.value);
    }

    toast.error("Login failed", {
      description: errorMessage,
    });

    emit("error", err);
  } finally {
    loading.value = false;
    if (submitBtn) {
      resetButtonLoading(submitBtn as HTMLElement);
    }
  }
});

const handleOAuthLogin = (provider: "github" | "google") => {
  if (provider === "github") {
    loginWithGitHub();
  } else {
    loginWithGoogle();
  }
};
</script>

<template>
  <Card ref="formRef" class="w-full max-w-md mx-auto">
    <CardHeader>
      <CardTitle>{{ title }}</CardTitle>
      <CardDescription>{{ description }}</CardDescription>
    </CardHeader>

    <CardContent class="space-y-4">
      <form @submit="onSubmit" class="space-y-4">
        <FormField v-slot="{ componentField }" name="email">
          <FormItem class="form-field">
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input
                type="email"
                placeholder="name@example.com"
                v-bind="componentField"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="password">
          <FormItem class="form-field">
            <FormLabel>Password</FormLabel>
            <FormControl>
              <Input
                type="password"
                placeholder="••••••••"
                v-bind="componentField"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <div class="flex items-center justify-between">
          <NuxtLink
            to="/auth/forgot-password"
            class="text-sm text-primary hover:underline"
          >
            Forgot password?
          </NuxtLink>
        </div>

        <Button type="submit" class="w-full submit-button" :disabled="loading">
          {{ loading ? "Signing in..." : "Sign in" }}
        </Button>
      </form>

      <div v-if="showOAuth" class="space-y-3">
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <span class="w-full border-t" />
          </div>
          <div class="relative flex justify-center text-xs uppercase">
            <span class="bg-background px-2 text-muted-foreground">
              Or continue with
            </span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            type="button"
            @click="handleOAuthLogin('github')"
          >
            GitHub
          </Button>

          <Button
            variant="outline"
            type="button"
            @click="handleOAuthLogin('google')"
          >
            Google
          </Button>
        </div>
      </div>
    </CardContent>

    <CardFooter class="flex justify-center">
      <p class="text-sm text-muted-foreground">
        Don't have an account?
        <NuxtLink to="/auth/register" class="text-primary hover:underline">
          Sign up
        </NuxtLink>
      </p>
    </CardFooter>
  </Card>
</template>
