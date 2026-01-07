<template>
	<div class="sell-sheet t-bg min-h-screen">
		<!-- Floating Navigation -->
		<nav
			class="floating-nav fixed top-0 left-0 right-0 z-50 px-6 py-4 transition-all duration-500"
			:class="[
				showNav ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0',
				scrolledPastHero ? 'bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-sm' : ''
			]">
			<div class="max-w-6xl mx-auto flex items-center justify-between">
				<NuxtLink to="/" class="t-heading text-xl font-light t-text hover:t-text-accent transition-colors">
					HOA Connect
				</NuxtLink>
				<div class="flex items-center gap-6">
					<button
						@click="scrollToPlans"
						class="text-sm t-text-secondary hover:t-text transition-colors hidden sm:block">
						Pricing
					</button>
					<NuxtLink
						to="/"
						class="group flex items-center gap-2 px-4 py-2 rounded-full border t-border hover:t-border-accent transition-all duration-300">
						<UIcon
							name="i-heroicons-arrow-left"
							class="w-4 h-4 t-text-tertiary group-hover:t-text-accent group-hover:-translate-x-1 transition-all duration-300" />
						<span class="text-sm t-text-secondary group-hover:t-text-accent transition-colors">For Board Members</span>
					</NuxtLink>
				</div>
			</div>
		</nav>

		<!-- Hero Section -->
		<section ref="heroRef" class="hero min-h-screen flex flex-col justify-center items-center relative px-6">
			<!-- Hero Background -->
			<div class="fixed inset-0 z-0 hero-bg-container">
				<div
					class="hero-image w-full h-full flex items-center justify-center opacity-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
					<!-- Abstract pattern overlay -->
					<div class="absolute inset-0 opacity-20">
						<div class="absolute inset-0" style="background-image: url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23C9A96E\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E');"></div>
					</div>
				</div>
				<div class="absolute inset-0 bg-gradient-to-b from-black/40 to-black/60"></div>
			</div>

			<div class="hero-content text-center relative z-10 lg:-mt-32">
				<div class="hero-badge inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gold/30 bg-gold/10 mb-8 opacity-0">
					<UIcon name="i-heroicons-building-office" class="w-4 h-4 text-gold" />
					<span class="text-xs tracking-[0.2em] uppercase text-gold">For Property Managers</span>
				</div>
				<h1
					class="hero-title t-heading text-[clamp(2.5rem,10vw,5rem)] font-light tracking-tight leading-[0.9] mb-8 opacity-0 text-cream">
					Scale Your Portfolio<br />
					<span class="t-text-accent">Not Your Workload</span>
				</h1>
				<div class="hero-divider w-16 h-px t-bg-accent mx-auto mb-4 lg:mb-8 opacity-0 scale-x-0"></div>
				<p class="hero-tagline text-[clamp(1rem,2vw,1.25rem)] font-light text-cream-alt opacity-0 max-w-2xl mx-auto">
					Manage multiple HOAs from a single dashboard. Beautiful client-facing portals.
					Zero per-building software headaches.
				</p>
			</div>
			<div
				class="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-0 scroll-indicator z-10">
				<span class="text-[0.625rem] tracking-[0.2em] uppercase t-text-tertiary">Scroll to discover</span>
				<div class="w-px h-10 bg-gradient-to-b from-gold to-transparent scroll-line"></div>
			</div>
		</section>

		<!-- Value Prop Section -->
		<section ref="introRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-section-alt">
			<div class="max-w-6xl mx-auto">
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
					<div
						v-for="(stat, index) in heroStats"
						:key="index"
						class="text-center lg:text-left opacity-0 intro-stat">
						<span class="t-heading text-[clamp(3rem,8vw,4.5rem)] font-light t-text-accent block leading-none">{{ stat.value }}</span>
						<span class="text-sm tracking-wider uppercase t-text-tertiary mt-2 block">{{ stat.label }}</span>
					</div>
				</div>
			</div>
		</section>

		<!-- The PM Problem Section -->
		<section ref="problemRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg">
			<div class="max-w-6xl mx-auto">
				<div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
					<div class="content-label flex flex-col gap-2 opacity-0">
						<span class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent">01</span>
						<span class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary">The Challenge</span>
					</div>
					<div class="content-main min-w-0 overflow-hidden">
						<div class="max-w-3xl">
							<h2
								class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0">
								One Login Per Building is Broken
							</h2>
							<p class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0">
								You manage 15 buildings. That means 15 logins, 15 separate dashboards, 15 different
								ways to check if Mrs. Rodriguez's maintenance request got handled. Your clients
								deserve better software, but you can't afford the context-switching tax.
							</p>

							<div class="pain-points grid grid-cols-1 sm:grid-cols-2 gap-4 my-8">
								<div
									v-for="(pain, index) in painPoints"
									:key="index"
									class="pain-point flex items-start gap-3 p-4 t-bg-subtle opacity-0">
									<UIcon name="i-heroicons-x-circle" class="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
									<span class="text-sm t-text-secondary">{{ pain }}</span>
								</div>
							</div>

							<p
								class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0">
								Your time is worth more than managing software.
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- The Solution Section -->
		<section ref="solutionRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg-alt">
			<div class="max-w-6xl mx-auto">
				<div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
					<div class="content-label flex flex-col gap-2 opacity-0">
						<span class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent">02</span>
						<span class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary">The Solution</span>
					</div>
					<div class="content-main max-w-4xl min-w-0 overflow-hidden">
						<h2
							class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0">
							One Dashboard. Every Building.
						</h2>
						<p class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0">
							HOA Connect's property manager portal gives you a single command center for your
							entire portfolio. Switch between buildings instantly. See alerts across all properties.
							Give each client a stunning, branded portal they'll actually be proud of.
						</p>

						<!-- Feature Image Placeholder -->
						<div
							class="aspect-[16/9] t-bg-subtle flex items-center justify-center mb-8 opacity-0 section-image">
							<div class="text-center p-8">
								<UIcon name="i-heroicons-squares-2x2" class="w-12 h-12 t-text-muted mx-auto mb-3" />
								<p class="text-sm t-text-tertiary font-medium mb-2">PORTFOLIO DASHBOARD</p>
								<p class="text-xs t-text-muted max-w-md mx-auto">
									Screenshot showing multi-property dashboard with building cards, alert summary, and quick-switch navigation.
								</p>
							</div>
						</div>

						<div class="solutions-grid grid grid-cols-1 sm:grid-cols-2 gap-6 my-8">
							<div
								v-for="(solution, index) in solutions"
								:key="index"
								class="solution-item flex gap-4 items-start opacity-0">
								<div class="solution-icon w-6 h-6 flex-shrink-0 t-text-accent-tertiary">
									<UIcon :name="solution.icon" class="w-6 h-6" />
								</div>
								<div>
									<p class="text-sm font-medium t-text mb-1">{{ solution.title }}</p>
									<p class="text-[0.875rem] leading-relaxed t-text-secondary">{{ solution.text }}</p>
								</div>
							</div>
						</div>

						<p
							class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0">
							More buildings, less overhead.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- White Label Section -->
		<section ref="whitelabelRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg">
			<div class="max-w-6xl mx-auto">
				<div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
					<div class="content-label flex flex-col gap-2 opacity-0">
						<span class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent">03</span>
						<span class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary">Your Brand</span>
					</div>
					<div class="content-main min-w-0 overflow-hidden">
						<div class="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-8 lg:gap-12">
							<div class="max-w-xl">
								<h2
									class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0">
									White-Label Ready
								</h2>
								<p class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0">
									Your clients see your brand, not ours. Custom domains, your logo, your colors.
									HOA Connect powers the experience—you take the credit.
								</p>

								<div class="whitelabel-features flex flex-col gap-0 my-8">
									<div
										v-for="(feature, index) in whitelabelFeatures"
										:key="index"
										class="whitelabel-item flex items-center gap-4 py-4 border-b t-border-divider opacity-0">
										<UIcon :name="feature.icon" class="w-5 h-5 t-text-accent-tertiary" />
										<span class="text-[0.9375rem] t-text-secondary">{{ feature.text }}</span>
									</div>
								</div>

								<p class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 opacity-0">
									They'll never know it's not custom-built.
								</p>
							</div>
							<div
								class="aspect-[3/4] t-bg-subtle flex items-center justify-center opacity-0 section-image">
								<div class="text-center p-6">
									<UIcon name="i-heroicons-paint-brush" class="w-10 h-10 t-text-muted mx-auto mb-3" />
									<p class="text-sm t-text-tertiary font-medium mb-2">BRAND CUSTOMIZATION</p>
									<p class="text-xs t-text-muted">
										Side-by-side showing same portal with two different brand treatments.
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Pricing Section -->
		<section ref="pricingRef" id="plans" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg-alt">
			<div class="max-w-6xl mx-auto">
				<div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
					<div class="content-label flex flex-col gap-2 opacity-0">
						<span class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent">04</span>
						<span class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary">Pricing</span>
					</div>
					<div class="content-main max-w-4xl min-w-0 overflow-hidden">
						<h2
							class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-4 opacity-0">
							Portfolio Pricing
						</h2>
						<p class="section-subtitle text-sm tracking-[0.15em] uppercase t-text-accent-tertiary mb-8 opacity-0">
							Volume Discounts Built In
						</p>
						<p class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0">
							The more buildings you bring, the better the rate. No per-seat licenses.
							No surprise fees. Just straightforward per-unit pricing that rewards growth.
						</p>

						<!-- PM Pricing Tiers -->
						<div class="pricing-cards grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
							<div
								v-for="(tier, index) in pmPricingTiers"
								:key="index"
								class="pricing-card p-6 t-bg-elevated border-2 transition relative opacity-0"
								:class="[
									tier.featured
										? 't-border-accent'
										: 't-border hover:t-border-accent',
								]">
								<div
									v-if="tier.featured"
									class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
									<span
										class="t-bg-accent t-text-inverse px-3 py-1 text-xs font-semibold tracking-wider uppercase"
										>Best Value</span
									>
								</div>

								<div class="text-center mb-6">
									<h4 class="t-heading text-xl font-normal t-text mb-2">
										{{ tier.name }}
									</h4>
									<p class="text-xs t-text-tertiary mb-3">{{ tier.buildings }}</p>
									<div class="text-3xl font-light t-text-accent mb-1">
										${{ tier.price }}
										<span class="text-sm t-text-secondary">/unit/mo</span>
									</div>
									<p class="text-xs t-text-tertiary" v-if="tier.discount">
										{{ tier.discount }} off standard rates
									</p>
								</div>

								<ul class="space-y-2 mb-6">
									<li
										v-for="(feature, fIndex) in tier.features"
										:key="fIndex"
										class="flex items-start text-sm">
										<span class="w-1.5 h-1.5 t-bg-accent rounded-full flex-shrink-0 mt-2 mr-3"></span>
										<span class="t-text-secondary">{{ feature }}</span>
									</li>
								</ul>

								<button
									@click="contactSales(tier.name)"
									class="w-full py-3 text-sm font-medium transition"
									:class="[
										tier.featured
											? 't-btn'
											: 't-bg-subtle t-text hover:opacity-80',
									]">
									{{ tier.cta }}
								</button>
							</div>
						</div>

						<p
							class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0">
							One relationship. Unlimited buildings.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- Onboarding Section -->
		<section ref="onboardingRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg">
			<div class="max-w-6xl mx-auto">
				<div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
					<div class="content-label flex flex-col gap-2 opacity-0">
						<span class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent">05</span>
						<span class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary">Onboarding</span>
					</div>
					<div class="content-main max-w-4xl min-w-0 overflow-hidden">
						<h2
							class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0">
							We Handle the Heavy Lifting
						</h2>
						<p class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0">
							Our team migrates your documents, imports your resident lists, and configures each
							building's portal. You get a polished product to present to your clients—not a DIY project.
						</p>

						<div class="onboarding-steps grid grid-cols-1 sm:grid-cols-3 gap-6 my-8">
							<div
								v-for="(step, index) in onboardingSteps"
								:key="index"
								class="onboarding-step text-center p-6 t-bg-subtle opacity-0">
								<div class="w-12 h-12 rounded-full t-bg-accent t-text-inverse flex items-center justify-center mx-auto mb-4">
									<span class="t-heading text-lg">{{ index + 1 }}</span>
								</div>
								<p class="text-sm font-medium t-text mb-2">{{ step.title }}</p>
								<p class="text-xs t-text-secondary">{{ step.text }}</p>
							</div>
						</div>

						<p
							class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0">
							Launch-ready in 2 weeks, not 2 months.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- CTA Section -->
		<section ref="ctaRef" class="section relative py-32 lg:py-40 px-6 lg:px-16 bg-gray-900 text-cream overflow-hidden">
			<div class="absolute inset-0 z-0 opacity-20">
				<div class="absolute inset-0" style="background-image: url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23C9A96E\' fill-opacity=\'0.1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E');"></div>
			</div>

			<div class="max-w-3xl mx-auto text-center relative z-10">
				<h2 class="cta-headline t-heading text-[clamp(2rem,5vw,3.5rem)] font-light leading-tight mb-8 opacity-0">
					Ready to Simplify<br />
					Your Portfolio Management?
				</h2>
				<p class="cta-body text-[1.0625rem] leading-relaxed text-cream-alt mb-12 opacity-0">
					Let's talk about your buildings. We'll show you exactly how HOA Connect
					can streamline your operations and impress your clients.
				</p>
				<div class="cta-divider w-16 h-px t-bg-accent mx-auto mb-12 opacity-0 scale-x-0"></div>
				<div class="cta-buttons flex flex-col sm:flex-row gap-4 justify-center opacity-0">
					<button
						@click="contactSales('Demo')"
						class="t-btn px-8 py-4 text-lg font-semibold transition shadow-lg">
						Schedule a Demo
					</button>
					<a
						href="https://1033lenox.com"
						target="_blank"
						class="t-bg-elevated t-text-accent px-8 py-4 text-lg font-semibold hover:opacity-90 transition shadow-lg inline-block">
						See Live Example
					</a>
				</div>
				<p class="cta-address text-sm tracking-wide text-cream-alt opacity-0 mt-12 uppercase">
					hoaconnect.info · Built for Property Managers
				</p>
			</div>
		</section>
	</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const { forceThemeStyle } = useTheme();

