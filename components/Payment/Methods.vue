<template>
	<div class="w-full flex flex-col payment-methods">
		<h1 class="text-2xl font-bold mb-2 uppercase tracking-wider">Payment</h1>
		<p class="mt-2 mb-6 text-sm text-gray-600 dark:text-gray-400">
			Please note, a credit card payment will add a 2.9% + $0.30 processing fee. Using a bank account for payment adds
			<strong>no fees.</strong>
		</p>

		<!-- Total Display -->
		<div class="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-6">
			<h5 class="text-lg font-semibold uppercase tracking-wide">
				<span class="text-gray-600 dark:text-gray-400">Total:</span>
				<span class="ml-2">${{ formatNumber(totalWithFees) }}</span>
			</h5>
			<p v-if="panel === 'card'" class="text-xs text-gray-500 dark:text-gray-400 mt-1 uppercase">
				Includes a ${{ stripeFee }} processing fee
			</p>
			<p v-else class="text-xs text-green-600 dark:text-green-400 mt-1 uppercase">No processing fees</p>
		</div>

		<!-- Payment Method Tabs -->
		<div class="payment-nav">
			<button
				@click.prevent="changePanel('bank', 1)"
				class="payment-nav-item"
				:class="{ active: panel === 'bank' }"
				type="button"
			>
				<Icon name="heroicons:building-library" class="h-5 w-5 mr-2" />
				<h5>Bank Account</h5>
			</button>
			<button
				@click.prevent="changePanel('card', 2)"
				class="payment-nav-item"
				:class="{ active: panel === 'card' }"
				type="button"
			>
				<Icon name="heroicons:credit-card" class="h-5 w-5 mr-2" />
				<h5>Credit Card</h5>
			</button>
		</div>

		<!-- Payment Forms -->
		<div class="payment-container">
			<Transition :name="animateName" mode="out-in">
				<PaymentStripeCard
					v-if="panel === 'bank'"
					key="bank"
					payment-type="us_bank_account"
					:amount="total"
					:email="email"
					:metadata="paymentMetadata"
					:return-url="returnUrl"
					@success="handlePaymentSuccess"
					@error="handlePaymentError"
				/>
				<PaymentStripeCard
					v-else-if="panel === 'card'"
					key="card"
					payment-type="card"
					:amount="total"
					:email="email"
					:metadata="paymentMetadata"
					:return-url="returnUrl"
					@success="handlePaymentSuccess"
					@error="handlePaymentError"
				/>
			</Transition>
		</div>
	</div>
</template>

<script setup lang="ts">
const props = defineProps({
	email: {
		type: String,
		required: true,
	},
	amount: {
		type: Number,
		required: true,
	},
	metadata: {
		type: Object as PropType<Record<string, any>>,
		default: () => ({}),
	},
	returnUrl: {
		type: String,
		default: null,
	},
});

const emit = defineEmits<{
	success: [paymentIntentId: string];
	error: [error: Error];
}>();

const panel = ref<'bank' | 'card'>('bank');
const previousPanelKey = ref(1);
const animateName = ref('slide-right');

function changePanel(newPanel: 'bank' | 'card', key: number) {
	if (previousPanelKey.value < key) {
		animateName.value = 'slide-left';
	} else {
		animateName.value = 'slide-right';
	}
	previousPanelKey.value = key;
	panel.value = newPanel;
}

const stripeFee = computed(() => {
	if (panel.value === 'bank') return '0.00';
	// Stripe standard fee: 2.9% + $0.30
	return (props.amount * 0.029 + 0.3).toFixed(2);
});

const totalWithFees = computed(() => {
	return (Number(props.amount) + Number(stripeFee.value)).toFixed(2);
});

function formatForStripe(amount: number) {
	// Convert dollars to cents (Stripe uses cents)
	return Math.round(amount * 100);
}

const total = computed(() => {
	return formatForStripe(Number(totalWithFees.value));
});

const paymentMetadata = computed(() => {
	return {
		...props.metadata,
		payment_method_selected: panel.value,
		original_amount: props.amount,
		processing_fee: stripeFee.value,
	};
});

const formatNumber = (value: number | string) => {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(Number(value));
};

const handlePaymentSuccess = (paymentIntentId: string) => {
	emit('success', paymentIntentId);
};

const handlePaymentError = (error: Error) => {
	emit('error', error);
};
</script>

<style scoped>
.payment-methods {
	max-width: 800px;
	margin: 0 auto;
}

.payment-nav {
	@apply flex flex-row justify-around items-center mb-6 border-b border-gray-200 dark:border-gray-700;
}

.payment-nav-item {
	@apply tracking-wider uppercase cursor-pointer mb-2 w-1/2 flex items-center justify-center relative py-3 px-4;
	@apply text-gray-500 dark:text-gray-400 transition-all duration-300 ease-in-out;
	opacity: 0.6;
}

.payment-nav-item h5 {
	@apply text-center text-xs font-semibold;
}

.payment-nav-item::after {
	content: '';
	display: block;
	width: 0%;
	height: 2px;
	bottom: -1px;
	left: 50%;
	background: #502989;
	transition: all 0.3s ease-in-out;
	transform: translateX(-50%);
	@apply absolute;
}

.payment-nav-item.active {
	@apply text-gray-900 dark:text-gray-100;
	opacity: 1;
}

.payment-nav-item:hover {
	opacity: 1;
}

.payment-nav-item:hover::after,
.payment-nav-item.active::after {
	width: 80%;
}

.payment-container {
	@apply flex flex-col justify-center items-center w-full overflow-hidden;
}

/* Slide Animations */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
	transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-left-enter-from {
	opacity: 0;
	transform: translateX(50px);
}

.slide-left-leave-to {
	opacity: 0;
	transform: translateX(-50px);
}

.slide-right-enter-from {
	opacity: 0;
	transform: translateX(-50px);
}

.slide-right-leave-to {
	opacity: 0;
	transform: translateX(50px);
}
</style>
