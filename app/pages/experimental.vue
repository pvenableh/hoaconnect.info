<template>
  <div ref="containerRef" class="sell-sheet t-bg min-h-screen">
    <!-- Three.js Canvas Container (Fixed Background) -->
    <div ref="canvasContainer" class="fixed inset-0 z-0 pointer-events-none" />

    <!-- Floating Navigation -->
    <nav
      class="floating-nav fixed top-0 left-0 right-0 z-50 px-6 py-4 transition-all duration-500"
      :class="[
        showNav ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0',
        scrolledPastHero
          ? 'bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-sm'
          : '',
      ]"
    >
      <div class="max-w-6xl mx-auto flex items-center justify-between">
        <NuxtLink
          to="/"
          class="t-heading text-xl font-light t-text hover:t-text-accent transition-colors"
        >
          HOA Connect
        </NuxtLink>
        <div class="flex items-center gap-6">
          <button
            @click="scrollToPlans"
            class="text-sm t-text-secondary hover:t-text transition-colors hidden sm:block"
          >
            Pricing
          </button>
          <NuxtLink
            to="/property-managers"
            class="group flex items-center gap-2 px-4 py-2 rounded-full border t-border hover:t-border-accent transition-all duration-300"
          >
            <span
              class="text-sm t-text-secondary group-hover:t-text-accent transition-colors"
            >
              For Property Managers
            </span>
            <Icon
              name="i-heroicons-arrow-right"
              class="w-4 h-4 t-text-tertiary group-hover:t-text-accent group-hover:translate-x-1 transition-all duration-300"
            />
          </NuxtLink>
        </div>
      </div>
    </nav>

    <!-- Hero Section -->
    <section
      ref="heroRef"
      class="hero min-h-screen flex flex-col justify-center items-center relative px-6"
    >
      <!-- Gradient Overlay for readability -->
      <div
        class="absolute inset-0 z-[1] pointer-events-none"
        :style="{
          background: `radial-gradient(ellipse at center, transparent 0%, var(--theme-bg-primary) 70%)`,
        }"
      />

      <!-- Hero Content -->
      <div class="hero-content max-w-4xl mx-auto text-center relative z-10">
        <!-- Badge -->
        <div class="hero-badge opacity-0 translate-y-4 mb-6">
          <span
            class="inline-flex items-center gap-2 px-4 py-2 t-bg-subtle rounded-full"
          >
            <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span class="text-xs tracking-wider uppercase t-text-tertiary">
              Now Live in Miami Beach
            </span>
          </span>
        </div>

        <!-- Title with Shimmer Effect -->
        <h1
          class="hero-title t-heading text-[clamp(2.5rem,8vw,5rem)] font-light leading-[1.1] mb-8 opacity-0 translate-y-8"
        >
          <span class="shimmer-text">Transform Your Building</span>
          <br />
          <span class="t-text-accent">Into a Brand</span>
        </h1>

        <!-- Divider -->
        <div
          class="hero-divider w-16 h-px t-bg-accent mx-auto mb-8 opacity-0 scale-x-0"
        />

        <!-- Tagline -->
        <p
          class="hero-tagline text-lg md:text-xl t-text-secondary max-w-2xl mx-auto opacity-0 translate-y-4"
        >
          Design-forward HOA software built by a Miami Beach creative agency.
          Finally, management tools that match your building's elegance.
        </p>
      </div>

      <!-- Scroll Indicator -->
      <div
        class="scroll-indicator absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-0 z-10"
      >
        <span
          class="text-[0.625rem] tracking-[0.2em] uppercase t-text-tertiary"
        >
          Scroll to discover
        </span>
        <div class="w-px h-10 overflow-hidden">
          <div
            class="scroll-line w-full h-full bg-gradient-to-b from-[var(--theme-accent-primary)] to-transparent"
          />
        </div>
      </div>
    </section>

    <!-- The Problem Section -->
    <section
      ref="problemRef"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-bg relative z-10"
    >
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
          <div class="content-label flex flex-col gap-2 opacity-0">
            <span
              class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent"
              >01</span
            >
            <span
              class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
              >The Problem</span
            >
          </div>
          <div class="content-main min-w-0 overflow-hidden">
            <div
              class="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-8 lg:gap-12"
            >
              <div class="max-w-xl">
                <h2
                  class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
                >
                  Generic Software for Unique Buildings
                </h2>
                <p
                  class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0"
                >
                  Current HOA software treats every building the same—ugly
                  interfaces, zero personality, and no understanding of what
                  makes your community special. They're built for property
                  managers, not residents.
                </p>
                <p
                  class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0"
                >
                  Your building deserves better than a spreadsheet with a login
                  page.
                </p>
              </div>
              <!-- Interactive Image Placeholder with Particle Effect -->
              <div
                ref="problemImageRef"
                class="aspect-[3/4] t-bg-subtle flex items-end justify-end opacity-0 section-image relative overflow-hidden group cursor-pointer"
                @mouseenter="onImageHover"
                @mouseleave="onImageLeave"
              >
                <div
                  class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                />
                <div class="w-full text-left p-6 relative z-10">
                  <div
                    class="w-12 h-12 mx-auto mb-3 border-2 border-gray-400 rounded-full flex items-center justify-center group-hover:border-[var(--theme-accent-primary)] transition-colors duration-300"
                  >
                    <Icon
                      name="i-heroicons-photo"
                      class="w-6 h-6 t-text-muted group-hover:t-text-accent transition-colors duration-300"
                    />
                  </div>
                  <p class="text-sm t-text-tertiary font-medium mb-2 uppercase">
                    Competitor Comparison
                  </p>
                  <p class="text-xs t-text-muted leading-relaxed">
                    Side-by-side showing generic competitor interface vs. HOA
                    Connect's elegant design.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- The Solution Section -->
    <section
      ref="solutionRef"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-bg-alt relative z-10"
    >
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
          <div class="content-label flex flex-col gap-2 opacity-0">
            <span
              class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent"
              >02</span
            >
            <span
              class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
              >The Solution</span
            >
          </div>
          <div class="content-main max-w-4xl min-w-0 overflow-hidden">
            <h2
              class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
            >
              Agency DNA, Software Precision
            </h2>
            <p
              class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0"
            >
              We're not a software company that hired designers. We're a
              creative agency that built software—with 18+ years of brand
              positioning experience and firsthand board experience in Florida
              condominiums.
            </p>

            <!-- Advantages Grid with Hover Effects -->
            <div
              class="advantages-grid grid grid-cols-1 sm:grid-cols-2 gap-6 my-8"
            >
              <div
                v-for="(advantage, index) in advantages"
                :key="index"
                class="advantage-item group flex gap-4 items-start opacity-0 p-4 rounded-lg hover:t-bg-elevated transition-all duration-300 cursor-pointer"
                :style="{ '--delay': `${index * 0.1}s` }"
                @mouseenter="isHovering = true"
                @mouseleave="isHovering = false"
              >
                <div
                  class="advantage-icon w-10 h-10 flex-shrink-0 rounded-full t-bg-subtle flex items-center justify-center group-hover:t-bg-accent transition-all duration-300"
                >
                  <Icon
                    :name="advantage.icon"
                    class="w-5 h-5 t-text-accent-tertiary group-hover:text-white transition-colors duration-300"
                  />
                </div>
                <div>
                  <p
                    class="text-sm font-medium t-text mb-1 group-hover:t-text-accent transition-colors duration-300"
                  >
                    {{ advantage.title }}
                  </p>
                  <p class="text-[0.875rem] leading-relaxed t-text-secondary">
                    {{ advantage.text }}
                  </p>
                </div>
              </div>
            </div>

            <p
              class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0"
            >
              Built in Miami Beach. Built for Transparency.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section
      ref="featuresRef"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-bg relative z-10"
    >
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
          <div class="content-label flex flex-col gap-2 opacity-0">
            <span
              class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent"
              >03</span
            >
            <span
              class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
              >Features</span
            >
          </div>
          <div class="content-main max-w-4xl min-w-0 overflow-hidden">
            <h2
              class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
            >
              Everything Your HOA Needs
            </h2>

            <!-- Feature Image Grid with 3D Hover -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div
                ref="featureCard1Ref"
                class="feature-card-3d aspect-[4/5] t-bg-subtle flex items-center justify-center opacity-0 section-image rounded-lg overflow-hidden"
                @mousemove="onCard3DMove($event, 'card1')"
                @mouseleave="onCard3DLeave('card1')"
              >
                <div class="text-center p-4">
                  <Icon
                    name="i-heroicons-document-text"
                    class="w-8 h-8 t-text-muted mx-auto mb-2"
                  />
                  <p class="text-xs t-text-tertiary font-medium mb-1">
                    DOCUMENT LIBRARY
                  </p>
                  <p class="text-[10px] t-text-muted">
                    Version history, categorization, and secure access controls.
                  </p>
                </div>
              </div>
              <div
                ref="featureCard2Ref"
                class="feature-card-3d aspect-[10/6.1] t-bg-subtle flex items-center justify-center opacity-0 section-image md:col-span-2 rounded-lg overflow-hidden"
                @mousemove="onCard3DMove($event, 'card2')"
                @mouseleave="onCard3DLeave('card2')"
              >
                <div class="text-center p-4">
                  <Icon
                    name="i-heroicons-chart-bar"
                    class="w-8 h-8 t-text-muted mx-auto mb-2"
                  />
                  <p class="text-xs t-text-tertiary font-medium mb-1">
                    FINANCIAL DASHBOARD
                  </p>
                  <p class="text-[10px] t-text-muted">
                    Fund tracking, budget vs. actual reporting, and transaction
                    categorization.
                  </p>
                </div>
              </div>
            </div>

            <!-- Feature List -->
            <div
              class="feature-grid grid grid-cols-1 sm:grid-cols-2 gap-6 my-8"
            >
              <div
                v-for="(feature, index) in features"
                :key="index"
                :class="[
                  'feature-item group flex gap-4 items-start opacity-0 p-3 rounded-lg hover:t-bg-subtle transition-all duration-300',
                  feature.wide ? 'sm:col-span-2' : '',
                ]"
              >
                <div
                  class="feature-icon w-8 h-8 flex-shrink-0 rounded-full t-bg-subtle flex items-center justify-center group-hover:t-bg-accent group-hover:scale-110 transition-all duration-300"
                >
                  <Icon
                    :name="feature.icon"
                    class="w-4 h-4 t-text-accent-tertiary group-hover:text-white transition-colors duration-300"
                  />
                </div>
                <p
                  class="text-[0.9375rem] leading-relaxed t-text-secondary group-hover:t-text transition-colors duration-300"
                >
                  {{ feature.text }}
                </p>
              </div>
            </div>

            <p
              class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0"
            >
              Modern tech stack. Beautiful by default.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing Section -->
    <section
      ref="pricingRef"
      id="plans"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-bg-alt relative z-10"
    >
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
          <div class="content-label flex flex-col gap-2 opacity-0">
            <span
              class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent"
              >04</span
            >
            <span
              class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
              >Pricing</span
            >
          </div>
          <div class="content-main max-w-4xl min-w-0 overflow-hidden">
            <h2
              class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-4 opacity-0"
            >
              Per-Unit Pricing
            </h2>
            <p
              class="section-subtitle text-sm tracking-[0.15em] uppercase t-text-accent-tertiary mb-8 opacity-0"
            >
              Scales With Your Building
            </p>
            <p
              class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0"
            >
              Industry-standard per-unit pricing that grows naturally with your
              community. A 50-unit building generating $240,000/year in HOA fees
              would pay less than 0.4% of their budget for a complete digital
              transformation.
            </p>

            <!-- Loading State -->
            <div
              v-if="pending"
              class="text-center py-12 opacity-0 section-image"
            >
              <div
                class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 t-border-accent"
              ></div>
              <p class="mt-4 t-text-secondary">Loading plans...</p>
            </div>

            <!-- Error State -->
            <div
              v-else-if="error"
              class="text-center py-12 opacity-0 section-image"
            >
              <p class="text-red-600">
                Error loading plans. Please try again later.
              </p>
            </div>

            <!-- Pricing Cards with Glow Effect -->
            <div
              v-else-if="plans && plans.length > 0"
              class="pricing-cards grid grid-cols-1 md:grid-cols-3 gap-6 my-8"
            >
              <div
                v-for="(plan, index) in plans"
                :key="plan.id"
                class="pricing-card group p-6 t-bg-elevated border-2 transition-all duration-500 relative opacity-0 rounded-lg overflow-hidden"
                :class="[
                  plan.is_featured
                    ? 't-border-accent'
                    : 't-border hover:t-border-accent',
                ]"
                @mouseenter="onPricingHover($event, index)"
                @mouseleave="onPricingLeave(index)"
              >
                <!-- Glow Effect -->
                <div
                  class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  :style="{
                    background: `radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), var(--theme-accent-primary) 0%, transparent 50%)`,
                    opacity: 0.1,
                  }"
                />

                <!-- Featured Badge -->
                <div
                  v-if="plan.is_featured"
                  class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                >
                  <span
                    class="t-bg-accent t-text-inverse px-3 py-1 text-xs font-semibold tracking-wider uppercase rounded-full"
                  >
                    Popular
                  </span>
                </div>

                <div class="text-center mb-6 relative z-10">
                  <h4 class="t-heading text-xl font-normal t-text mb-2">
                    {{ plan.name }}
                  </h4>
                  <div class="text-3xl font-light t-text-accent mb-1">
                    ${{
                      formatPrice(plan.price_per_unit || plan.price_monthly)
                    }}
                    <span class="text-sm t-text-secondary">/unit/mo</span>
                  </div>
                  <p
                    class="text-xs t-text-tertiary"
                    v-if="plan.minimum_monthly"
                  >
                    ${{ formatPrice(plan.minimum_monthly) }} minimum
                  </p>
                </div>

                <ul class="space-y-2 mb-6 relative z-10">
                  <li
                    v-for="(feature, fIndex) in plan.features?.slice(0, 5)"
                    :key="fIndex"
                    class="flex items-start text-sm"
                  >
                    <span
                      class="w-1.5 h-1.5 t-bg-accent rounded-full flex-shrink-0 mt-2 mr-3"
                    />
                    <span class="t-text-secondary">{{ feature }}</span>
                  </li>
                </ul>

                <button
                  @click="selectPlan(plan.slug)"
                  class="w-full py-3 text-sm font-medium transition-all duration-300 relative z-10 rounded-lg"
                  :class="[
                    plan.is_featured
                      ? 't-btn'
                      : 't-bg-subtle t-text hover:opacity-80',
                  ]"
                >
                  Get Started
                </button>
              </div>
            </div>

            <!-- Fallback Static Pricing -->
            <div
              v-else
              class="pricing-cards grid grid-cols-1 md:grid-cols-3 gap-6 my-8"
            >
              <div
                v-for="(tier, index) in pricingTiers"
                :key="index"
                class="pricing-card group p-6 t-bg-elevated border-2 transition-all duration-500 relative opacity-0 rounded-lg overflow-hidden"
                :class="[
                  tier.featured
                    ? 't-border-accent'
                    : 't-border hover:t-border-accent',
                ]"
                @mouseenter="onPricingHover($event, index)"
                @mouseleave="onPricingLeave(index)"
              >
                <!-- Glow Effect -->
                <div
                  class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  :style="{
                    background: `radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), var(--theme-accent-primary) 0%, transparent 50%)`,
                    opacity: 0.1,
                  }"
                />

                <div
                  v-if="tier.featured"
                  class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                >
                  <span
                    class="t-bg-accent t-text-inverse px-3 py-1 text-xs font-semibold tracking-wider uppercase rounded-full"
                  >
                    Popular
                  </span>
                </div>

                <div class="text-center mb-6 relative z-10">
                  <h4 class="t-heading text-xl font-normal t-text mb-2">
                    {{ tier.name }}
                  </h4>
                  <div class="text-3xl font-light t-text-accent mb-1">
                    ${{ tier.price }}
                    <span class="text-sm t-text-secondary">/unit/mo</span>
                  </div>
                  <p class="text-xs t-text-tertiary">
                    ${{ tier.minimum }} minimum
                  </p>
                </div>

                <ul class="space-y-2 mb-6 relative z-10">
                  <li
                    v-for="(feature, fIndex) in tier.features"
                    :key="fIndex"
                    class="flex items-start text-sm"
                  >
                    <span
                      class="w-1.5 h-1.5 t-bg-accent rounded-full flex-shrink-0 mt-2 mr-3"
                    />
                    <span class="t-text-secondary">{{ feature }}</span>
                  </li>
                </ul>

                <button
                  @click="selectPlan(tier.slug)"
                  class="w-full py-3 text-sm font-medium transition-all duration-300 relative z-10 rounded-lg"
                  :class="[
                    tier.featured
                      ? 't-btn'
                      : 't-bg-subtle t-text hover:opacity-80',
                  ]"
                >
                  Get Started
                </button>
              </div>
            </div>

            <p
              class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0"
            >
              Less than 0.4% of your annual budget. 100% of the transformation.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Case Study Section -->
    <section
      ref="caseStudyRef"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-bg relative z-10"
    >
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
          <div class="content-label flex flex-col gap-2 opacity-0">
            <span
              class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent"
              >05</span
            >
            <span
              class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
              >Proof</span
            >
          </div>
          <div class="content-main min-w-0 overflow-hidden">
            <div
              class="grid grid-cols-1 md:grid-cols-[1fr_1fr] lg:grid-cols-[1fr_1fr] gap-8 lg:gap-12"
            >
              <div class="max-w-xl">
                <h2
                  class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
                >
                  Live at 1033 Lenox
                </h2>
                <p
                  class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0"
                >
                  Our proof-of-concept deployment at 1033 Lenox Avenue in Miami
                  Beach demonstrates a level of design sophistication that no
                  competitor in the HOA software market currently matches.
                </p>

                <!-- Animated Stats -->
                <div class="case-study-stats flex flex-col gap-0 my-8">
                  <div
                    v-for="(stat, index) in caseStudyStats"
                    :key="index"
                    class="case-study-stat flex items-center gap-4 py-4 border-b t-border-divider opacity-0"
                  >
                    <span
                      ref="caseStudyNumbersRef"
                      class="t-heading text-2xl font-light t-text-accent min-w-[80px]"
                      :data-value="stat.value"
                    >
                      {{ stat.value }}
                    </span>
                    <span class="text-[0.9375rem] t-text-secondary">{{
                      stat.label
                    }}</span>
                  </div>
                </div>

                <p
                  class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 opacity-0"
                >
                  See it live at 1033lenox.com
                </p>
              </div>

              <!-- Case Study Image -->
              <div
                class="aspect-[3/4] lg:aspect-video t-bg-subtle flex items-end justify-start opacity-0 section-image rounded-lg overflow-hidden"
              >
                <div class="text-left p-6">
                  <div
                    class="w-12 h-12 mx-auto mb-3 border-2 border-gray-400 rounded-full flex items-center justify-center"
                  >
                    <Icon
                      name="i-heroicons-building-office-2"
                      class="w-6 h-6 t-text-muted"
                    />
                  </div>
                  <p class="text-sm t-text-tertiary font-medium mb-2">
                    1033 LENOX AVENUE
                  </p>
                  <p class="text-xs t-text-muted leading-relaxed">
                    Screenshot of the 1033 Lenox building website showing the
                    branded resident portal.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Florida Focus Section -->
    <section
      ref="floridaRef"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-bg-alt relative z-10"
    >
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
          <div class="content-label flex flex-col gap-2 opacity-0">
            <span
              class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent"
              >06</span
            >
            <span
              class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
              >Compliance Focused</span
            >
          </div>
          <div class="content-main max-w-4xl min-w-0 overflow-hidden">
            <h2
              class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
            >
              Built for Compliance
            </h2>
            <p
              class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0"
            >
              Florida condominiums face unique challenges—fund segregation
              requirements, 40-year recertification tracking, and unprecedented
              compliance scrutiny. HOA Connect is built by Floridians who
              understand these pressures firsthand.
            </p>

            <!-- Florida Features with Card Hover -->
            <div
              class="florida-features grid grid-cols-1 sm:grid-cols-2 gap-6 my-8"
            >
              <div
                v-for="(feature, index) in floridaFeatures"
                :key="index"
                class="florida-feature-item group p-6 t-bg-subtle opacity-0 rounded-lg hover:shadow-lg transition-all duration-500 cursor-pointer"
                @mouseenter="isHovering = true"
                @mouseleave="isHovering = false"
              >
                <div class="flex items-start gap-4">
                  <div
                    class="florida-icon w-12 h-12 flex-shrink-0 rounded-full t-bg-elevated flex items-center justify-center group-hover:t-bg-accent transition-all duration-300"
                  >
                    <Icon
                      :name="feature.icon"
                      class="w-6 h-6 t-text-accent-tertiary group-hover:text-white transition-colors duration-300"
                    />
                  </div>
                  <div>
                    <p
                      class="text-sm font-medium t-text mb-2 group-hover:t-text-accent transition-colors duration-300"
                    >
                      {{ feature.title }}
                    </p>
                    <p class="text-[0.875rem] leading-relaxed t-text-secondary">
                      {{ feature.text }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p
              class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0"
            >
              Compliance confidence. Design excellence.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Target Market Section -->
    <section
      ref="targetRef"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-bg relative z-10"
    >
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
          <div class="content-label flex flex-col gap-2 opacity-0">
            <span
              class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent"
              >07</span
            >
            <span
              class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
              >For You</span
            >
          </div>
          <div class="content-main max-w-4xl min-w-0 overflow-hidden">
            <h2
              class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
            >
              Is HOA Connect Right for You?
            </h2>

            <!-- Target List with Stagger Animation -->
            <div
              class="target-list grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 my-8"
            >
              <div
                v-for="(target, index) in targetCustomers"
                :key="index"
                class="target-item flex items-center gap-4 py-3 opacity-0 group cursor-pointer"
              >
                <span
                  class="w-2 h-2 t-bg-accent rounded-full flex-shrink-0 group-hover:scale-150 transition-transform duration-300"
                />
                <span
                  class="text-[0.9375rem] t-text-secondary group-hover:t-text transition-colors duration-300"
                >
                  {{ target }}
                </span>
              </div>
            </div>

            <!-- Target Image -->
            <div
              class="aspect-[16/9] t-bg-subtle flex items-end justify-start mb-8 opacity-0 section-image rounded-lg overflow-hidden"
            >
              <div class="text-left p-6">
                <div
                  class="w-12 h-12 mx-auto mb-3 border-2 border-gray-400 rounded-full flex items-center justify-center"
                >
                  <Icon
                    name="i-heroicons-map-pin"
                    class="w-6 h-6 t-text-muted"
                  />
                </div>
                <p class="text-sm t-text-tertiary font-medium mb-2">
                  TARGET NEIGHBORHOODS
                </p>
                <p
                  class="text-xs t-text-muted leading-relaxed max-w-md mx-auto"
                >
                  Map showing Miami Beach, South of Fifth, Brickell, Coral
                  Gables, and Coconut Grove target areas.
                </p>
              </div>
            </div>

            <p
              class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0"
            >
              Boutique buildings that value brand presentation.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section
      ref="ctaRef"
      class="section relative py-32 lg:py-40 px-6 lg:px-16 bg-gray-900 text-cream overflow-hidden z-10"
    >
      <!-- Animated Background with Particles -->
      <div class="absolute inset-0 z-0">
        <div ref="ctaCanvasRef" class="w-full h-full" />
      </div>

      <!-- Gradient Overlay -->
      <div
        class="absolute inset-0 bg-gradient-to-b from-gray-900/50 via-gray-900/80 to-gray-900 z-[1]"
      />

      <div class="max-w-3xl mx-auto text-center relative z-10">
        <h2
          class="cta-headline t-heading text-[clamp(2rem,5vw,3.5rem)] font-light leading-tight mb-8 opacity-0 text-white"
        >
          Ready to Transform
          <br />
          <span class="shimmer-text-light">Your Building Into a Brand?</span>
        </h2>
        <p
          class="cta-body text-[1.0625rem] leading-relaxed text-gray-300 mb-12 opacity-0"
        >
          Join boutique condominiums across South Florida who've discovered that
          HOA management can be beautiful, compliant, and actually enjoyable.
        </p>
        <div
          class="cta-divider w-16 h-px bg-[var(--theme-accent-primary)] mx-auto mb-12 opacity-0 scale-x-0"
        />
        <div
          class="cta-buttons flex flex-col sm:flex-row gap-4 justify-center opacity-0"
        >
          <button
            @click="scrollToPlans"
            class="group relative px-8 py-4 text-lg font-semibold transition-all duration-300 overflow-hidden rounded-lg"
          >
            <span
              class="absolute inset-0 bg-gradient-to-r from-[var(--theme-accent-primary)] to-[var(--theme-accent-secondary)]"
            />
            <span
              class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style="
                background: radial-gradient(
                  circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
                  rgba(255, 255, 255, 0.2) 0%,
                  transparent 50%
                );
              "
            />
            <span class="relative z-10 text-white">View Pricing</span>
          </button>
          <a
            href="https://1033lenox.com"
            target="_blank"
            class="px-8 py-4 text-lg font-semibold bg-white/10 backdrop-blur-sm text-white border border-white/20 hover:bg-white/20 hover:border-white/40 transition-all duration-300 rounded-lg"
          >
            See Live Demo
          </a>
        </div>
        <p
          class="cta-address text-sm tracking-wide text-gray-400 opacity-0 mt-12 uppercase"
        >
          hoaconnect.info · Built in Miami Beach
        </p>
      </div>
    </section>

    <!-- Logged-in user with org banner -->
    <div
      v-if="user && currentOrg?.organization?.slug"
      class="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 t-bg-accent t-text-inverse rounded-lg p-4 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 opacity-0 user-banner"
    >
      <div class="flex items-center gap-3">
        <Icon name="i-heroicons-building-office-2" class="w-5 h-5" />
        <span class="text-sm">Welcome back! Return to your dashboard?</span>
      </div>
      <NuxtLink
        :to="getOrgUrl(currentOrg.organization)"
        class="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition text-sm font-medium whitespace-nowrap"
      >
        Go to {{ currentOrg.organization.name }}
        <Icon name="i-heroicons-arrow-right" class="w-4 h-4" />
      </NuxtLink>
    </div>

    <!-- Custom Mouse Follower -->
    <div
      ref="mouseFollowerRef"
      class="fixed w-4 h-4 rounded-full pointer-events-none z-[100] mix-blend-difference transition-transform duration-75"
      :style="{
        background: 'var(--theme-accent-primary)',
        transform: `translate(${mouseX - 8}px, ${mouseY - 8}px) scale(${isHovering ? 2 : 1})`,
        opacity: isMouseInView ? 0.6 : 0,
      }"
    />
  </div>
