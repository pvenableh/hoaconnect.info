<template>
  <div class="sell-sheet t-bg min-h-screen">
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
              >For Property Managers</span
            >
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
      <!-- Hero Background Image -->
      <div class="fixed inset-0 z-0 hero-bg-container">
        <div
          class="hero-image w-full h-full flex items-center justify-center opacity-0"
          style="
            background-image: url(&quot;/images/hoa-hero-placeholder.jpg&quot;);
            background-size: cover;
            background-position: center 20%;
          "
        >
          <!-- Placeholder for hero image -->
          <div v-if="!heroImageLoaded" class="text-center p-8 max-w-lg">
            <div
              class="w-16 h-16 mx-auto mb-4 border-2 border-gray-400 rounded-full flex items-center justify-center"
            >
              <Icon name="i-heroicons-photo" class="w-8 h-8 t-text-muted" />
            </div>
            <p class="text-sm t-text-tertiary font-medium mb-2">HERO IMAGE</p>
            <p class="text-xs t-text-muted leading-relaxed">
              Suggested: Twilight exterior of a boutique Miami condo with warm
              interior lights. Or aerial view of South Beach neighborhood
              showing the lifestyle.
            </p>
          </div>
        </div>
        <div
          class="absolute inset-0 bg-gradient-to-b from-black/60 to-black/40"
        ></div>
      </div>

      <div class="hero-content text-center relative z-10 lg:-mt-32">
        <p
          class="-mt-44 lg:mt-0 hero-address text-xs tracking-[0.3em] lg:tracking-[0.6em] uppercase mb-6 lg:mb-12 opacity-0 text-cream-alt"
        >
          Miami Beach · Built by hue Creative
        </p>
        <h1
          class="hero-title t-heading text-[clamp(2.5rem,10vw,6rem)] font-light tracking-tight leading-[0.9] mb-8 opacity-0 text-cream"
        >
          HOA Connect
        </h1>
        <div
          class="hero-divider w-16 h-px t-bg-accent mx-auto mb-4 lg:mb-8 opacity-0 scale-x-0"
        ></div>
        <p
          class="hero-tagline t-heading text-[clamp(1.125rem,2.5vw,2rem)] italic font-light text-cream-alt opacity-0"
        >
          Transform Your Building Into a Brand
        </p>
      </div>
      <div
        class="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-0 scroll-indicator z-10"
      >
        <span class="text-[0.625rem] tracking-[0.2em] uppercase t-text-tertiary"
          >Scroll to discover</span
        >
        <div
          class="w-px h-10 bg-gradient-to-b from-gold to-transparent scroll-line"
        ></div>
      </div>
    </section>

    <!-- Intro Section -->
    <section
      ref="introRef"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-section-alt"
    >
      <div class="max-w-6xl mx-auto text-left">
        <h2
          class="intro-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
        >
          Design-Forward HOA Software
        </h2>
        <p
          class="intro-text t-body text-[clamp(1.0625rem,3vw,1.35rem)] leading-relaxed font-light t-text text-left t-text-secondary mb-16 opacity-0"
        >
          HOA Connect is a SaaS platform for condominium and HOA management,
          built by a Miami Beach creative agency with 18+ years of experience in
          brand positioning and communications design. We transform buildings
          into brands—not just managed properties.
        </p>

        <!-- Intro Image Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 intro-images">
          <div
            class="aspect-[4/3] t-bg-subtle flex items-end justify-end opacity-0 intro-image"
          >
            <div class="text-left p-6">
              <div
                class="w-12 h-12 mx-auto mb-3 border-2 border-gray-400 rounded-full flex items-center justify-center"
              >
                <Icon name="i-heroicons-photo" class="w-6 h-6 t-text-muted" />
              </div>
              <p class="text-sm t-text-tertiary font-medium mb-2">
                DASHBOARD VIEW
              </p>
              <p class="text-xs t-text-muted leading-relaxed">
                Screenshot of HOA Connect dashboard showing elegant financial
                tracking and document management.
              </p>
            </div>
          </div>
          <div
            class="aspect-[4/3] t-bg-subtle flex items-end justify-end opacity-0 intro-image"
          >
            <div class="text-left p-6">
              <div
                class="w-12 h-12 mx-auto mb-3 border-2 border-gray-400 rounded-full flex items-center justify-center"
              >
                <Icon name="i-heroicons-photo" class="w-6 h-6 t-text-muted" />
              </div>
              <p class="text-sm t-text-tertiary font-medium mb-2">
                RESIDENT PORTAL
              </p>
              <p class="text-xs t-text-muted leading-relaxed">
                Mobile-optimized resident portal showing announcements,
                documents, and community messaging.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- The Problem Section -->
    <section ref="problemRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg">
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
              <div
                class="aspect-[3/4] t-bg-subtle flex items-end justify-end opacity-0 section-image"
              >
                <div class="w-full text-left p-6">
                  <div
                    class="w-12 h-12 mx-auto mb-3 border-2 border-gray-400 rounded-full flex items-center justify-center"
                  >
                    <Icon
                      name="i-heroicons-photo"
                      class="w-6 h-6 t-text-muted"
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
      class="section py-24 lg:py-32 px-6 lg:px-16 t-bg-alt"
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

            <div
              class="advantages-grid grid grid-cols-1 sm:grid-cols-2 gap-6 my-8"
            >
              <div
                v-for="(advantage, index) in advantages"
                :key="index"
                class="advantage-item flex gap-4 items-start opacity-0"
              >
                <div
                  class="advantage-icon w-6 h-6 flex-shrink-0 t-text-accent-tertiary"
                >
                  <Icon :name="advantage.icon" class="w-6 h-6" />
                </div>
                <div>
                  <p class="text-sm font-medium t-text mb-1">
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
      class="section py-24 lg:py-32 px-6 lg:px-16 t-bg"
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

            <!-- Feature Image Grid -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div
                class="aspect-[4/5] t-bg-subtle flex items-center justify-center opacity-0 section-image"
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
                class="aspect-[10/6.1] t-bg-subtle flex items-center justify-center opacity-0 section-image md:col-span-2"
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

            <div
              class="feature-grid grid grid-cols-1 sm:grid-cols-2 gap-6 my-8"
            >
              <div
                v-for="(feature, index) in features"
                :key="index"
                :class="[
                  'feature-item flex gap-4 items-start opacity-0',
                  feature.wide ? 'sm:col-span-2' : '',
                ]"
              >
                <div
                  class="feature-icon w-6 h-6 flex-shrink-0 t-text-accent-tertiary"
                >
                  <Icon :name="feature.icon" class="w-6 h-6" />
                </div>
                <p class="text-[0.9375rem] leading-relaxed t-text-secondary">
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

    <!-- Theme Showcase Section -->
    <section
      ref="themesRef"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-bg-alt"
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
              >Customization</span
            >
          </div>
          <div class="content-main max-w-4xl min-w-0 overflow-hidden">
            <h2
              class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
            >
              Your Brand, Your Style
            </h2>
            <p
              class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0"
            >
              Choose from three distinct design themes to match your building's
              personality. Each theme includes light and dark modes, with
              carefully curated typography and color palettes.
            </p>

            <!-- Theme Preview Cards -->
            <div
              class="theme-showcase grid grid-cols-1 md:grid-cols-3 gap-6 my-8"
            >
              <!-- Classic Theme -->
              <div
                class="theme-preview-card p-6 border-2 transition relative opacity-0"
                style="
                  background: #fdfcfa;
                  border-color: #e5e0d8;
                "
              >
                <div class="text-center mb-4">
                  <div
                    class="w-10 h-10 mx-auto mb-3 rounded-lg flex items-center justify-center"
                    style="background: #ede9e3"
                  >
                    <span
                      style="
                        font-family: 'Bauer Bodoni Pro_1 W05 Roman', serif;
                        color: #6c6c6c;
                      "
                      >Aa</span
                    >
                  </div>
                  <h4
                    class="text-lg font-normal mb-1"
                    style="
                      font-family: 'Bauer Bodoni Pro_1 W05 Roman', serif;
                      color: #454545;
                    "
                  >
                    Classic
                  </h4>
                  <p class="text-xs" style="color: #9a9a9a">Cream & Serif</p>
                </div>
                <div class="space-y-2">
                  <div
                    class="h-2 rounded"
                    style="background: #c9a96e; width: 60%"
                  ></div>
                  <div
                    class="h-2 rounded"
                    style="background: #e5e0d8; width: 100%"
                  ></div>
                  <div
                    class="h-2 rounded"
                    style="background: #e5e0d8; width: 80%"
                  ></div>
                </div>
              </div>

              <!-- Modern Theme -->
              <div
                class="theme-preview-card p-6 border-2 transition relative opacity-0"
                style="
                  background: #ffffff;
                  border-color: #e2e8f0;
                "
              >
                <div class="text-center mb-4">
                  <div
                    class="w-10 h-10 mx-auto mb-3 rounded-lg flex items-center justify-center"
                    style="background: #f1f5f9"
                  >
                    <Icon
                      name="i-heroicons-square-3-stack-3d"
                      class="w-4 h-4"
                      style="color: #64748b"
                    />
                  </div>
                  <h4
                    class="text-lg font-medium mb-1"
                    style="
                      font-family: 'Proxima Nova W01 Regular', sans-serif;
                      color: #1e293b;
                    "
                  >
                    Modern
                  </h4>
                  <p class="text-xs" style="color: #94a3b8">White & Cyan</p>
                </div>
                <div class="space-y-2">
                  <div
                    class="h-2 rounded"
                    style="background: #00bfd8; width: 60%"
                  ></div>
                  <div
                    class="h-2 rounded"
                    style="background: #e2e8f0; width: 100%"
                  ></div>
                  <div
                    class="h-2 rounded"
                    style="background: #e2e8f0; width: 80%"
                  ></div>
                </div>
              </div>

              <!-- Luxury Theme -->
              <div
                class="theme-preview-card p-6 border-2 transition relative opacity-0"
                style="
                  background: #faf9f7;
                  border-color: #e8e4df;
                "
              >
                <!-- Premium Badge -->
                <div
                  class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                >
                  <span
                    class="px-3 py-1 text-xs font-semibold tracking-wider uppercase"
                    style="
                      background: linear-gradient(
                        135deg,
                        #b8956c 0%,
                        #c9a87c 100%
                      );
                      color: white;
                    "
                    >Premium</span
                  >
                </div>
                <div class="text-center mb-4">
                  <div
                    class="w-10 h-10 mx-auto mb-3 rounded-lg flex items-center justify-center"
                    style="
                      background: linear-gradient(
                        135deg,
                        #b8956c 0%,
                        #c9a87c 100%
                      );
                    "
                  >
                    <Icon
                      name="i-heroicons-sparkles"
                      class="w-4 h-4"
                      style="color: white"
                    />
                  </div>
                  <h4
                    class="text-lg font-normal mb-1"
                    style="
                      font-family: 'Bauer Bodoni Pro_1 W05 Roman', serif;
                      color: #3d3a36;
                    "
                  >
                    Luxury
                  </h4>
                  <p class="text-xs" style="color: #9a958e">Gallery & Brass</p>
                </div>
                <div class="space-y-2">
                  <div
                    class="h-2 rounded"
                    style="background: #b8956c; width: 60%"
                  ></div>
                  <div
                    class="h-2 rounded"
                    style="background: #e8e4df; width: 100%"
                  ></div>
                  <div
                    class="h-2 rounded"
                    style="background: #e8e4df; width: 80%"
                  ></div>
                </div>
              </div>
            </div>

            <p
              class="section-tagline t-heading text-lg italic t-text-accent-tertiary pt-8 border-t t-border-divider opacity-0"
            >
              Light and dark modes included. Switch anytime.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing Section -->
    <section
      ref="pricingRef"
      id="plans"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-bg"
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

            <!-- Pricing Cards -->
            <div
              v-else-if="plans && plans.length > 0"
              class="pricing-cards grid grid-cols-1 md:grid-cols-3 gap-6 my-8"
            >
              <div
                v-for="(plan, index) in plans"
                :key="plan.id"
                class="pricing-card p-6 t-bg-elevated border-2 transition relative opacity-0"
                :class="[
                  plan.is_featured
                    ? 't-border-accent'
                    : 't-border hover:t-border-accent',
                ]"
              >
                <!-- Featured Badge -->
                <div
                  v-if="plan.is_featured"
                  class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                >
                  <span
                    class="t-bg-accent t-text-inverse px-3 py-1 text-xs font-semibold tracking-wider uppercase"
                    >Popular</span
                  >
                </div>

                <div class="text-center mb-6">
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

                <ul class="space-y-2 mb-6">
                  <li
                    v-for="(feature, fIndex) in plan.features?.slice(0, 5)"
                    :key="fIndex"
                    class="flex items-start text-sm"
                  >
                    <span
                      class="w-1.5 h-1.5 t-bg-accent rounded-full flex-shrink-0 mt-2 mr-3"
                    ></span>
                    <span class="t-text-secondary">{{ feature }}</span>
                  </li>
                </ul>

                <button
                  @click="selectPlan(plan.slug)"
                  class="w-full py-3 text-sm font-medium transition"
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

            <!-- Fallback Static Pricing if no plans loaded -->
            <div
              v-else
              class="pricing-cards grid grid-cols-1 md:grid-cols-3 gap-6 my-8"
            >
              <div
                v-for="(tier, index) in pricingTiers"
                :key="index"
                class="pricing-card p-6 t-bg-elevated border-2 transition relative opacity-0"
                :class="[
                  tier.featured
                    ? 't-border-accent'
                    : 't-border hover:t-border-accent',
                ]"
              >
                <div
                  v-if="tier.featured"
                  class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                >
                  <span
                    class="t-bg-accent t-text-inverse px-3 py-1 text-xs font-semibold tracking-wider uppercase"
                    >Popular</span
                  >
                </div>

                <div class="text-center mb-6">
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

                <ul class="space-y-2 mb-6">
                  <li
                    v-for="(feature, fIndex) in tier.features"
                    :key="fIndex"
                    class="flex items-start text-sm"
                  >
                    <span
                      class="w-1.5 h-1.5 t-bg-accent rounded-full flex-shrink-0 mt-2 mr-3"
                    ></span>
                    <span class="t-text-secondary">{{ feature }}</span>
                  </li>
                </ul>

                <button
                  @click="selectPlan(tier.slug)"
                  class="w-full py-3 text-sm font-medium transition"
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
      class="section py-24 lg:py-32 px-6 lg:px-16 t-bg"
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

                <div class="case-study-stats flex flex-col gap-0 my-8">
                  <div
                    v-for="(stat, index) in caseStudyStats"
                    :key="index"
                    class="case-study-stat flex items-center gap-4 py-4 border-b t-border-divider opacity-0"
                  >
                    <span
                      class="t-heading text-2xl font-light t-text-accent min-w-[80px]"
                      >{{ stat.value }}</span
                    >
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
              <div
                class="aspect-[3/4] lg:aspect-video t-bg-subtle flex items-end justify-start opacity-0 section-image"
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
      class="section py-24 lg:py-32 px-6 lg:px-16 t-bg-alt"
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
              >Compliance focused</span
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

            <div
              class="florida-features grid grid-cols-1 sm:grid-cols-2 gap-6 my-8"
            >
              <div
                v-for="(feature, index) in floridaFeatures"
                :key="index"
                class="florida-feature-item p-6 t-bg-subtle opacity-0"
              >
                <div class="flex items-start gap-4">
                  <div
                    class="florida-icon w-8 h-8 flex-shrink-0 t-text-accent-tertiary"
                  >
                    <Icon :name="feature.icon" class="w-8 h-8" />
                  </div>
                  <div>
                    <p class="text-sm font-medium t-text mb-2">
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
    <section ref="targetRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg">
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
          <div class="content-label flex flex-col gap-2 opacity-0">
            <span
              class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent"
              >08</span
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

            <div
              class="target-list grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 my-8"
            >
              <div
                v-for="(target, index) in targetCustomers"
                :key="index"
                class="target-item flex items-center gap-4 py-3 opacity-0"
              >
                <span
                  class="w-1.5 h-1.5 t-bg-accent rounded-full flex-shrink-0"
                ></span>
                <span class="text-[0.9375rem] t-text-secondary">{{
                  target
                }}</span>
              </div>
            </div>

            <!-- Target Image -->
            <div
              class="aspect-[16/9] t-bg-subtle flex items-end justify-start mb-8 opacity-0 section-image"
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
      class="section relative py-32 lg:py-40 px-6 lg:px-16 bg-gray-900 text-cream overflow-hidden"
    >
      <!-- CTA Background -->
      <div
        class="absolute inset-0 z-0 opacity-30 t-bg-subtle flex items-center justify-center"
      >
        <div class="w-full h-full bg-gray-800 flex items-center justify-center">
          <div class="text-center p-8">
            <Icon
              name="i-heroicons-photo"
              class="w-12 h-12 t-text-tertiary mx-auto mb-3"
            />
            <p class="text-xs t-text-muted">
              Miami Beach skyline at sunset. Or: Elegant condo courtyard with
              palm trees.
            </p>
          </div>
        </div>
      </div>

      <div class="max-w-3xl mx-auto text-center relative z-10">
        <h2
          class="cta-headline t-heading text-[clamp(2rem,5vw,3.5rem)] font-light leading-tight mb-8 opacity-0"
        >
          Ready to Transform
          <br />
          Your Building Into a Brand?
        </h2>
        <p
          class="cta-body text-[1.0625rem] leading-relaxed text-cream mb-12 opacity-0"
        >
          Join boutique condominiums across South Florida who've discovered that
          HOA management can be beautiful, compliant, and actually enjoyable.
        </p>
        <div
          class="cta-divider w-16 h-px t-bg-accent mx-auto mb-12 opacity-0 scale-x-0"
        ></div>
        <div
          class="cta-buttons flex flex-col sm:flex-row gap-4 justify-center opacity-0"
        >
          <button
            @click="scrollToPlans"
            class="t-btn px-8 py-4 text-lg font-semibold transition shadow-lg"
          >
            View Pricing
          </button>
          <a
            href="https://1033lenox.com"
            target="_blank"
            class="t-bg-elevated t-text-accent px-8 py-4 text-lg font-semibold hover:opacity-90 transition shadow-lg inline-block"
          >
            See Live Demo
          </a>
        </div>
        <p
          class="cta-address text-sm tracking-wide text-cream-alt opacity-0 mt-12 uppercase"
        >
          hoaconnect.info · Built in Miami Beach
        </p>
      </div>
    </section>

    <!-- Logged-in user with org banner (floating) -->
    <div
      v-if="user && currentOrg?.organization?.slug"
      class="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 t-bg-accent t-text-inverse rounded-lg p-4 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 opacity-0 user-banner"
    >
      <div class="flex items-center gap-3">
        <Icon name="i-heroicons-building-office-2" class="w-5 h-5" />
        <span class="text-sm">
          Welcome back! You're a member of
          <strong>{{ currentOrg.organization.name }}</strong>
        </span>
      </div>
      <a
        :href="getOrgUrl(currentOrg.organization)"
        class="t-bg-elevated t-text-accent px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition whitespace-nowrap"
      >
        Go to Portal
      </a>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const { user } = useDirectusAuth();