// Force Classic theme
forceThemeStyle('classic');

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger);

// Section refs
const heroRef = ref(null);
const introRef = ref(null);
const problemRef = ref(null);
const solutionRef = ref(null);
const whitelabelRef = ref(null);
const pricingRef = ref(null);
const onboardingRef = ref(null);
const ctaRef = ref(null);

// Navigation scroll state
const showNav = ref(false);
const scrolledPastHero = ref(false);

const handleScroll = () => {
	const scrollY = window.scrollY;
	const heroHeight = heroRef.value?.offsetHeight || window.innerHeight;
	showNav.value = scrollY > 100;
	scrolledPastHero.value = scrollY > heroHeight * 0.8;
};

// Data
const heroStats = [
	{ value: '5-20', label: 'Buildings per PM relationship' },
	{ value: '1', label: 'Dashboard to manage them all' },
	{ value: '0', label: 'Per-seat license fees' },
];

const painPoints = [
	'Logging into 15 different platforms daily',
	'No cross-portfolio visibility or reporting',
	'Generic software that embarrasses your brand',
	'Hours wasted on manual data entry',
	'Clients asking for features you can\'t deliver',
	'No bulk operations or portfolio-wide actions',
];

const solutions = [
	{ icon: 'i-heroicons-squares-2x2', title: 'Portfolio Dashboard', text: 'See all buildings at a glance with unified alerts and quick-switch navigation' },
	{ icon: 'i-heroicons-document-chart-bar', title: 'Cross-Building Reports', text: 'Generate portfolio-wide financial summaries and compliance reports' },
	{ icon: 'i-heroicons-user-group', title: 'Bulk Operations', text: 'Send announcements, update documents, or manage users across multiple buildings' },
	{ icon: 'i-heroicons-bell-alert', title: 'Unified Notifications', text: 'One inbox for maintenance requests, compliance alerts, and resident inquiries' },
];