</template>

<script setup lang="ts">
import * as THREE from "three";

// ============================================================================
// PROPS
// ============================================================================
const props = defineProps<{
  plans?: any[];
  error?: any;
  pending?: boolean;
}>();

// ============================================================================
// COMPOSABLES
// ============================================================================
const { user } = useDirectusAuth();
const { currentOrg } = user.value
  ? await useSelectedOrg()
  : { currentOrg: ref(null) };
const { $gsap, $ScrollTrigger } = useNuxtApp();

// ============================================================================
// REFS
// ============================================================================
const containerRef = ref<HTMLElement | null>(null);
const canvasContainer = ref<HTMLElement | null>(null);
const heroRef = ref<HTMLElement | null>(null);
const problemRef = ref<HTMLElement | null>(null);
const problemImageRef = ref<HTMLElement | null>(null);
const solutionRef = ref<HTMLElement | null>(null);
const featuresRef = ref<HTMLElement | null>(null);
const featureCard1Ref = ref<HTMLElement | null>(null);
const featureCard2Ref = ref<HTMLElement | null>(null);
const pricingRef = ref<HTMLElement | null>(null);
const caseStudyRef = ref<HTMLElement | null>(null);
const caseStudyNumbersRef = ref<HTMLElement[]>([]);
const floridaRef = ref<HTMLElement | null>(null);
const targetRef = ref<HTMLElement | null>(null);
const ctaRef = ref<HTMLElement | null>(null);
const ctaCanvasRef = ref<HTMLElement | null>(null);
const mouseFollowerRef = ref<HTMLElement | null>(null);

