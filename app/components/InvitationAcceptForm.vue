<script setup lang="ts">
import { ref, onMounted } from "vue";
import { toast } from "vue-sonner";

interface Props {
  token: string;
  title?: string;
  description?: string;
  redirectTo?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: "Accept Invitation",
  description: "Complete your registration to join your HOA",
  redirectTo: "/dashboard",
});

const emit = defineEmits<{
  success: [data: any];
  error: [error: Error];
}>();

const router = useRouter();
const loading = ref(false);
const verifying = ref(true);
const invitationValid = ref(false);
const invitationDetails = ref<any>(null);

// Form state
const form = ref({
  password: "",
  confirmPassword: "",
});

// Verify invitation token on mount
onMounted(async () => {
  try {
    // Verify the invitation token is valid
    const response = await $fetch("/api/hoa/verify-invitation", {
      method: "POST",
      body: { token: props.token },
    });

    invitationDetails.value = response;
    invitationValid.value = true;
  } catch (err: any) {
    const errorMessage = err.data?.message || "Invalid or expired invitation";
    toast.error("Invitation Error", {
      description: errorMessage,
    });
    invitationValid.value = false;
  } finally {
    verifying.value = false;
  }
});

// Validation
const isValid = computed(() => {
  return (
    form.value.password.length >= 8 &&
    form.value.password === form.value.confirmPassword
  );
});

// Submit
const handleSubmit = async () => {
  if (!isValid.value) {
    toast.error("Please complete all fields correctly");
    return;
  }

  loading.value = true;

  try {
    const response = await $fetch("/api/hoa/accept-invitation", {
      method: "POST",
      body: {
        token: props.token,
        password: form.value.password,
      },
    });

    toast.success("Welcome to your HOA!", {
      description: "Your account has been created successfully.",
    });

    emit("success", response);
    await router.push(props.redirectTo);
  } catch (err: any) {
    const errorMessage =
      err.data?.message || "Failed to accept invitation. Please try again.";

    toast.error("Acceptance failed", {
      description: errorMessage,
    });

    emit("error", err);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <Card class="w-full max-w-md mx-auto">
    <CardHeader>
      <CardTitle>{{ title }}</CardTitle>
      <CardDescription>{{ description }}</CardDescription>
    </CardHeader>

    <CardContent>
      <!-- Loading State -->
      <div v-if="verifying" class="text-center py-8">
        <Icon
          name="lucide:loader-2"
          class="w-8 h-8 animate-spin mx-auto mb-4"
        />
        <p class="text-sm text-muted-foreground">Verifying invitation...</p>
      </div>

      <!-- Invalid Invitation -->
      <Alert v-else-if="!invitationValid" variant="destructive">
        <Icon name="lucide:alert-circle" class="w-4 h-4" />
        <AlertTitle>Invalid Invitation</AlertTitle>
        <AlertDescription>
          This invitation link is invalid or has expired. Please contact your
          HOA administrator for a new invitation.
        </AlertDescription>
      </Alert>

      <!-- Valid Invitation Form -->
      <div v-else class="space-y-4">
        <!-- Show invitation details -->
        <Alert>
          <Icon name="lucide:mail" class="w-4 h-4" />
          <AlertTitle>Invitation Details</AlertTitle>
          <AlertDescription>
            <div class="mt-2 space-y-1 text-sm">
              <p><strong>Email:</strong> {{ invitationDetails?.email }}</p>
              <p>
                <strong>Organization:</strong>
                {{ invitationDetails?.organizationName }}
              </p>
              <p><strong>Role:</strong> {{ invitationDetails?.roleName }}</p>
            </div>
          </AlertDescription>
        </Alert>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <FormField name="password">
            <FormItem>
              <FormLabel>Create Password *</FormLabel>
              <FormControl>
                <Input
                  v-model="form.password"
                  type="password"
                  placeholder="••••••••"
                  required
                />
              </FormControl>
              <FormDescription> At least 8 characters </FormDescription>
            </FormItem>
          </FormField>

          <FormField name="confirmPassword">
            <FormItem>
              <FormLabel>Confirm Password *</FormLabel>
              <FormControl>
                <Input
                  v-model="form.confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  required
                />
              </FormControl>
              <FormMessage
                v-if="
                  form.confirmPassword && form.password !== form.confirmPassword
                "
              >
                Passwords do not match
              </FormMessage>
            </FormItem>
          </FormField>

          <Button type="submit" class="w-full" :disabled="loading || !isValid">
            {{ loading ? "Creating account..." : "Accept & Create Account" }}
          </Button>
        </form>
      </div>
    </CardContent>
  </Card>
</template>