const whitelabelFeatures = [
	{ icon: 'i-heroicons-globe-alt', text: 'Custom domains for each building (e.g., portal.yourpmcompany.com/building-name)' },
	{ icon: 'i-heroicons-paint-brush', text: 'Your logo, colors, and branding throughout' },
	{ icon: 'i-heroicons-envelope', text: 'Emails sent from your domain, not ours' },
	{ icon: 'i-heroicons-eye-slash', text: 'No "Powered by HOA Connect" badges' },
];

const pmPricingTiers = [
	{
		name: 'Starter',
		buildings: '1-5 buildings',
		price: '3.50',
		discount: null,
		features: [
			'Portfolio dashboard',
			'All Professional features',
			'Cross-building reporting',
			'Standard onboarding',
		],
		cta: 'Get Started',
	},
	{
		name: 'Growth',
		buildings: '6-15 buildings',
		price: '3.00',
		discount: '15%',
		featured: true,
		features: [
			'Everything in Starter',
			'White-label options',
			'Priority onboarding',
			'Dedicated account rep',
		],
		cta: 'Contact Sales',
	},
	{
		name: 'Enterprise',
		buildings: '16+ buildings',
		price: 'Custom',
		discount: 'Volume',
		features: [
			'Everything in Growth',
			'Full white-label',
			'API access',
			'Custom integrations',
			'SLA guarantee',
		],
		cta: 'Let\'s Talk',
	},
];