// ============================================================================
// STATE
// ============================================================================
const showNav = ref(false);
const scrolledPastHero = ref(false);
const heroHeight = ref(0);
const heroImageLoaded = ref(false);
const isHovering = ref(false);
const isMouseInView = ref(false);
const mouseX = ref(0);
const mouseY = ref(0);

// Three.js state
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let particles: THREE.Points;
let animationId: number;
let clock: THREE.Clock;

// ============================================================================
// DATA
// ============================================================================
const advantages = [
  {
    icon: "i-heroicons-paint-brush",
    title: "Design Excellence",
    text: "Transforms buildings into brands, not just managed properties",
  },
  {
    icon: "i-heroicons-map-pin",
    title: "Florida-Specific",
    text: "Fund segregation tracking and 40-year recertification project management",
  },
  {
    icon: "i-heroicons-shield-check",
    title: "Compliance Tools",
    text: "Comprehensive financial transparency addressing post-Surfside requirements",
  },
  {
    icon: "i-heroicons-sparkles",
    title: "Agency DNA",
    text: "White-glove onboarding services competitors cannot offer",
  },
  {
    icon: "i-heroicons-cpu-chip",
    title: "Modern Stack",
    text: "Nuxt 4, Directus, Vercel—enabling rapid iteration and scalability",
  },
  {
    icon: "i-heroicons-user-group",
    title: "Board Experience",
    text: "Built by condo board members who understand the real challenges",
  },
];

