<script setup lang="ts">
import type { PaymentRequest, PaymentTransaction } from "#core/types/directus";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { user } = useDirectusAuth();
const { rise } = useMotionPresets();
const { selectedOrgId, currentOrg } = await useSelectedOrg();
const { list: listRequests } = useDirectusItems<PaymentRequest>("payment_requests");
const { list: listTransactions } = useDirectusItems<PaymentTransaction>("payment_transactions");

// The member's hoa_members id (payment_requests.member is a hoa_members M2O).
const memberId = computed(() => currentOrg.value?.id ?? null);
const userEmail = computed(() => user.value?.email || "");

// --- Data ---------------------------------------------------------------
const { data: requests, pending, refresh } = await useAsyncData(
  `member-payments-${selectedOrgId.value}`,
  async () => {
    if (!selectedOrgId.value || !memberId.value) return [];
    const rows = await listRequests({
      fields: [
        "id", "title", "description", "status", "request_type",
        "amount", "amount_paid", "amount_remaining", "due_date", "paid_at",
        "organization", "member",
      ],
      filter: {
        organization: { _eq: selectedOrgId.value },
        member: { _eq: memberId.value },
        status: { _neq: "draft" },
      },
      sort: ["-date_created"],
    });
    return (rows || []) as PaymentRequest[];
  },
  { watch: [selectedOrgId, memberId], server: false }
);

const { data: transactions } = await useAsyncData(
  `member-transactions-${selectedOrgId.value}`,
  async () => {
    if (!selectedOrgId.value || !memberId.value) return [];
    const rows = await listTransactions({
      fields: ["id", "amount", "status", "description", "receipt_url", "date_created", "stripe_payment_method"],
      filter: {
        organization: { _eq: selectedOrgId.value },
        member: { _eq: memberId.value },
        status: { _eq: "succeeded" },
      },
      sort: ["-date_created"],
      limit: 20,
    });
    return (rows || []) as PaymentTransaction[];
  },
  { watch: [selectedOrgId, memberId], server: false }
);

const outstanding = computed(() =>
  (requests.value || []).filter((r) =>
    ["active", "overdue", "partially_paid"].includes(r.status as string)
  )
);
const paid = computed(() =>
  (requests.value || []).filter((r) => r.status === "paid")
);
const totalDue = computed(() =>
  outstanding.value.reduce((sum, r) => sum + (r.amount_remaining ?? r.amount ?? 0), 0)
);

// History came from two places — Stripe transactions, and requests an admin
// marked paid offline — and used to render as two stacked `v-for`s in one
// tbody, which meant the list was only sorted within each half. Merging them
// into one shape first makes the whole history sort by date, and makes the
// sortable headers tell the truth.
const history = computed(() => [
  ...(transactions.value || []).map((tx) => ({
    id: `tx-${tx.id}`,
    description: tx.description || "Payment",
    date: tx.date_created,
    amount: tx.amount,
    receiptUrl: tx.receipt_url || null,
  })),
  ...paid.value.map((r) => ({
    id: `req-${r.id}`,
    description: r.title,
    date: r.paid_at,
    amount: r.amount,
    receiptUrl: null,
  })),
]);

const historyColumns = [
  { key: "description", label: "Description", sortable: true },
  { key: "date", label: "Date", sortable: true, hideOnMobile: true },
  { key: "amount", label: "Amount", align: "right" as const, sortable: true, class: "tabular-nums" },
  { key: "receiptUrl", label: "Receipt", align: "right" as const, hideOnMobile: true },
];

// --- Pay flow -----------------------------------------------------------
const showPaymentModal = ref(false);
const selectedRequest = ref<PaymentRequest | null>(null);

const payRequest = (request: PaymentRequest) => {
  selectedRequest.value = request;
  showPaymentModal.value = true;
};

const handlePaymentSuccess = async () => {
  showPaymentModal.value = false;
  selectedRequest.value = null;
  // Stripe confirms async via webhook; refresh shortly after to pick up status.
  setTimeout(() => refresh(), 1500);
};
const handlePaymentError = (error: Error) => {
  console.error("Payment error:", error);
};

// --- Formatting ---------------------------------------------------------
const currency = (value?: number | null) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