const onboardingSteps = [
	{ title: 'Discovery Call', text: 'We learn your portfolio and requirements' },
	{ title: 'Data Migration', text: 'We import documents, residents, and financials' },
	{ title: 'Go Live', text: 'Branded portals ready to impress your clients' },
];

// Helper functions
const scrollToPlans = () => {
	if (import.meta.client) {
		const plansSection = document.getElementById('plans');
		plansSection?.scrollIntoView({ behavior: 'smooth' });
	}
};

const contactSales = (tier) => {
	// For now, navigate to setup or a contact page
	navigateTo(`/setup?source=pm&tier=${tier.toLowerCase()}`);
};

// GSAP animations
let ctx;

onMounted(() => {
	window.addEventListener('scroll', handleScroll, { passive: true });
	handleScroll();

	ctx = gsap.context(() => {
		// Hero animations
		const heroTl = gsap.timeline({ delay: 0.3 });
		heroTl
			.to('.hero-image', { opacity: 1, duration: 1.2, ease: 'power2.out' })
			.to('.hero-badge', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, '-=0.6')
			.to('.hero-title', { opacity: 1, y: 0, duration: 1, ease: 'power3.out' }, '-=0.3')
			.to('.hero-divider', { opacity: 1, scaleX: 1, duration: 0.6, ease: 'power3.out' }, '-=0.4')
			.to('.hero-tagline', { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.3')
			.to('.scroll-indicator', { opacity: 1, duration: 0.6, ease: 'power3.out' }, '-=0.2');

		// Scroll line animation
		gsap.to('.scroll-line', {
			scaleY: 0.7,
			opacity: 0.5,
			duration: 1.5,
			repeat: -1,
			yoyo: true,
			ease: 'power2.inOut',
		});

		// Hero content parallax
		gsap.to('.hero-content', {
			y: 350,
			ease: 'none',
			scrollTrigger: {
				trigger: heroRef.value,
				start: 'top top',
				end: 'bottom top',
				scrub: true,
			},
		});

		// Fade out scroll indicator
		gsap.fromTo(
			'.scroll-indicator',
			{ opacity: 1, y: 0 },
			{
				opacity: 0,
				y: 30,
				ease: 'none',
				scrollTrigger: {
					trigger: heroRef.value,
					start: 'top top',
					end: '20% top',
					scrub: true,
				},
			}
		);

		// Section animations helper
		const animateSection = (sectionRef, selectors) => {
			if (!sectionRef.value) return;
			selectors.forEach((selector) => {
				const elements = sectionRef.value.querySelectorAll(selector);
				elements.forEach((el, elIndex) => {
					gsap.fromTo(
						el,
						{ opacity: 0, y: 30 },
						{
							opacity: 1,
							y: 0,
							duration: 0.8,
							ease: 'power3.out',
							scrollTrigger: {
								trigger: el,
								start: 'top 85%',
								toggleActions: 'play none none none',
							},
							delay: elIndex * 0.1,
						}
					);
				});
			});
		};

		// Animate all sections
		animateSection(introRef, ['.intro-stat']);
		animateSection(problemRef, ['.content-label', '.section-title', '.section-body', '.pain-point', '.section-tagline']);
		animateSection(solutionRef, ['.content-label', '.section-title', '.section-body', '.section-image', '.solution-item', '.section-tagline']);
		animateSection(whitelabelRef, ['.content-label', '.section-title', '.section-body', '.whitelabel-item', '.section-tagline', '.section-image']);
		animateSection(pricingRef, ['.content-label', '.section-title', '.section-subtitle', '.section-body', '.pricing-card', '.section-tagline']);
		animateSection(onboardingRef, ['.content-label', '.section-title', '.section-body', '.onboarding-step', '.section-tagline']);

		// CTA section
		if (ctaRef.value) {
			gsap.fromTo(
				ctaRef.value.querySelector('.cta-headline'),
				{ opacity: 0, y: 40 },
				{
					opacity: 1,
					y: 0,
					duration: 1,
					ease: 'power3.out',
					scrollTrigger: { trigger: ctaRef.value, start: 'top 70%' },
				}
			);
			gsap.fromTo(
				ctaRef.value.querySelector('.cta-body'),
				{ opacity: 0, y: 30 },
				{
					opacity: 1,
					y: 0,
					duration: 0.8,
					ease: 'power3.out',
					scrollTrigger: { trigger: ctaRef.value, start: 'top 70%' },
					delay: 0.2,
				}
			);
			gsap.fromTo(
				ctaRef.value.querySelector('.cta-divider'),
				{ opacity: 0, scaleX: 0 },
				{
					opacity: 1,
					scaleX: 1,
					duration: 0.6,
					ease: 'power3.out',
					scrollTrigger: { trigger: ctaRef.value, start: 'top 70%' },
					delay: 0.4,
				}
			);
			gsap.fromTo(
				ctaRef.value.querySelector('.cta-buttons'),
				{ opacity: 0, y: 20 },
				{
					opacity: 1,
					y: 0,
					duration: 0.6,
					ease: 'power3.out',
					scrollTrigger: { trigger: ctaRef.value, start: 'top 70%' },
					delay: 0.5,
				}
			);
			gsap.fromTo(
				ctaRef.value.querySelector('.cta-address'),
				{ opacity: 0 },
				{
					opacity: 1,
					duration: 0.6,
					ease: 'power3.out',
					scrollTrigger: { trigger: ctaRef.value, start: 'top 70%' },
					delay: 0.6,
				}
			);
		}
	});
});

onUnmounted(() => {
	window.removeEventListener('scroll', handleScroll);
	if (ctx) ctx.revert();
});

// SEO
useHead({
	title: 'HOA Connect for Property Managers | Portfolio Management',
	meta: [
		{
			name: 'description',
			content:
				'Manage multiple HOA properties from one dashboard. White-label portals, cross-building reporting, and volume pricing for property management companies.',
		},
	],
});
</script>

<style scoped>
.sell-sheet {
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

.hero {
	clip-path: inset(0);
}

.hero-bg-container {
	position: fixed;
	inset: 0;
}

.section {
	position: relative;
	z-index: 10;
}

:deep(html) {
	scroll-behavior: smooth;
}

.content-label {
	@media (min-width: theme('screens.lg')) {
		position: sticky;
		top: 8rem;
		align-self: start;
		height: fit-content;
	}
}
</style>