const features = [
  {
    icon: "i-heroicons-globe-alt",
    text: "Public building website with custom subdomain or domain",
  },
  {
    icon: "i-heroicons-document-duplicate",
    text: "Document library with categories, version history, and access controls",
  },
  {
    icon: "i-heroicons-megaphone",
    text: "Announcements with email delivery via SendGrid",
  },
  {
    icon: "i-heroicons-users",
    text: "Resident directory with privacy controls and role-based access",
  },
  {
    icon: "i-heroicons-calendar",
    text: "Meeting management with agendas, minutes, and voting",
  },
  {
    icon: "i-heroicons-banknotes",
    text: "Financial dashboard with fund tracking (operating, reserve, special)",
    wide: true,
  },
  {
    icon: "i-heroicons-chat-bubble-left-right",
    text: "Channels and messaging system (Slack-style communications)",
  },
  {
    icon: "i-heroicons-wrench-screwdriver",
    text: "Maintenance request system with status tracking",
  },
];

const pricingTiers = [
  {
    name: "Essentials",
    slug: "essentials",
    price: "2.50",
    minimum: "75",
    features: [
      "Public building website",
      "Document library",
      "Announcements with email",
      "Resident directory",
      "Meeting management",
    ],
  },
  {
    name: "Professional",
    slug: "professional",
    price: "4.00",
    minimum: "149",
    featured: true,
    features: [
      "Everything in Essentials",
      "Financial dashboard",
      "Budget vs actual reporting",
      "Channels & messaging",
      "Project management",
    ],
  },
  {
    name: "Enterprise",
    slug: "enterprise",
    price: "6.00",
    minimum: "299",
    features: [
      "Everything in Professional",
      "Access control integration",
      "Custom branding",
      "API access",
      "Dedicated onboarding",
    ],
  },
];

