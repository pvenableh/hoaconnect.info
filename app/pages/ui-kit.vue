<script setup lang="ts">
// Earnest design-system showcase / living style guide.
// View at /ui-kit on the main domain. Standalone (no app shell, no org context).
definePageMeta({ layout: false });
useHead({ title: 'UI Kit — Earnest design system' });

const theme = useTheme();

const accents = ['cyan', 'blue', 'violet', 'emerald', 'amber', 'rose', 'gold'] as const;
type Accent = (typeof accents)[number];
const accent = ref<Accent>('cyan');

const demoLoading = ref(true);

onMounted(() => {
	// Show the modern (sans-serif, glassy) look for the showcase.
	theme.forceThemeStyle('modern', theme.themeMode.value);
	// Let the river skeletons run for a beat, then reveal the "loaded" state.
	setTimeout(() => (demoLoading.value = false), 2600);
});

const stats = [
	{ label: 'Collected this month', value: '$18,420', icon: 'lucide:dollar-sign', trend: 8 },
	{ label: 'Outstanding dues', value: '$4,200', icon: 'lucide:alert-circle', trend: -12 },
	{ label: 'Active units', value: '28', icon: 'lucide:home', trend: 0 },
	{ label: 'Open requests', value: '3', icon: 'lucide:inbox', trend: 5 },
];

const settingsRows = [
	{ icon: 'lucide:building-2', label: 'Association profile', hint: 'Name, logo, address' },
	{ icon: 'lucide:credit-card', label: 'Billing & subscription', hint: 'Studio plan' },
	{ icon: 'lucide:banknote', label: 'Payouts (Stripe Connect)', hint: 'Manage in Org Settings → Payments' },
	{ icon: 'lucide:users', label: 'Members & roles', hint: '34 members' },
];
</script>

<template>
	<div class="ui-kit min-h-screen t-bg t-text" :class="`accent-${accent}`">
		<div class="mx-auto max-w-5xl px-5 py-10 space-y-10">
			<!-- Header -->
			<header class="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h1 class="text-2xl font-semibold tracking-tight">Earnest UI Kit</h1>
					<p class="text-sm t-text-secondary">
						Liquid glass · river motion · iOS widgets — adapts to the active theme.
					</p>
				</div>
				<div class="flex items-center gap-2">
					<button
						class="ios-card px-3 py-2 text-sm flex items-center gap-2"
						@click="theme.toggleMode()"
					>
						<Icon :name="theme.isDark.value ? 'lucide:sun' : 'lucide:moon'" class="w-4 h-4" />
						{{ theme.isDark.value ? 'Light' : 'Dark' }}
					</button>
					<button class="ios-card px-3 py-2 text-sm flex items-center gap-2" @click="demoLoading = true; setTimeout(() => (demoLoading = false), 2600)">
						<span class="spinner-ios spinner-ios--sm" />
						Replay load
					</button>
				</div>
			</header>

			<!-- Accent picker -->
			<section class="flex flex-wrap items-center gap-2">
				<span class="text-xs uppercase tracking-wider t-text-tertiary mr-1">Accent</span>
				<button
					v-for="a in accents"
					:key="a"
					class="w-7 h-7 rounded-full border border-black/5 ios-press"
					:class="[`accent-${a}`, accent === a ? 'ring-2 ring-offset-2 ring-offset-transparent' : '']"
					:style="{ backgroundColor: 'hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l))' }"
					:title="a"
					@click="accent = a"
				/>
			</section>

			<!-- Hero glass surface -->
			<WidgetGlass strong class="overflow-hidden">
				<div class="flex flex-wrap items-end justify-between gap-4">
					<div>
						<p class="text-xs uppercase tracking-widest t-text-tertiary mb-2">Sunset Villa HOA</p>
						<h2 class="text-3xl font-semibold tracking-tight">Good afternoon, Peter</h2>
						<p class="t-text-secondary mt-1">Here's how your community is doing this month.</p>
					</div>
					<button
						class="px-4 py-2 rounded-full text-sm font-medium text-white"
						:style="{ backgroundColor: 'hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l))' }"
					>
						New announcement
					</button>
				</div>
			</WidgetGlass>

			<!-- KPI widgets -->
			<section class="grid grid-cols-2 lg:grid-cols-4 gap-4">
				<WidgetStat
					v-for="s in stats"
					:key="s.label"
					:label="s.label"
					:value="s.value"
					:icon="s.icon"
					:trend="s.trend || undefined"
					:loading="demoLoading"
				/>
			</section>

			<!-- Shared DashboardStatsCard (upgraded) -->
			<section>
				<h3 class="text-sm font-semibold mb-3 t-text-secondary">DashboardStatsCard (shared component)</h3>
				<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
					<DashboardStatsCard title="Documents" :value="42" description="Published" icon="heroicons:document-text" accent="blue" />
					<DashboardStatsCard title="Units" :value="28" description="Total units" icon="heroicons:building-office" accent="violet" />
					<DashboardStatsCard title="Members" :value="96" description="Owners & Tenants" icon="heroicons:users" accent="emerald" :trend="{ value: 8, positive: true }" />
					<DashboardStatsCard title="Emails Sent" :value="318" description="This month" icon="heroicons:envelope" accent="amber" :trend="{ value: 4, positive: false }" />
				</div>
			</section>

			<!-- Two-up: settings group + skeleton demo -->
			<section class="grid md:grid-cols-2 gap-6">
				<div>
					<h3 class="text-sm font-semibold mb-3 t-text-secondary">iOS settings group</h3>
					<div class="ios-group">
						<button
							v-for="row in settingsRows"
							:key="row.label"
							class="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
						>
							<span
								class="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
								:style="{
									backgroundColor: 'hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l) / 0.12)',
									color: 'hsl(var(--app-accent-h) var(--app-accent-s) var(--app-accent-l))',
								}"
							>
								<Icon :name="row.icon" class="w-4 h-4" />
							</span>
							<span class="flex-1 min-w-0">
								<span class="block text-sm font-medium truncate">{{ row.label }}</span>
								<span class="block text-xs t-text-tertiary truncate">{{ row.hint }}</span>
							</span>
							<Icon name="lucide:chevron-right" class="w-4 h-4 t-text-muted shrink-0" />
						</button>
					</div>
				</div>

				<div>
					<h3 class="text-sm font-semibold mb-3 t-text-secondary">River-flow skeleton</h3>
					<WidgetGlass>
						<div class="flex items-center gap-3 mb-4">
							<div class="river-skeleton w-10 h-10 !rounded-full" />
							<WidgetSkeleton :lines="2" class="flex-1" />
						</div>
						<WidgetSkeleton :lines="4" />
					</WidgetGlass>
				</div>
			</section>

			<!-- Material reference strip -->
			<section>
				<h3 class="text-sm font-semibold mb-3 t-text-secondary">Glass materials</h3>
				<div class="grid grid-cols-3 gap-4">
					<div class="glass rounded-2xl h-24 flex items-center justify-center text-sm border t-border">.glass</div>
					<div class="glass-thin rounded-2xl h-24 flex items-center justify-center text-sm border t-border">.glass-thin</div>
					<div class="glass-ultra rounded-2xl h-24 flex items-center justify-center text-sm border t-border">.glass-ultra</div>
				</div>
			</section>
		</div>
	</div>
</template>
