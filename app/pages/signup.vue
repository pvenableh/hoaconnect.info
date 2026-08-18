<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({ layout: "auth-blank" });

const router = useRouter();
const { register } = useDirectusAuth();
const { activeHoa } = useActiveHoa();
const isLoading = ref(false);

const handleSubmit = async (values: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}) => {
  isLoading.value = true;
  try {
    await register({
      email: values.email,
      password: values.password,
      first_name: values.firstName,
      last_name: values.lastName,
    });
    toast.success("Account created!", {
      description: "Please check your email to verify your account.",
    });
    router.push("/auth/login");
  } catch (error: any) {
    toast.error("Registration failed", {
      description: error.message || "Please try again.",
    });
  } finally {
    isLoading.value = false;
  }
};

const handleLogin = () => {
  router.push("/auth/login");
};

// Set SEO meta based on organization context
useSeoMeta({
  title: () =>
    activeHoa.value
      ? `Sign Up - ${activeHoa.value.name}`
      : "Sign Up - HOA Connect",
  description: () =>
    activeHoa.value
      ? `Create an account to join ${activeHoa.value.name}`
      : "Create an account on HOA Connect",
});
</script>

<template>
  <AuthShell>
    <AuthRegisterForm @submit="handleSubmit" @login="handleLogin" />
  </AuthShell>
</template>