const caseStudyStats = [
  { value: "28", label: "Boutique units in Flamingo Park" },
  { value: "100%", label: "Document digitization complete" },
  { value: "40-yr", label: "Recertification tracking built-in" },
  { value: "24/7", label: "Resident portal access" },
];

const floridaFeatures = [
  {
    icon: "i-heroicons-banknotes",
    title: "Fund Segregation Tracking",
    text: "Monitor operating, reserve, and special assessment funds separately with violation detection.",
  },
  {
    icon: "i-heroicons-clipboard-document-check",
    title: "40-Year Recertification",
    text: "Project management tools specifically designed for milestone inspection requirements.",
  },
  {
    icon: "i-heroicons-chart-bar",
    title: "Financial Transparency",
    text: "Budget vs. actual reporting, transaction categorization, and owner-accessible dashboards.",
  },
  {
    icon: "i-heroicons-shield-exclamation",
    title: "Compliance Reporting",
    text: "Generate reports that satisfy statutory requirements and board fiduciary duties.",
  },
];

const targetCustomers = [
  "Boutique condominiums under 100 units",
  "Owner-occupied majority (not investor-heavy)",
  "Recent or upcoming 40-year recertification",
  "Board members who care about presentation",
  "Design, architecture, or marketing professionals on board",
  "Located in Miami Beach, South Beach, Brickell",
  "Coral Gables and Coconut Grove buildings",
  "Buildings that want to stand out, not blend in",
];