const { currentOrg } = await useSelectedOrg();
const { forceThemeStyle } = useTheme();

// Force Classic theme for the sell-sheet/marketing page
// Called at setup time (not in onMounted) so it works with SSR
forceThemeStyle("classic");

const props = defineProps({
  plans: {
    type: Array,
    required: false,
    default: () => [],
  },
  error: {
    type: String,
    required: false,
    default: null,
  },
  pending: {
    type: Boolean,
    required: false,
    default: false,
  },
});

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger);

// Section refs
const heroRef = ref(null);
const introRef = ref(null);
const problemRef = ref(null);
const solutionRef = ref(null);
const featuresRef = ref(null);
const themesRef = ref(null);
const pricingRef = ref(null);
const caseStudyRef = ref(null);
const floridaRef = ref(null);
const targetRef = ref(null);
const ctaRef = ref(null);

const heroImageLoaded = ref(false);

// Navigation scroll state
const showNav = ref(false);
const scrolledPastHero = ref(false);

const handleScroll = () => {
  const scrollY = window.scrollY;
  const heroHeight = heroRef.value?.offsetHeight || window.innerHeight;

  // Show nav after scrolling 100px
  showNav.value = scrollY > 100;
  // Change nav background after scrolling past hero
  scrolledPastHero.value = scrollY > heroHeight * 0.8;
};

