<!--
  /your-data — the continuity guarantee, in public.

  The prose twin of docs/data-continuity-policy.md, and the marketing half of
  VISION Pillar A. It exists because "you own your data" is the one claim every
  competitor also makes on a slide; the only way to say it credibly is to publish
  the actual list — including the parts we withhold and the parts we haven't
  built yet.

  So the counts and the lists below are NOT copy. They are rendered from
  `core/shared/export/collections.ts`, the same map the export worker runs on.
  Add a collection to the schema and the completeness test forces a decision;
  that decision then shows up on this page on the next deploy. A sales page that
  cannot go stale is the point.
-->
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
            @click="scrollTo(exportRef)"
            class="text-sm t-text-secondary hover:t-text transition-colors hidden sm:block"
          >
            What's in an export
          </button>
          <button
            @click="scrollTo(gapsRef)"
            class="text-sm t-text-accent hover:opacity-80 transition-opacity hidden sm:block"
          >
            What we don't promise
          </button>
          <a
            :href="loginUrl"
            class="text-sm t-text-secondary hover:t-text transition-colors hidden sm:block"
          >
            Sign in
          </a>
          <NuxtLink
            to="/"
            class="group flex items-center gap-2 px-4 py-2 rounded-full border t-border hover:t-border-accent transition-all duration-300"
          >
            <Icon
              name="i-heroicons-arrow-left"
              class="w-4 h-4 t-text-tertiary group-hover:t-text-accent group-hover:-translate-x-1 transition-all duration-300"
            />
            <span
              class="text-sm t-text-secondary group-hover:t-text-accent transition-colors"
              >Overview</span
            >
          </NuxtLink>
        </div>
      </div>
    </nav>

    <!-- Hero -->
    <section
      ref="heroRef"
      class="hero min-h-screen flex flex-col justify-center items-center relative px-6"
    >
      <div class="fixed inset-0 z-0 hero-bg-container">
        <div
          class="hero-image w-full h-full opacity-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
        >
          <div class="absolute inset-0 opacity-20">
            <div
              class="absolute inset-0"
              style="
                background-image: url(&quot;data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23C9A96E' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E&quot;);
              "
            ></div>
          </div>
        </div>
        <div
          class="absolute inset-0 bg-gradient-to-b from-black/40 to-black/60"
        ></div>
      </div>

      <div class="hero-content text-center relative z-10 lg:-mt-32">
        <div
          class="hero-badge inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gold/30 bg-gold/10 mb-8 opacity-0"
        >
          <Icon name="i-heroicons-lock-open" class="w-4 h-4 text-gold" />
          <span class="text-xs tracking-[0.2em] uppercase text-gold"
            >The continuity guarantee</span
          >
        </div>
        <h1
          class="hero-title t-heading text-[clamp(2.5rem,10vw,5rem)] font-light tracking-tight leading-[0.9] mb-8 opacity-0 text-cream"
        >
          It's yours.<br />
          <span class="t-text-accent">Take it anytime.</span>
        </h1>
        <div
          class="hero-divider w-16 h-px t-bg-accent mx-auto mb-4 lg:mb-8 opacity-0 scale-x-0"
        ></div>
        <p
          class="hero-tagline text-[clamp(1rem,2vw,1.25rem)] font-light text-cream-alt opacity-0 max-w-2xl mx-auto"
        >
          Every record your community creates here belongs to your community —
          exportable in one click, in a format you can actually use, without
          asking us and without paying to leave.
        </p>
      </div>
      <div
        class="absolute bottom-16 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-0 scroll-indicator z-10"
      >
        <span class="text-[0.625rem] tracking-[0.2em] uppercase t-text-tertiary"
          >Read the whole thing</span
        >
        <div
          class="w-px h-10 bg-gradient-to-b from-gold to-transparent scroll-line"
        ></div>
      </div>
    </section>

    <!-- The numbers, straight off the export map -->
    <section
      ref="introRef"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-section-alt"
    >
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          <div
            v-for="stat in heroStats"
            :key="stat.label"
            class="text-center lg:text-left opacity-0 intro-stat"
          >
            <span
              class="t-heading text-[clamp(2.25rem,6vw,3.75rem)] font-light t-text-accent block leading-none"
              >{{ stat.value }}</span
            >
            <span
              class="text-sm tracking-wider uppercase t-text-tertiary mt-2 block"
              >{{ stat.label }}</span
            >
          </div>
        </div>
      </div>
    </section>

    <!-- 01 — Why this page exists -->
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
              >Why this page exists</span
            >
          </div>
          <div class="content-main min-w-0 overflow-hidden">
            <div class="max-w-3xl">
              <h2
                class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
              >
                Your Data Is Someone Else's Switching Cost
              </h2>
              <p
                class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-8 opacity-0"
              >
                Ask any board that has tried to change management companies. The
                minutes are in someone's inbox. The ledger comes back as a PDF.
                The violation history is "in the system," and the system belongs
                to the company you're trying to leave. Nobody refuses — the
                answer is always a quote, a timeline, and a conversation about
                renewing.
              </p>
              <p
                class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-10 opacity-0"
              >
                That isn't a support problem. It's the business model: when the
                manager is the customer, the community's records are the
                collateral. We sell to the association instead, so the incentive
                runs the other way — and the only way to prove it is to publish
                the list rather than the slogan.
              </p>
              <ul class="grid sm:grid-cols-2 gap-x-8 gap-y-3 mb-10">
                <li
                  v-for="line in neverDo"
                  :key="line"
                  class="pain-point flex items-start gap-3 text-[0.9375rem] t-text-secondary opacity-0"
                >
                  <Icon
                    name="i-heroicons-x-mark"
                    class="w-5 h-5 t-text-accent flex-shrink-0 mt-0.5"
                  />
                  <span>{{ line }}</span>
                </li>
              </ul>
              <p
                class="section-tagline t-heading text-[1.25rem] font-light t-text opacity-0"
              >
                Lock-in only ever protects a bad manager.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 02 — What's actually in an export -->
    <section
      ref="exportRef"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-section-alt"
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
              >What you get</span
            >
          </div>
          <div class="content-main min-w-0 overflow-hidden">
            <div class="max-w-3xl">
              <h2
                class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
              >
                One Button. One Zip. Everything.
              </h2>
              <p
                class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-10 opacity-0"
              >
                Settings → Your data → Request export. No support ticket, no
                approval from us, no fee, and no window in which it's
                unavailable — including while you're in a dispute with your
                manager, or with us. A large community's archive is built in the
                background, so you can close the tab.
              </p>

              <div
                class="section-image opacity-0 rounded-xl border t-border t-bg p-6 lg:p-8 mb-10 overflow-x-auto"
              >
                <pre
                  class="text-[0.8125rem] leading-relaxed t-text-secondary font-mono"
                >{{ archiveTree }}</pre>
              </div>

              <div class="grid sm:grid-cols-2 gap-6">
                <div
                  v-for="item in whatYouGet"
                  :key="item.title"
                  class="solution-item opacity-0"
                >
                  <Icon
                    :name="item.icon"
                    class="w-6 h-6 t-text-accent mb-3"
                  />
                  <h3 class="t-heading text-lg font-normal t-text mb-2">
                    {{ item.title }}
                  </h3>
                  <p class="text-[0.9375rem] leading-relaxed t-text-secondary">
                    {{ item.text }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 03 — The two tiers, and what the shareable one withholds -->
    <section ref="tiersRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg">
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
          <div class="content-label flex flex-col gap-2 opacity-0">
            <span
              class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent"
              >03</span
            >
            <span
              class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
              >Two versions</span
            >
          </div>
          <div class="content-main min-w-0 overflow-hidden">
            <div class="max-w-3xl">
              <h2
                class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
              >
                Your Copy, and the One You Hand Over
              </h2>
              <p
                class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-10 opacity-0"
              >
                "Export" means two different things depending on who's asking.
                Your own archive is everything. The version you hand an incoming
                management company on day one is the full operational record
                without the board's private deliberation — because a board's
                internal discussion isn't part of the community's record, and
                shouldn't arrive with the new manager's welcome packet.
              </p>

              <div class="grid sm:grid-cols-2 gap-6 mb-10">
                <div
                  class="tier-card opacity-0 rounded-xl border t-border p-6 t-section-alt"
                >
                  <p
                    class="text-xs tracking-[0.2em] uppercase t-text-tertiary mb-3"
                  >
                    Everything
                  </p>
                  <p
                    class="t-heading text-[2.5rem] font-light t-text-accent leading-none mb-3"
                  >
                    {{ fullCount }}
                  </p>
                  <p class="text-[0.9375rem] leading-relaxed t-text-secondary">
                    record types, verbatim — including your channels, comments,
                    moderation history and every AI action ever taken on your
                    behalf. For your own archive.
                  </p>
                </div>
                <div
                  class="tier-card opacity-0 rounded-xl border t-border-accent p-6 t-section-alt"
                >
                  <p
                    class="text-xs tracking-[0.2em] uppercase t-text-accent mb-3"
                  >
                    Shareable
                  </p>
                  <p
                    class="t-heading text-[2.5rem] font-light t-text-accent leading-none mb-3"
                  >
                    {{ shareableCount }}
                  </p>
                  <p class="text-[0.9375rem] leading-relaxed t-text-secondary">
                    record types — members, units, finances, delinquency,
                    requests, documents and governance. Safe to hand to a
                    successor on day one.
                  </p>
                </div>
              </div>

              <h3
                class="section-body t-heading text-xl font-normal t-text mb-4 opacity-0"
              >
                What the shareable version leaves behind
              </h3>
              <ul class="flex flex-wrap gap-2 mb-8">
                <li
                  v-for="label in withheldLabels"
                  :key="label"
                  class="withheld-chip opacity-0 text-[0.8125rem] px-3 py-1.5 rounded-full border t-border t-text-secondary"
                >
                  {{ label }}
                </li>
              </ul>

              <div
                class="section-tagline opacity-0 border-l-2 t-border-accent pl-6"
              >
                <p class="text-[1.0625rem] leading-relaxed t-text-secondary">
                  <strong class="t-text"
                    >Per-owner delinquency stays in both versions.</strong
                  >
                  Balances, payment status and payment history travel with the
                  handover on purpose. A successor manager who can't see who is
                  behind cannot do the job — an export without it would be a
                  courtesy, not a transition.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 04 — What isn't the community's to take -->
    <section
      ref="lineRef"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-section-alt"
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
              >Where the line is</span
            >
          </div>
          <div class="content-main min-w-0 overflow-hidden">
            <div class="max-w-3xl">
              <h2
                class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
              >
                What a Manager Takes, and What Stays
              </h2>
              <p
                class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-10 opacity-0"
              >
                A manager's operating knowledge is theirs. A community's record
                of itself is the community's. That line is drawn in the schema
                rather than in a contract clause — which is why we can show you
                exactly what sits on the other side of it, and why each of these
                is excluded.
              </p>

              <div class="space-y-6">
                <div
                  v-for="bucket in excludedBuckets"
                  :key="bucket.title"
                  class="excluded-row opacity-0 rounded-xl border t-border p-6 t-bg"
                >
                  <h3 class="t-heading text-lg font-normal t-text mb-2">
                    {{ bucket.title }}
                  </h3>
                  <p
                    class="text-[0.9375rem] leading-relaxed t-text-secondary mb-4"
                  >
                    {{ bucket.why }}
                  </p>
                  <ul class="flex flex-wrap gap-2">
                    <li
                      v-for="item in bucket.items"
                      :key="item"
                      class="text-[0.8125rem] px-3 py-1.5 rounded-full t-section-alt t-text-tertiary"
                    >
                      {{ item }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 05 — Cancellation -->
    <section ref="cancelRef" class="section py-24 lg:py-32 px-6 lg:px-16 t-bg">
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-8 lg:gap-16">
          <div class="content-label flex flex-col gap-2 opacity-0">
            <span
              class="t-heading text-sm lg:text-[26px] lg:leading-6 t-text-accent"
              >05</span
            >
            <span
              class="text-xs lg:text-sm lg:leading-3 tracking-wider uppercase t-text-tertiary"
              >If you leave</span
            >
          </div>
          <div class="content-main min-w-0 overflow-hidden">
            <div class="max-w-3xl">
              <h2
                class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
              >
                Cancelling Ends the Subscription, Not the Ownership
              </h2>
              <div class="space-y-6">
                <div
                  v-for="promise in cancelPromises"
                  :key="promise.title"
                  class="solution-item opacity-0 flex items-start gap-4"
                >
                  <Icon
                    name="i-heroicons-check-circle"
                    class="w-6 h-6 t-text-accent flex-shrink-0 mt-0.5"
                  />
                  <div>
                    <h3 class="t-heading text-lg font-normal t-text mb-1">
                      {{ promise.title }}
                    </h3>
                    <p
                      class="text-[0.9375rem] leading-relaxed t-text-secondary"
                    >
                      {{ promise.text }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 06 — The honest gaps -->
    <section
      ref="gapsRef"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-section-alt"
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
              >Not yet</span
            >
          </div>
          <div class="content-main min-w-0 overflow-hidden">
            <div class="max-w-3xl">
              <h2
                class="section-title t-heading text-[clamp(2rem,5vw,3rem)] font-normal tracking-tight leading-tight mb-8 opacity-0"
              >
                What We Don't Promise Yet
              </h2>
              <p
                class="section-body text-[1.0625rem] leading-relaxed t-text-secondary mb-10 opacity-0"
              >
                A guarantee is only worth reading if it also says where it stops.
                Everything above is live today. These are not:
              </p>
              <div class="space-y-6">
                <div
                  v-for="gap in openGaps"
                  :key="gap.title"
                  class="gap-row opacity-0 border-l-2 t-border pl-6"
                >
                  <h3 class="t-heading text-lg font-normal t-text mb-1">
                    {{ gap.title }}
                  </h3>
                  <p class="text-[0.9375rem] leading-relaxed t-text-secondary">
                    {{ gap.text }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Early access -->
    <section
      ref="earlyAccessRef"
      class="section py-24 lg:py-32 px-6 lg:px-16 t-bg"
    >
      <div class="max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16">
        <div class="ea-copy opacity-0">
          <h2
            class="t-heading text-[clamp(1.75rem,4vw,2.5rem)] font-light leading-tight mb-6"
          >
            Ask us the hard question
          </h2>
          <p class="text-[1.0625rem] leading-relaxed t-text-secondary mb-8">
            "What happens to our records if we fire you?" is the question every
            board should open with, and the one most vendors answer with a
            brochure. Ours is on this page. Tell us about your community and
            we'll show you the export running against real data.
          </p>
          <ul class="space-y-3">
            <li
              v-for="perk in earlyAccessPerks"
              :key="perk"
              class="flex items-start gap-3 text-[0.9375rem] t-text-secondary"
            >
              <Icon
                name="i-heroicons-check-circle"
                class="w-5 h-5 t-text-accent flex-shrink-0 mt-0.5"
              />
              <span>{{ perk }}</span>
            </li>
          </ul>
        </div>
        <div class="ea-form opacity-0">
          <MarketingWaitlistForm
            source-page="your-data"
            :default-interests="['Data ownership & export']"
          />
        </div>
      </div>
    </section>

    <!-- Closing -->
    <section
      ref="ctaRef"
      class="section relative py-32 lg:py-40 px-6 lg:px-16 bg-gray-900 text-cream overflow-hidden"
    >
      <div class="max-w-3xl mx-auto text-center relative z-10">
        <h2
          class="cta-headline t-heading text-[clamp(2rem,5vw,3.5rem)] font-light leading-tight mb-8 opacity-0"
        >
          Fire us and keep everything.
        </h2>
        <p
          class="cta-body text-[1.0625rem] leading-relaxed text-cream mb-12 opacity-0"
        >
          It's a strange thing to advertise. It's also the only version of this
          promise that means anything — and the reason a good management company
          has nothing to lose by offering it.
        </p>
        <div
          class="cta-divider w-16 h-px t-bg-accent mx-auto mb-12 opacity-0 scale-x-0"
        ></div>
        <div
          class="cta-buttons flex flex-col sm:flex-row gap-4 justify-center opacity-0"
        >
          <NuxtLink
            to="/"
            class="t-btn px-8 py-4 text-lg font-semibold transition shadow-lg"
          >
            See the platform
          </NuxtLink>
          <NuxtLink
            to="/property-managers"
            class="t-bg-elevated t-text-accent px-8 py-4 text-lg font-semibold hover:opacity-90 transition shadow-lg inline-block"
          >
            For property managers
          </NuxtLink>
        </div>
        <p
          class="cta-address text-sm tracking-wide text-cream-alt opacity-0 mt-12 uppercase"
        >
          hoaconnect.info · Built in Miami Beach
        </p>
      </div>
    </section>
  </div>
</template>

<script setup>
definePageMeta({ layout: "marketing", middleware: ["marketing-only"] });

import { ref, onMounted, onUnmounted } from "vue";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  EXPORT_MAP,
  PLATFORM_COLLECTIONS,
  entriesForTier,
} from "#core/shared/export/collections";
import { EXPORT_TTL_DAYS } from "#core/shared/export/manifest";

const config = useRuntimeConfig();
const appUrl = (config.public.appUrl || "").replace(/\/$/, "");
const loginUrl = `${appUrl}/auth/login`;

gsap.registerPlugin(ScrollTrigger);

// ── Everything below this line is derived, not written ─────────────────────
// The export map is the source of truth for what a community owns. Reading it
// here means the page states the current answer rather than the answer that was
// true the day someone wrote the copy.
const fullEntries = entriesForTier("full");
const shareableEntries = entriesForTier("shareable");
const fullCount = fullEntries.length;
const shareableCount = shareableEntries.length;

const shareableSet = new Set(shareableEntries.map((e) => e.collection));
/** The board's private material — in your own copy, out of the handover. */
const withheldLabels = fullEntries
  .filter((e) => !shareableSet.has(e.collection))
  .map((e) => e.label);

// The three CSVs are projections declared in the map; ledger.csv is derived by
// the worker from the payment collections, so it is named here. A test asserts
// the worker still writes it, and that the map still yields exactly these three.
const csvFiles = [...EXPORT_MAP.filter((e) => e.csv).map((e) => e.csv.file), "ledger.csv"];

const archiveTree = [
  "your-community-export.zip",
  "├── README.txt          plain English, for whoever opens this a year from now",
  "├── manifest.json       what's inside, and what was withheld — with reasons",
  `├── data/               ${fullCount} files, one per record type, complete rows`,
  `├── csv/                ${csvFiles.join(", ")}`,
  "└── files/              every document and photo you've uploaded (optional)",
].join("\n");

const heroStats = [
  { value: fullCount, label: "Record types exported" },
  { value: "1", label: "Click to take it" },
  { value: `${EXPORT_TTL_DAYS} days`, label: "To download an archive" },
  { value: "$0", label: "Cost to leave" },
];

const whatYouGet = [
  {
    icon: "i-heroicons-code-bracket",
    title: "JSON, not a PDF",
    text: `Complete rows for all ${fullCount} record types — the same structure the software runs on, so another system can actually read it.`,
  },
  {
    icon: "i-heroicons-table-cells",
    title: "Spreadsheets for people",
    text: `${csvFiles.length} CSVs — members, units, requests and a running financial ledger — for the board members who are going to open Excel, not a code editor.`,
  },
  {
    icon: "i-heroicons-photo",
    title: "Every document and photo",
    text: "Optional, because a community's storage can run to hundreds of gigabytes. Checked, and the archive carries the files themselves — not links back to us.",
  },
  {
    icon: "i-heroicons-document-check",
    title: "A manifest that admits things",
    text: "Row counts, the fields blanked for a handover, and every record type deliberately left out with the reason it isn't yours. Machine-readable, so the next system can verify it.",
  },
];

const neverDo = [
  "Charge you to export your own data",
  "Send the ledger as a PDF and call it a migration",
  "Require your manager's sign-off to release the records",
  "Make you open a ticket and wait on us",
  "Hold an archive over an unpaid invoice",
  "Treat your history as the reason you can't leave",
];

/**
 * The collections that are not the community's, bucketed for humans. Keyed by
 * the real collection name so the test can assert every excluded collection is
 * accounted for here — a new exclusion in the map fails the suite rather than
 * quietly vanishing from this page.
 */
const excludedBuckets = [
  {
    title: "Your management company's",
    why: "Their billing account and their staff roster belong to the agency and travel with them. Everything they did inside your community — vendors, requests, communications, decisions — stays with you.",
    collections: ["billing_accounts", "billing_account_members"],
    items: ["Agency billing account", "Agency staff roster"],
  },
  {
    title: "The platform's",
    why: "Catalogs and marketing content that are identical for every customer, plus the bookkeeping of the export mechanism itself. There is nothing of yours in them, and every archive already carries its own manifest.",
    collections: [
      "subscription_plans",
      "coupons",
      "coupons_subscription_plans",
      "block_hero",
      "waitlist_signups",
      "hoa_data_exports",
    ],
    items: [
      "Pricing catalog",
      "Discount catalog",
      "Marketing page content",
      "Signup waitlist",
      "Export job history",
    ],
  },
  {
    title: "Nobody's to move",
    why: "Push notification tokens are live credentials tied to one browser on one device. They are useless anywhere else and unsafe to copy, so they are never exported — to you or to anyone.",
    collections: ["push_subscriptions"],
    items: ["Device push tokens"],
  },
];

const cancelPromises = [
  {
    title: "Your records aren't deleted",
    text: "Cancelling stops the billing. It doesn't touch a single row of your community's history.",
  },
  {
    title: "Export keeps working for at least 12 months",
    text: "You don't need an active subscription to take your own data out. The button is still there, and it still runs.",
  },
  {
    title: "No hostage-taking, ever",
    text: "A dispute, an unpaid invoice or a renewal conversation is never a reason we sit on your minutes. We'll ask you for the money like anyone else.",
  },
  {
    title: "Deleting it for good is your call",
    text: "Permanent deletion happens on request from an admin, confirmed in writing, because it can't be undone. Never on our schedule.",
  },
];

const openGaps = [
  {
    title: "The guided management transition is Phase 4",
    text: "Today, replacing a management company means an admin promotes a board member, revokes the outgoing manager's access, and takes a shareable export by hand. The wizard that does it as one reviewed operation — with a grace period instead of an instant cut-off, and a permanent audit entry — isn't built yet.",
  },
  {
    title: "The 12-month window is a commitment, not a countdown",
    text: "Nothing in the code deletes a cancelled community's records at 12 months or at any other time. In practice you have more than we promise. We would rather promise the smaller number and keep it.",
  },
  {
    title: "Agency-owned assets aren't a separate scope yet",
    text: "Templates and playbooks a manager builds inside your community currently come with your export. Until that layer ships, the line above is drawn at the billing account.",
  },
  {
    title: "It's a snapshot, not a live feed",
    text: "There's no API or scheduled push to another system. If your community needs one, ask — that's a feature request, not a policy problem.",
  },
];

const earlyAccessPerks = [
  "A real export of a real community, on a call, start to finish",
  "The full written policy, before you sign anything",
  "An honest answer about what isn't built yet",
];

// ── Chrome + motion (same pattern as the other marketing pages) ────────────
const heroRef = ref(null);
const introRef = ref(null);
const problemRef = ref(null);
const exportRef = ref(null);
const tiersRef = ref(null);
const lineRef = ref(null);
const cancelRef = ref(null);
const gapsRef = ref(null);
const earlyAccessRef = ref(null);
const ctaRef = ref(null);

const showNav = ref(false);
const scrolledPastHero = ref(false);

const handleScroll = () => {
  const scrollY = window.scrollY;
  const heroHeight = heroRef.value?.offsetHeight || window.innerHeight;
  showNav.value = scrollY > 100;
  scrolledPastHero.value = scrollY > heroHeight * 0.8;
};

const scrollTo = (sectionRef) => {
  sectionRef.value?.scrollIntoView({ behavior: "smooth" });
};

let ctx;

onMounted(() => {
  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();

  ctx = gsap.context(() => {
    const heroTl = gsap.timeline({ delay: 0.3 });
    heroTl
      .to(".hero-image", { opacity: 1, duration: 1.2, ease: "power2.out" })
      .to(".hero-badge", { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, "-=0.6")
      .to(".hero-title", { opacity: 1, y: 0, duration: 1, ease: "power3.out" }, "-=0.3")
      .to(
        ".hero-divider",
        { opacity: 1, scaleX: 1, duration: 0.6, ease: "power3.out" },
        "-=0.4"
      )
      .to(".hero-tagline", { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, "-=0.3")
      .to(".scroll-indicator", { opacity: 1, duration: 0.6, ease: "power3.out" }, "-=0.2");

    gsap.to(".scroll-line", {
      scaleY: 0.7,
      opacity: 0.5,
      duration: 1.5,
      repeat: -1,
      yoyo: true,
      ease: "power2.inOut",
    });

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
              // Chips come in as a run, not one at a time — 20+ withheld labels
              // at 0.1s each would still be animating after the reader has left.
              delay: Math.min(elIndex, 8) * (selector === ".withheld-chip" ? 0.03 : 0.1),
            }
          );
        });
      });
    };

    animateSection(introRef, [".intro-stat"]);
    animateSection(problemRef, [
      ".content-label",
      ".section-title",
      ".section-body",
      ".pain-point",
      ".section-tagline",
    ]);
    animateSection(exportRef, [
      ".content-label",
      ".section-title",
      ".section-body",
      ".section-image",
      ".solution-item",
    ]);
    animateSection(tiersRef, [
      ".content-label",
      ".section-title",
      ".section-body",
      ".tier-card",
      ".withheld-chip",
      ".section-tagline",
    ]);
    animateSection(lineRef, [
      ".content-label",
      ".section-title",
      ".section-body",
      ".excluded-row",
    ]);
    animateSection(cancelRef, [
      ".content-label",
      ".section-title",
      ".solution-item",
    ]);
    animateSection(gapsRef, [
      ".content-label",
      ".section-title",
      ".section-body",
      ".gap-row",
    ]);
    animateSection(earlyAccessRef, [".ea-copy", ".ea-form"]);
    animateSection(ctaRef, [
      ".cta-headline",
      ".cta-body",
      ".cta-buttons",
      ".cta-address",
    ]);

    gsap.fromTo(
      ".cta-divider",
      { opacity: 0, scaleX: 0 },
      {
        opacity: 1,
        scaleX: 1,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: { trigger: ctaRef.value, start: "top 70%" },
      }
    );
  });
});

onUnmounted(() => {
  window.removeEventListener("scroll", handleScroll);
  if (ctx) ctx.revert();
});

useHead({
  title: "Your data, and how to take it | HOA Connect",
  meta: [
    {
      name: "description",
      content:
        "The written continuity guarantee: every record your community creates belongs to your community, exportable in one click as JSON, spreadsheets and files — no fee, no approval, no window in which it's unavailable. Including what we withhold, and what we haven't built yet.",
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
  @media (min-width: theme("screens.lg")) {
    position: sticky;
    top: 8rem;
    align-self: start;
    height: fit-content;
  }
}
</style>