// ============================================================================
// THREE.JS SETUP
// ============================================================================
const initThree = () => {
  if (!canvasContainer.value) return;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
  );
  camera.position.z = 50;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  canvasContainer.value.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  createParticles();
  animate();

  window.addEventListener("resize", onResize);
  window.addEventListener("mousemove", onMouseMove);
};

const createParticles = () => {
  const particleCount = 1500;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const speeds = new Float32Array(particleCount);

  const accentColor = new THREE.Color("#C9A96E");
  const secondaryColor = new THREE.Color("#D4BA8A");

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;

    positions[i3] = (Math.random() - 0.5) * 120;
    positions[i3 + 1] = (Math.random() - 0.5) * 120;
    positions[i3 + 2] = (Math.random() - 0.5) * 60;

    const mixFactor = Math.random();
    const color = accentColor.clone().lerp(secondaryColor, mixFactor);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[i] = Math.random() * 2 + 0.5;
    speeds[i] = Math.random() * 0.3 + 0.1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("speed", new THREE.BufferAttribute(speeds, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uScrollProgress: { value: 0 },
    },
    vertexShader: `
      attribute float size;
      attribute float speed;
      attribute vec3 color;
      
      uniform float uTime;
      uniform vec2 uMouse;
      uniform float uScrollProgress;
      
      varying vec3 vColor;
      varying float vAlpha;
      
      void main() {
        vColor = color;
        
        vec3 pos = position;
        
        // Gentle floating animation
        pos.y += sin(uTime * speed * 0.5 + position.x * 0.05) * 3.0;
        pos.x += cos(uTime * speed * 0.3 + position.y * 0.05) * 2.0;
        
        // Mouse interaction - subtle repulsion
        vec2 mousePos = uMouse * 60.0;
        vec2 toMouse = pos.xy - mousePos;
        float distToMouse = length(toMouse);
        float influence = smoothstep(30.0, 0.0, distToMouse);
        pos.xy += normalize(toMouse + 0.001) * influence * 8.0;
        
        // Scroll-based movement
        pos.z += uScrollProgress * 30.0;
        pos.y -= uScrollProgress * 20.0;
        
        // Alpha based on depth and scroll
        vAlpha = smoothstep(-30.0, 30.0, pos.z) * (1.0 - uScrollProgress * 0.5) * 0.5;
        
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = size * (250.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      
      void main() {
        vec2 center = gl_PointCoord - 0.5;
        float dist = length(center);
        float alpha = 1.0 - smoothstep(0.35, 0.5, dist);
        float glow = exp(-dist * 4.0) * 0.4;
        
        gl_FragColor = vec4(vColor, (alpha + glow) * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  particles = new THREE.Points(geometry, material);
  scene.add(particles);
};

const animate = () => {
  animationId = requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();

  if (particles) {
    const material = particles.material as THREE.ShaderMaterial;
    material.uniforms.uTime.value = elapsedTime;

    const scrollProgress =
      window.scrollY / (document.body.scrollHeight - window.innerHeight);
    material.uniforms.uScrollProgress.value = scrollProgress;

    particles.rotation.y = elapsedTime * 0.015;
    particles.rotation.x = Math.sin(elapsedTime * 0.01) * 0.05;
  }

  renderer.render(scene, camera);
};

const onResize = () => {
  if (!renderer || !camera) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

const onMouseMove = (event: MouseEvent) => {
  mouseX.value = event.clientX;
  mouseY.value = event.clientY;
  isMouseInView.value = true;

  if (particles) {
    const material = particles.material as THREE.ShaderMaterial;
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = -(event.clientY / window.innerHeight) * 2 + 1;
    material.uniforms.uMouse.value.set(x, y);
  }
};

// ============================================================================
// SCROLL HANDLING
// ============================================================================
const handleScroll = () => {
  const scrollY = window.scrollY;
  showNav.value = scrollY > 100;
  scrolledPastHero.value = scrollY > heroHeight.value * 0.8;
};

// ============================================================================
// INTERACTION HANDLERS
// ============================================================================
const onImageHover = () => {
  isHovering.value = true;
};

const onImageLeave = () => {
  isHovering.value = false;
};

const onCard3DMove = (event: MouseEvent, cardId: string) => {
  const card =
    cardId === "card1" ? featureCard1Ref.value : featureCard2Ref.value;
  if (!card) return;

  const rect = card.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  const rotateX = (y - centerY) / 20;
  const rotateY = (centerX - x) / 20;

  card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
};

const onCard3DLeave = (cardId: string) => {
  const card =
    cardId === "card1" ? featureCard1Ref.value : featureCard2Ref.value;
  if (!card) return;
  card.style.transform = "perspective(1000px) rotateX(0) rotateY(0) scale(1)";
};

const onPricingHover = (event: MouseEvent, index: number) => {
  isHovering.value = true;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  target.style.setProperty("--mouse-x", `${x}%`);
  target.style.setProperty("--mouse-y", `${y}%`);
};

const onPricingLeave = (index: number) => {
  isHovering.value = false;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const scrollToPlans = () => {
  if (import.meta.client) {
    const plansSection = document.getElementById("plans");
    plansSection?.scrollIntoView({ behavior: "smooth" });
  }
};

const selectPlan = (slug: string) => {
  navigateTo(`/setup?plan=${slug}`);
};

const formatPrice = (price: number | string) => {
  const num = typeof price === "string" ? parseFloat(price) : price;
  return num.toFixed(2);
};

const getOrgUrl = (org: any) => {
  if (!org) return "/";
  if (org.custom_domain && org.domain_verified) {
    const protocol = import.meta.client ? window.location.protocol : "https:";
    return `${protocol}//${org.custom_domain}`;
  }
  return `/${org.slug}`;
};