const formatDate = (date?: string | null) => {
  if (!date) return "No due date";
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

const STATUS_LABEL: Record<string, string> = {
  active: "Due", overdue: "Overdue", partially_paid: "Partially Paid",
  paid: "Paid", canceled: "Canceled",
};
const TYPE_LABEL: Record<string, string> = {
  monthly_dues: "Monthly Dues", assessment: "Assessment", late_fee: "Late Fee", other: "Other",
};
</script>

<template>
  <div class="ui-kit accent-emerald min-h-screen t-bg">
    <PageContainer class="space-y-6">
      <!-- Glass hero -->
      <WidgetGlass strong>
        <p class="text-xs uppercase tracking-widest t-text-tertiary mb-1.5">Payments</p>
        <h1 class="text-3xl font-semibold tracking-tight t-text">My Payments</h1>
        <p class="t-text-secondary mt-1">
          View and pay your HOA dues, assessments, and other charges.
        </p>
        <p v-if="totalDue > 0" class="mt-3 text-lg font-semibold t-text">
          {{ currency(totalDue) }} <span class="t-text-muted font-normal">currently due</span>
        </p>
      </WidgetGlass>

      <!-- Loading — content-shaped skeleton matching the cards below -->
      <div v-if="pending" class="space-y-3">
        <div v-for="i in 3" :key="i" class="ios-card p-5">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0 space-y-2.5">
              <div class="river-skeleton h-4 w-2/5" :style="{ animationDelay: `${(i - 1) * 90}ms` }" />
              <div class="river-skeleton h-3 w-3/4" :style="{ animationDelay: `${(i - 1) * 90 + 40}ms` }" />
              <div class="river-skeleton h-3 w-1/3" :style="{ animationDelay: `${(i - 1) * 90 + 70}ms` }" />
            </div>
            <div class="river-skeleton h-7 w-24 flex-shrink-0 rounded-lg" :style="{ animationDelay: `${(i - 1) * 90}ms` }" />
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="!requests?.length" class="ios-card p-12 text-center">
        <Icon name="heroicons:check-circle" class="mx-auto h-14 w-14 t-text-muted mb-3" />
        <h3 class="text-lg font-medium t-text mb-1">You're all caught up</h3>
        <p class="t-text-muted">You don't have any payment requests at this time.</p>
      </div>

      <template v-else>
        <!-- Outstanding -->
        <section v-if="outstanding.length" class="space-y-3">
          <h2 class="text-lg font-semibold t-text">Outstanding</h2>
          <div
            v-for="(request, i) in outstanding"
            :key="request.id"
            v-motion
            v-bind="rise(i)"
            class="ios-card p-5 border-l-4"
            :class="{
              'border-red-500': request.status === 'overdue',
              'border-amber-500': request.status === 'active',
              'border-blue-500': request.status === 'partially_paid',
            }"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-semibold t-text">{{ request.title }}</h3>
                  <span
                    class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                    :class="{
                      'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200': request.status === 'overdue',
                      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200': request.status === 'active',
                      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200': request.status === 'partially_paid',
                    }"
                  >{{ STATUS_LABEL[request.status as string] || request.status }}</span>
                </div>
                <p v-if="request.description" class="text-sm t-text-muted mt-1">{{ request.description }}</p>
                <div class="flex items-center gap-4 text-sm t-text-muted mt-2">
                  <span class="inline-flex items-center gap-1">
                    <Icon name="heroicons:calendar" class="h-4 w-4" /> Due {{ formatDate(request.due_date) }}
                  </span>
                  <span class="inline-flex items-center gap-1">
                    <Icon name="heroicons:tag" class="h-4 w-4" /> {{ TYPE_LABEL[request.request_type as string] || request.request_type }}
                  </span>
                </div>
              </div>
              <div class="text-right shrink-0">
                <p class="text-2xl font-bold tabular-nums t-text">
                  {{ currency(request.amount_remaining ?? request.amount) }}
                </p>
                <p v-if="(request.amount_paid || 0) > 0" class="text-sm t-text-muted">
                  of {{ currency(request.amount) }}
                </p>
              </div>
            </div>

            <!-- Partial progress -->
            <div v-if="request.status === 'partially_paid' && request.amount" class="mt-4">
              <div class="w-full bg-black/[0.06] dark:bg-white/[0.08] rounded-full h-2">
                <div
                  class="bg-blue-600 h-2 rounded-full"
                  :style="{ width: `${Math.min(100, ((request.amount_paid || 0) / request.amount) * 100)}%` }"
                />
              </div>
              <p class="text-xs t-text-muted mt-1">{{ currency(request.amount_paid) }} paid</p>
            </div>

            <div class="mt-4">
              <Button class="rounded-full" @click="payRequest(request)">
                <Icon name="heroicons:credit-card" class="mr-2 h-4 w-4" /> Pay Now
              </Button>
            </div>
          </div>
        </section>

        <!-- Payment history (transactions with receipts) -->
        <section v-if="history.length" class="space-y-3">
          <h2 class="type-section">Payment History</h2>

          <div class="ios-card overflow-hidden px-2 pb-2">
            <AppDataTable
              :columns="historyColumns"
              :rows="history"
              empty-title="No payments yet"
              empty-description="Payments you make will show up here with their receipts."
              empty-icon="lucide:receipt"
            >
              <template #cell-description="{ value }">
                <span class="t-text">{{ value }}</span>
              </template>
              <template #cell-date="{ value }">
                <span class="t-text-muted">{{ formatDate(value as string) }}</span>
              </template>
              <template #cell-amount="{ value }">
                <span class="font-medium t-text">{{ currency(value as number) }}</span>
              </template>
              <template #cell-receiptUrl="{ value }">
                <a
                  v-if="value"
                  :href="value as string"
                  target="_blank"
                  rel="noopener"
                  class="inline-flex items-center justify-center w-9 h-9 rounded-full t-bg-subtle hover:opacity-80 transition-opacity"
                  title="View receipt"
                >
                  <Icon name="heroicons:arrow-top-right-on-square" class="h-4 w-4" />
                </a>
                <span v-else class="t-text-muted">—</span>
              </template>
            </AppDataTable>
          </div>
        </section>
      </template>

      <!-- Payment modal -->
      <Dialog v-model:open="showPaymentModal">
        <DialogContent class="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Make Payment</DialogTitle>
            <DialogDescription>{{ selectedRequest?.title }}</DialogDescription>
          </DialogHeader>
          <div v-if="selectedRequest" class="py-2">
            <PaymentMethods
              :email="userEmail"
              :amount="selectedRequest.amount_remaining ?? selectedRequest.amount ?? 0"
              :metadata="{
                organizationId: selectedRequest.organization,
                memberId: selectedRequest.member,
                paymentRequestId: selectedRequest.id,
                description: selectedRequest.title,
                routeDuesToConnect: true,
              }"
              return-url="/payments?payment_success=true"
              @success="handlePaymentSuccess"
              @error="handlePaymentError"
            />
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  </div>
</template>
