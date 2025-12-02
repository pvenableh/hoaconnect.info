<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { ref, onMounted } from "vue";
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
import { Loader2 } from "lucide-vue-next";

const props = defineProps<{
  class?: HTMLAttributes["class"];
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

const { handleSubmit, isSubmitting, resetForm } = useForm<LoginFormValues>({
  validationSchema: formSchema,
  initialValues: {
    email: "",
    password: "",
  },
});

const cardRef = ref<InstanceType<typeof Card> | null>(null);

const onSubmit = handleSubmit(async (values) => {
  try {
    emit("submit", values);
  } catch (error) {
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
        <CardTitle class="text-2xl">Login to your account</CardTitle>
        <CardDescription>
          Enter your email below to login to your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form @submit="onSubmit" class="space-y-2">
          <VeeField v-slot="{ field, errors }" name="email">
            <FormCustomInput
              id="email"
              label="Email"
              type="email"
              placeholder="m@example.com"
              v-bind="field"
              :error-message="errors[0]"
              variant="underline"
            />
          </VeeField>

          <VeeField v-slot="{ field, errors }" name="password">
            <FormCustomInput
              id="password"
              type="password"
              v-bind="field"
              :error-message="errors[0]"
              variant="underline"
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
                >
                  Forgot your password?
                </button>
              </template>
            </FormCustomInput>
          </VeeField>

          <div class="flex flex-col gap-3 pt-2">
            <Button type="submit" class="w-full" :disabled="isSubmitting">
              <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
              {{ isSubmitting ? "Signing in..." : "Login" }}
            </Button>

            <p class="text-center text-sm text-muted-foreground">
              Don't have an account?
              <button
                type="button"
                class="text-foreground underline-offset-4 hover:underline font-medium transition-colors"
                @click="emit('register')"
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