// ============================================================================
// GSAP ANIMATIONS
// ============================================================================
let gsapCtx: any;

const initAnimations = () => {
  if (!$gsap) return;

  const gsap = $gsap;
  const ScrollTrigger = $ScrollTrigger;

  gsapCtx = gsap.context(() => {
    // Hero animations
    const heroTl = gsap.timeline({ delay: 0.3 });
    heroTl
      .to(".hero-badge", {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: "power3.out",
      })
      .to(
        ".hero-title",
        { opacity: 1, y: 0, duration: 1, ease: "power3.out" },
        "-=0.3",
      )
      .to(
        ".hero-divider",
        { opacity: 1, scaleX: 1, duration: 0.6, ease: "power3.out" },
        "-=0.4",
      )
      .to(
        ".hero-tagline",
        { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" },
        "-=0.3",
      )
      .to(
        ".scroll-indicator",
        { opacity: 1, duration: 0.6, ease: "power3.out" },
        "-=0.2",
      );

    // Scroll line animation
    gsap.to(".scroll-line", {
      scaleY: 0.7,
      opacity: 0.5,
      duration: 1.5,
      repeat: -1,
      yoyo: true,
      ease: "power2.inOut",
    });

    // Hero content parallax
    gsap.to(".hero-content", {
      y: 350,
      ease: "none",
      scrollTrigger: {
        trigger: heroRef.value,
        start: "top top",
        end: "bottom top",
        scrub: true,
      },
    });

    // Fade out scroll indicator
    gsap.fromTo(
      ".scroll-indicator",
      { opacity: 1, y: 0 },
      {
        opacity: 0,
        y: 30,
        ease: "none",
        scrollTrigger: {
          trigger: heroRef.value,
          start: "top top",
          end: "20% top",
          scrub: true,
        },
      },
    );

    // Section animations helper
    const animateSection = (
      sectionRef: Ref<HTMLElement | null>,
      selectors: string[],
    ) => {
      if (!sectionRef.value) return;
      selectors.forEach((selector) => {
        const elements = sectionRef.value!.querySelectorAll(selector);
        elements.forEach((el, elIndex) => {
          gsap.fromTo(
            el,
            { opacity: 0, y: 30 },
            {
              opacity: 1,
              y: 0,
              duration: 0.8,
              ease: "power3.out",
              scrollTrigger: {
                trigger: el,
                start: "top 85%",
                toggleActions: "play none none none",
              },
              delay: elIndex * 0.1,
            },
          );
        });
      });
    };

    // Animate all sections
    animateSection(problemRef, [
      ".content-label",
      ".section-title",
      ".section-body",
      ".section-tagline",
      ".section-image",
    ]);
    animateSection(solutionRef, [
      ".content-label",
      ".section-title",
      ".section-body",
      ".advantage-item",
      ".section-tagline",
    ]);
    animateSection(featuresRef, [
      ".content-label",
      ".section-title",
      ".section-image",
      ".feature-item",
      ".section-tagline",
    ]);
    animateSection(pricingRef, [
      ".content-label",
      ".section-title",
      ".section-subtitle",
      ".section-body",
      ".pricing-card",
      ".section-tagline",
    ]);
    animateSection(caseStudyRef, [
      ".content-label",
      ".section-title",
      ".section-body",
      ".case-study-stat",
      ".section-tagline",
      ".section-image",
    ]);
    animateSection(floridaRef, [
      ".content-label",
      ".section-title",
      ".section-body",
      ".florida-feature-item",
      ".section-tagline",
    ]);
    animateSection(targetRef, [
      ".content-label",
      ".section-title",
      ".target-item",
      ".section-image",
      ".section-tagline",
    ]);

    // CTA section
    if (ctaRef.value) {
      gsap.fromTo(
        ctaRef.value.querySelector(".cta-headline"),
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: { trigger: ctaRef.value, start: "top 70%" },
        },
      );
      gsap.fromTo(
        ctaRef.value.querySelector(".cta-body"),
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: { trigger: ctaRef.value, start: "top 70%" },
          delay: 0.2,
        },
      );
      gsap.fromTo(
        ctaRef.value.querySelector(".cta-divider"),
        { opacity: 0, scaleX: 0 },
        {
          opacity: 1,
          scaleX: 1,
          duration: 0.6,
          ease: "power3.out",
          scrollTrigger: { trigger: ctaRef.value, start: "top 70%" },
          delay: 0.4,
        },
      );
      gsap.fromTo(
        ctaRef.value.querySelector(".cta-buttons"),
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: "power3.out",
          scrollTrigger: { trigger: ctaRef.value, start: "top 70%" },
          delay: 0.5,
        },
      );
      gsap.fromTo(
        ctaRef.value.querySelector(".cta-address"),
        { opacity: 0 },
        {
          opacity: 1,
          duration: 0.6,
          ease: "power3.out",
          scrollTrigger: { trigger: ctaRef.value, start: "top 70%" },
          delay: 0.6,
        },
      );
    }

    // User banner
    if (user.value && currentOrg.value) {
      gsap.to(".user-banner", { opacity: 1, duration: 0.6, delay: 2 });
    }
  });
};

