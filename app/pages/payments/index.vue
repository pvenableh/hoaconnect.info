<template>
  <div class="container max-w-6xl mx-auto py-8 px-4">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        My Payments
      </h1>
      <p class="text-gray-600 dark:text-gray-400">
        View and pay your HOA dues, assessments, and other charges.
      </p>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex justify-center items-center py-12">
      <div
        class="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"
      ></div>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="!paymentRequests || paymentRequests.length === 0"
      class="text-center py-12"
    >
      <Icon
        name="heroicons:document-text"
        class="mx-auto h-16 w-16 text-gray-400 mb-4"
      />
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
        No Payment Requests
      </h3>
      <p class="text-gray-600 dark:text-gray-400">
        You don't have any payment requests at this time.
      </p>
    </div>

    <!-- Payment Requests List -->
    <div v-else class="space-y-6">
      <!-- Outstanding Payments -->
      <div v-if="outstandingRequests.length > 0">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Outstanding Payments
        </h2>
        <div class="space-y-4">
          <div
            v-for="request in outstandingRequests"
            :key="request.id"
            class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border-l-4"
            :class="{
              'border-red-500': request.status === 'overdue',
              'border-yellow-500': request.status === 'active',
              'border-blue-500': request.status === 'partially_paid',
            }"
          >
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
                <div class="flex items-center space-x-3 mb-2">
                  <h3
                    class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    {{ request.title }}
                  </h3>
                  <span
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                    :class="{
                      'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200':
                        request.status === 'overdue',
                      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200':
                        request.status === 'active',
                      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200':
                        request.status === 'partially_paid',
                    }"
                  >
                    {{ formatStatus(request.status) }}
                  </span>
                </div>
                <p
                  v-if="request.description"
                  class="text-gray-600 dark:text-gray-400 text-sm mb-2"
                >
                  {{ request.description }}
                </p>
                <div
                  class="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400"
                >
                  <span class="flex items-center">
                    <Icon name="heroicons:calendar" class="h-4 w-4 mr-1" />
                    Due: {{ formatDate(request.due_date) }}
                  </span>
                  <span class="flex items-center">
                    <Icon name="heroicons:tag" class="h-4 w-4 mr-1" />
                    {{ formatRequestType(request.request_type) }}
                  </span>
                </div>
              </div>
              <div class="text-right">
                <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  ${{
                    formatNumber(request.amount_remaining || request.amount)
                  }}
                </p>
                <p
                  v-if="request.amount_paid > 0"
                  class="text-sm text-gray-500 dark:text-gray-400"
                >
                  of ${{ formatNumber(request.amount) }}
                </p>
              </div>
            </div>

            <!-- Progress Bar for Partially Paid -->
            <div v-if="request.status === 'partially_paid'" class="mb-4">
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  class="bg-blue-600 h-2 rounded-full"
                  :style="{
                    width: `${(request.amount_paid / request.amount) * 100}%`,
                  }"
                ></div>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                ${{ formatNumber(request.amount_paid) }} paid
              </p>
            </div>

            <div class="flex items-center space-x-3">
              <Button @click="payRequest(request)" class="flex-1">
                <Icon name="heroicons:credit-card" class="mr-2 h-4 w-4" />
                Pay Now
              </Button>
              <Button @click="viewDetails(request)" variant="outline">
                <Icon name="heroicons:eye" class="mr-2 h-4 w-4" />
                Details
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- Paid Payments -->
      <div v-if="paidRequests.length > 0">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Payment History
        </h2>
        <div class="space-y-4">
          <div
            v-for="request in paidRequests"
            :key="request.id"
            class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border-l-4 border-green-500"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center space-x-3 mb-2">
                  <h3
                    class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    {{ request.title }}
                  </h3>
                  <span
                    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  >
                    Paid
                  </span>
                </div>
                <div
                  class="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400"
                >
                  <span class="flex items-center">
                    <Icon name="heroicons:check-circle" class="h-4 w-4 mr-1" />
                    Paid on: {{ formatDate(request.paid_at) }}
                  </span>
                </div>
              </div>
              <div class="text-right">
                <p class="text-xl font-bold text-gray-900 dark:text-gray-100">
                  ${{ formatNumber(request.amount) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Payment Modal -->
    <Dialog v-model:open="showPaymentModal">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Make Payment</DialogTitle>
          <DialogDescription>
            {{ selectedRequest?.title }}
          </DialogDescription>
        </DialogHeader>

        <div v-if="selectedRequest" class="py-4">
          <PaymentMethods
            :email="userEmail"
            :amount="selectedRequest.amount_remaining || selectedRequest.amount"
            :metadata="{
              organizationId: selectedRequest.organization,
              memberId: selectedRequest.member,
              paymentRequestId: selectedRequest.id,
              description: selectedRequest.title,
            }"
            return-url="/payments?payment_success=true"
            @success="handlePaymentSuccess"
            @error="handlePaymentError"
          />
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
const router = useRouter();
const { activeHoa, fetchActiveHoa } = useActiveHoa();
const { user } = useDirectusAuth();

// State
const isLoading = ref(true);
const paymentRequests = ref<any[]>([]);
const showPaymentModal = ref(false);
const selectedRequest = ref<any>(null);
const userEmail = computed(() => user.value?.email || "");

// Computed
const outstandingRequests = computed(() => {
  return paymentRequests.value.filter((r) =>
    ["active", "overdue", "partially_paid"].includes(r.status)
  );
});

const paidRequests = computed(() => {
  return paymentRequests.value.filter((r) => r.status === "paid");
});

// Load payment requests
const loadPaymentRequests = async () => {
  try {
    // Try to use the already-loaded activeHoa, otherwise fetch it
    let org = activeHoa?.value;
    if (!org) {
      org = await fetchActiveHoa();
    }
    if (!org) {
      return;
    }

    // Fetch payment requests for current user
    const response = await $fetch<{ data?: any[] }>(
      `/api/directus/items/payment_requests`,
      {
        params: {
          filter: {
            organization: { _eq: org.id },
            member: { _eq: user.value?.id },
          },
          sort: ["-date_created"],
        },
      }
    );

    paymentRequests.value = response.data ?? [];
  } catch (err: any) {
    console.error("Failed to load payment requests:", err);
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  loadPaymentRequests();
});

// Methods
const formatNumber = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatDate = (date: string) => {
  if (!date) return "No due date";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatStatus = (status: string) => {
  const statusMap: Record<string, string> = {
    active: "Active",
    overdue: "Overdue",
    partially_paid: "Partially Paid",
    paid: "Paid",
    canceled: "Canceled",
  };
  return statusMap[status] || status;
};

const formatRequestType = (type: string) => {
  const typeMap: Record<string, string> = {
    monthly_dues: "Monthly Dues",
    assessment: "Assessment",
    late_fee: "Late Fee",
    other: "Other",
  };
  return typeMap[type] || type;
};

const payRequest = (request: any) => {
  selectedRequest.value = request;
  showPaymentModal.value = true;
};

const viewDetails = (request: any) => {
  router.push(`/payments/${request.id}`);
};

const handlePaymentSuccess = () => {
  showPaymentModal.value = false;
  selectedRequest.value = null;
  // Reload payment requests
  loadPaymentRequests();
};

const handlePaymentError = (error: Error) => {
  console.error("Payment error:", error);
  // Error is already shown in the payment component
};

// Set page meta
definePageMeta({
  layout: "default",
  middleware: ["auth", "subscription"],
});

useSeoMeta({
  title: "My Payments",
  description: "View and manage your HOA payments",
});
</script>
