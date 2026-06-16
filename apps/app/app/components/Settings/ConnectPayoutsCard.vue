<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <Icon name="lucide:banknote" class="h-5 w-5" />
        Payouts (Stripe Connect)
      </CardTitle>
      <CardDescription>
        Connect a Stripe account so resident dues are deposited directly into
        your association's bank. A {{ feePercentLabel }} platform fee applies to
        each dues payment.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div class="space-y-4">
        <!-- Status row -->
        <div class="flex items-center justify-between gap-4 p-4 rounded-lg border bg-muted/30">
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-full flex items-center justify-center"
              :class="statusVisual.bg"
            >
              <Icon :name="statusVisual.icon" class="h-5 w-5" :class="statusVisual.text" />
            </div>
            <div>
              <p class="font-medium">{{ statusVisual.label }}</p>
              <p class="text-sm text-muted-foreground">{{ statusVisual.hint }}</p>
            </div>
          </div>

          <div v-if="status === 'active'" class="flex flex-col items-end gap-1 text-xs">
            <span class="inline-flex items-center gap-1 text-green-600">
              <Icon name="lucide:check" class="h-3.5 w-3.5" /> Charges enabled
            </span>
            <span class="inline-flex items-center gap-1 text-green-600">
              <Icon name="lucide:check" class="h-3.5 w-3.5" /> Payouts enabled
            </span>
          </div>
        </div>

        <!-- CTA -->
        <div class="flex justify-end">
          <Button
            v-if="status !== 'active'"
            @click="startOnboarding"
            :disabled="isWorking"
          >
            <Icon
              v-if="isWorking"
              name="lucide:loader-2"
              class="mr-2 h-4 w-4 animate-spin"
            />
            {{ ctaLabel }}
          </Button>
          <Button
            v-else
            variant="outline"
            @click="startOnboarding"
            :disabled="isWorking"
          >
            <Icon
              v-if="isWorking"
              name="lucide:loader-2"
              class="mr-2 h-4 w-4 animate-spin"
            />
            Manage account
          </Button>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import type { HoaOrganization } from "#core/types/directus";
import { toast } from "vue-sonner";

const props = defineProps<{
  organization: HoaOrganization;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const config = useRuntimeConfig();
const route = useRoute();

const isWorking = ref(false);

// Connect fields are added by scripts/add-connect-fields.ts; until
// `pnpm generate:types` is run they aren't on the HoaOrganization type, so we
// read them through a loose accessor.
const org = computed(() => props.organization as HoaOrganization & {
  stripe_connect_account_id?: string | null;
  connect_onboarding_status?: "none" | "pending" | "restricted" | "active" | null;
  connect_charges_enabled?: boolean | null;
  connect_payouts_enabled?: boolean | null;
});

const status = computed(
  () => org.value.connect_onboarding_status || "none"
);

const feePercentLabel = computed(() => {
  const pct = parseFloat((config.public as any).stripeConnectFeePercent ?? "2");
  return `${Number.isFinite(pct) ? pct : 2}%`;
});

const statusVisual = computed(() => {
  switch (status.value) {
    case "active":
      return {
        label: "Connected",
        hint: "Your association is receiving payouts.",
        icon: "lucide:check-circle-2",
        bg: "bg-green-100",
        text: "text-green-600",
      };
    case "pending":
      return {
        label: "Onboarding in progress",
        hint: "Finish the Stripe steps to start receiving payouts.",
        icon: "lucide:clock",
        bg: "bg-amber-100",
        text: "text-amber-600",
      };
    case "restricted":
      return {
        label: "Action required",
        hint: "Stripe needs more information before enabling payouts.",
        icon: "lucide:alert-triangle",
        bg: "bg-red-100",
        text: "text-red-600",
      };
    default:
      return {
        label: "Not connected",
        hint: "Set up payouts to collect dues into your own bank.",
        icon: "lucide:link",
        bg: "bg-stone-100",
        text: "text-stone-500",
      };
  }
});

const ctaLabel = computed(() =>
  status.value === "none" ? "Set up payouts" : "Continue onboarding"
);

const startOnboarding = async () => {
  isWorking.value = true;
  try {
    // Ensure a connected account exists (idempotent on the server).
    if (!org.value.stripe_connect_account_id) {
      await $fetch("/api/stripe/connect/account", {
        method: "POST",
        body: {
          organizationId: props.organization.id,
          email: (props.organization as any).email || undefined,
        },
      });
    }

    // Generate an onboarding/management link and redirect to Stripe.
    const { url } = await $fetch<{ url: string }>(
      "/api/stripe/connect/account-link",
      {
        method: "POST",
        body: {
          organizationId: props.organization.id,
          returnPath: `${route.path}?connect=return`,
          refreshPath: `${route.path}?connect=refresh`,
        },
      }
    );

    if (url) {
      window.location.href = url;
    } else {
      throw new Error("No onboarding link returned");
    }
  } catch (error: any) {
    console.error("Connect onboarding failed:", error);
    toast.error(error?.data?.message || error?.message || "Could not start Stripe onboarding");
  } finally {
    isWorking.value = false;
  }
};

// When Stripe redirects back, prompt a refresh of the org so the synced status
// shows. The account.updated webhook does the actual status sync.
onMounted(() => {
  const flag = route.query.connect;
  if (flag === "return") {
    toast.success("Returned from Stripe. Updating payout status…");
    emit("refresh");
  } else if (flag === "refresh") {
    toast.info("Onboarding link expired — please try again.");
  }
});
</script>