// ============================================================================
// LIFECYCLE
// ============================================================================
onMounted(() => {
  if (heroRef.value) {
    heroHeight.value = heroRef.value.offsetHeight;
  }

  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();

  // Initialize Three.js
  initThree();

  // Initialize GSAP animations
  nextTick(() => {
    initAnimations();
  });

  // Track mouse leaving window
  document.addEventListener("mouseleave", () => {
    isMouseInView.value = false;
  });
  document.addEventListener("mouseenter", () => {
    isMouseInView.value = true;
  });
});

onUnmounted(() => {
  window.removeEventListener("scroll", handleScroll);

  // Cleanup Three.js
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  if (renderer) {
    renderer.dispose();
  }
  if (particles) {
    particles.geometry.dispose();
    (particles.material as THREE.Material).dispose();
  }

  window.removeEventListener("resize", onResize);
  window.removeEventListener("mousemove", onMouseMove);

  // Cleanup GSAP
  if (gsapCtx) gsapCtx.revert();
});

// ============================================================================
// SEO
// ============================================================================
useHead({
  title: "HOA Connect | Transform Your Building Into a Brand",
  meta: [
    {
      name: "description",
      content:
        "Design-forward HOA software built by a Miami Beach creative agency. Florida-specific compliance tools, beautiful resident portals, and per-unit pricing that scales with your building.",
    },
  ],
});
</script>

<style scoped>
.sell-sheet {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Hero section clips the fixed background */
.hero {
  clip-path: inset(0);
}

/* All sections after hero need proper stacking context */
.section {
  position: relative;
}

/* Smooth scroll behavior */
:deep(html) {
  scroll-behavior: smooth;
}

/* Sticky content labels on large screens */
.content-label {
  @media (min-width: theme("screens.lg")) {
    position: sticky;
    top: 8rem;
    align-self: start;
    height: fit-content;
  }
}

/* Shimmer Text Effect */
.shimmer-text {
  background: linear-gradient(
    90deg,
    var(--theme-text-primary) 0%,
    var(--theme-accent-primary) 25%,
    var(--theme-text-primary) 50%,
    var(--theme-accent-primary) 75%,
    var(--theme-text-primary) 100%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 4s linear infinite;
}

.shimmer-text-light {
  background: linear-gradient(
    90deg,
    #ffffff 0%,
    var(--theme-accent-primary) 25%,
    #ffffff 50%,
    var(--theme-accent-primary) 75%,
    #ffffff 100%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 4s linear infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% center;
  }
  100% {
    background-position: -200% center;
  }
}

/* 3D Card Effect */
.feature-card-3d {
  transition: transform 0.3s ease-out;
  transform-style: preserve-3d;
}

/* Canvas container */
.fixed canvas {
  width: 100% !important;
  height: 100% !important;
}

/* Pricing card glow */
.pricing-card::before {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  background: linear-gradient(
    135deg,
    var(--theme-accent-primary),
    var(--theme-accent-secondary)
  );
  opacity: 0;
  transition: opacity 0.5s ease;
  z-index: -1;
}

.pricing-card:hover::before {
  opacity: 0.1;
}
</style>