// Data
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

// Helper functions
const getOrgUrl = (org) => {
  if (!org) return "/";
  return `/${org.slug}`;
};

const formatPrice = (price) => {
  const numPrice = parseFloat(price);
  return numPrice % 1 === 0 ? numPrice.toFixed(0) : numPrice.toFixed(2);
};

const scrollToPlans = () => {
  if (import.meta.client) {
    const plansSection = document.getElementById("plans");
    plansSection?.scrollIntoView({ behavior: "smooth" });
  }
};

const selectPlan = (planSlug) => {
  navigateTo(`/setup?plan=${planSlug}`);
};

// GSAP animations
let ctx;

onMounted(() => {
  // Add scroll listener for floating nav
  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll(); // Check initial scroll position

  ctx = gsap.context(() => {
    // Hero animations
    const heroTl = gsap.timeline({ delay: 0.3 });
    heroTl
      .to(".hero-image", { opacity: 1, duration: 1.2, ease: "power2.out" })
      .to(
        ".hero-address",
        { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" },
        "-=0.6"
      )
      .to(
        ".hero-title",
        { opacity: 1, y: 0, duration: 1, ease: "power3.out" },
        "-=0.4"
      )
      .to(
        ".hero-divider",
        { opacity: 1, scaleX: 1, duration: 0.6, ease: "power3.out" },
        "-=0.4"
      )
      .to(
        ".hero-tagline",
        { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" },
        "-=0.3"
      )
      .to(
        ".scroll-indicator",
        { opacity: 1, duration: 0.6, ease: "power3.out" },
        "-=0.2"
      );

    // User banner animation
    gsap.to(".user-banner", {
      opacity: 1,
      duration: 0.8,
      delay: 1.5,
      ease: "power3.out",
    });

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
              ease: "power3.out",
              scrollTrigger: {
                trigger: el,
                start: "top 85%",
                toggleActions: "play none none none",
              },
              delay: elIndex * 0.1,
            }
          );
        });
      });
    };

    // Animate all sections
    animateSection(introRef, [".intro-title", ".intro-text", ".intro-image"]);
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
    animateSection(themesRef, [
      ".content-label",
      ".section-title",
      ".section-body",
      ".theme-preview-card",
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
        }
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
        }
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
        }
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
        }
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
        }
      );
    }
  });
});

onUnmounted(() => {
  window.removeEventListener("scroll", handleScroll);
  if (ctx) ctx.revert();
});

// SEO
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

/* Fixed background contained within hero via clip-path */
.hero-bg-container {
  position: fixed;
  inset: 0;
}

/* All sections after hero need proper stacking context */
.section {
  position: relative;
  z-index: 10;
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

/* Hide scrollbar while maintaining scroll functionality */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
