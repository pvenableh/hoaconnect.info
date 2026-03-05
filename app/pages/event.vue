<template>
  <div class="event-toolkit min-h-dvh t-bg overflow-hidden" ref="rootRef">

    <!-- Grain texture overlay -->
    <div class="grain-overlay fixed inset-0 pointer-events-none z-[100] opacity-[0.025]" />

    <!-- Top navigation tabs -->
    <nav class="sticky top-0 z-50 t-bg border-b t-border-divider">
      <div class="flex">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          class="flex-1 py-4 text-[10px] tracking-[0.18em] uppercase transition-all duration-300 relative"
          :class="[
            activeTab === tab.id
              ? 't-text-accent font-semibold'
              : 't-text-tertiary hover:t-text-secondary',
          ]"
        >
          {{ tab.label }}
          <span
            v-if="activeTab === tab.id"
            class="absolute bottom-0 left-0 right-0 h-[2px] t-bg-accent"
          />
        </button>
      </div>
    </nav>

    <!-- QR TAB -->
    <Transition name="tab-fade" mode="out-in">
      <section v-if="activeTab === 'qr'" key="qr" class="min-h-[calc(100dvh-53px)] flex flex-col items-center justify-center px-8 py-16">
        <div class="text-center mb-2 qr-wordmark opacity-0">
          <p class="text-[10px] tracking-[0.3em] uppercase t-text-tertiary mb-3">Built by Hue Creative · Miami Beach</p>
          <h1 class="t-heading text-[2.25rem] font-light tracking-[0.12em] uppercase t-text">
            <span class="font-light">HOA</span><span class="font-semibold">Connect</span>
          </h1>
        </div>
        <div class="w-10 h-px t-bg-accent mx-auto my-6 qr-divider opacity-0 scale-x-0" />
        <p class="text-sm italic t-text-secondary text-center mb-12 qr-tagline opacity-0">
          Transform Your Building Into a Brand
        </p>
        <div class="qr-frame relative opacity-0">
          <div class="relative bg-white p-6 shadow-[0_16px_64px_rgba(107,91,62,0.14)]">
            <span v-for="c in ['tl','tr','bl','br']" :key="c" :class="[
              'absolute w-5 h-5 pointer-events-none',
              c === 'tl' ? 'top-2 left-2 border-t-2 border-l-2' : '',
              c === 'tr' ? 'top-2 right-2 border-t-2 border-r-2' : '',
              c === 'bl' ? 'bottom-2 left-2 border-b-2 border-l-2' : '',
              c === 'br' ? 'bottom-2 right-2 border-b-2 border-r-2' : '',
              't-border-accent opacity-70'
            ]" />
            <img :src="qrCodeUrl" alt="Scan to visit HOA Connect" width="240" height="240" class="block" loading="eager" />
          </div>
        </div>
        <p class="text-[11px] tracking-[0.2em] uppercase t-text-tertiary mt-8 mb-2 qr-url opacity-0">hoaconnect.info</p>
        <p class="text-[11px] tracking-[0.15em] uppercase t-text-muted qr-url opacity-0">Scan to explore the platform</p>
        <div class="mt-12 w-full max-w-sm qr-pitch opacity-0">
          <div class="t-bg-alt border t-border-divider p-5">
            <p class="text-[10px] tracking-[0.2em] uppercase t-text-tertiary mb-3">Your Opener</p>
            <p class="text-sm leading-relaxed t-text-secondary italic">
              "We built beautiful HOA management software for Miami Beach luxury buildings.
              Think Notion meets luxury real estate — your building gets a portal, a brand, and a website."
            </p>
          </div>
        </div>
      </section>
    </Transition>

    <!-- PITCH TAB -->
    <Transition name="tab-fade" mode="out-in">
      <section v-if="activeTab === 'pitch'" key="pitch" class="min-h-[calc(100dvh-53px)] px-6 py-10">
        <div class="mb-8 pitch-selector opacity-0">
          <p class="text-[10px] tracking-[0.2em] uppercase t-text-tertiary mb-4">Select Audience</p>
          <div class="flex gap-2">
            <button
              v-for="p in pitches"
              :key="p.id"
              @click="activePitch = p.id"
              class="flex-1 py-3 px-1 text-[9px] tracking-[0.12em] uppercase border transition-all duration-200"
              :class="[
                activePitch === p.id
                  ? 't-bg-accent t-text-inverse border-transparent'
                  : 't-border t-text-tertiary hover:t-border-accent',
              ]"
            >{{ p.tab }}</button>
          </div>
        </div>
        <Transition name="pitch-swap" mode="out-in">
          <div v-if="currentPitch" :key="activePitch" class="pitch-card opacity-0 bg-gray-900 text-[#FAF8F4] p-8 relative overflow-hidden">
            <div class="absolute inset-0 opacity-[0.04] pointer-events-none"
              style="background-image: url(&quot;data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23C9A96E' fill-opacity='1' fill-rule='evenodd'%3E%3Cpath d='M0 40L40 0H20L0 20M40 40V20L20 40'/%3E%3C/g%3E%3C/svg%3E&quot;);" />
            <div class="relative z-10">
              <div class="flex items-center gap-3 mb-8">
                <div class="w-6 h-px bg-[#C9A96E]" />
                <span class="text-[10px] tracking-[0.25em] uppercase text-[#C9A96E]">{{ currentPitch.label }}</span>
              </div>
              <h2 class="text-[clamp(1.5rem,6vw,2.25rem)] font-light leading-tight mb-6" style="font-family: 'Bauer Bodoni Pro_1 W05 Roman', 'Times New Roman', Georgia, serif;">
                {{ currentPitch.headline }}
              </h2>
              <p class="text-[0.9375rem] leading-relaxed text-[#C4B89A] italic mb-8">{{ currentPitch.body }}</p>
              <div class="space-y-3 mb-8">
                <div v-for="point in currentPitch.points" :key="point" class="flex items-start gap-3">
                  <span class="w-1.5 h-1.5 rounded-full bg-[#C9A96E] flex-shrink-0 mt-2" />
                  <span class="text-sm text-[#E8DFCE]">{{ point }}</span>
                </div>
              </div>
              <div class="pt-6 border-t border-white/10 flex items-center justify-between">
                <span class="text-[10px] tracking-[0.15em] uppercase text-[#C9A96E]">{{ currentPitch.cta }}</span>
                <span class="text-[11px] tracking-[0.12em] text-[#7A6E5C]">hoaconnect.info</span>
              </div>
            </div>
          </div>
        </Transition>
        <div class="grid grid-cols-3 gap-3 mt-6 pitch-stats opacity-0">
          <div v-for="stat in stats" :key="stat.num" class="t-bg-alt border t-border-divider p-4 text-center">
            <div class="t-heading text-xl font-light t-text-accent mb-1">{{ stat.num }}</div>
            <div class="text-[9px] tracking-[0.12em] uppercase t-text-tertiary leading-tight">{{ stat.label }}</div>
          </div>
        </div>
        <div class="mt-4 t-bg-alt border t-border-divider p-4 pitch-agency opacity-0">
          <p class="text-[10px] tracking-[0.15em] uppercase t-text-tertiary mb-2">The Agency Difference</p>
          <p class="text-sm leading-relaxed t-text-secondary">
            <strong class="t-text">Hue Creative</strong> — 18+ years in Miami Beach luxury brand design.
            This isn't off-the-shelf software. It's agency-grade product.
          </p>
        </div>
      </section>
    </Transition>

    <!-- LEAD CAPTURE TAB -->
    <Transition name="tab-fade" mode="out-in">
      <section v-if="activeTab === 'lead'" key="lead" class="min-h-[calc(100dvh-53px)] px-6 py-10">
        <Transition name="tab-fade" mode="out-in">
          <div v-if="!submitted" key="form">
            <div class="mb-8 lead-header opacity-0">
              <div class="w-8 h-px t-bg-accent mb-4" />
              <h2 class="t-heading text-2xl font-light t-text mb-2">Capture Interest</h2>
              <p class="text-sm t-text-tertiary leading-relaxed">Hand them your phone or take notes yourself.</p>
            </div>
            <form class="space-y-5 lead-form opacity-0" @submit.prevent="handleSubmit">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-[10px] tracking-[0.15em] uppercase t-text-tertiary mb-2">Name *</label>
                  <input v-model="form.name" type="text" placeholder="Sarah Chen" required
                    class="w-full px-4 py-3 t-bg-elevated border t-border t-text text-[0.9375rem] placeholder:t-text-muted focus:outline-none focus:ring-0 focus:border-[var(--theme-accent-primary)] transition" />
                </div>
                <div>
                  <label class="block text-[10px] tracking-[0.15em] uppercase t-text-tertiary mb-2">Email *</label>
                  <input v-model="form.email" type="email" placeholder="sarah@compass.com" required
                    class="w-full px-4 py-3 t-bg-elevated border t-border t-text text-[0.9375rem] placeholder:t-text-muted focus:outline-none focus:ring-0 focus:border-[var(--theme-accent-primary)] transition" />
                </div>
              </div>
              <div>
                <label class="block text-[10px] tracking-[0.15em] uppercase t-text-tertiary mb-2">Building or Company</label>
                <input v-model="form.building" type="text" placeholder="The Setai HOA / Compass Real Estate"
                  class="w-full px-4 py-3 t-bg-elevated border t-border t-text text-[0.9375rem] placeholder:t-text-muted focus:outline-none focus:ring-0 focus:border-[var(--theme-accent-primary)] transition" />
              </div>
              <div>
                <label class="block text-[10px] tracking-[0.15em] uppercase t-text-tertiary mb-2">Phone <span class="normal-case tracking-normal opacity-50">(optional)</span></label>
                <input v-model="form.phone" type="tel" placeholder="(305) 000-0000"
                  class="w-full px-4 py-3 t-bg-elevated border t-border t-text text-[0.9375rem] placeholder:t-text-muted focus:outline-none focus:ring-0 focus:border-[var(--theme-accent-primary)] transition" />
              </div>
              <div>
                <label class="block text-[10px] tracking-[0.15em] uppercase t-text-tertiary mb-3">They Are A...</label>
                <div class="grid grid-cols-2 gap-2">
                  <button v-for="role in roles" :key="role.value" type="button" @click="form.role = role.value"
                    class="py-3 px-3 text-xs tracking-[0.08em] border transition-all duration-200 text-left flex items-center gap-2"
                    :class="[form.role === role.value ? 't-bg-accent t-text-inverse border-transparent' : 't-border t-text-secondary hover:t-border-accent']">
                    <Icon :name="role.icon" class="w-3.5 h-3.5 flex-shrink-0" />
                    {{ role.label }}
                  </button>
                </div>
              </div>
              <div>
                <label class="block text-[10px] tracking-[0.15em] uppercase t-text-tertiary mb-3">Interest Level</label>
                <div class="flex gap-2">
                  <button v-for="level in interestLevels" :key="level.value" type="button" @click="form.interest = level.value"
                    class="flex-1 py-2.5 text-[10px] tracking-[0.1em] uppercase border transition-all duration-200"
                    :class="[form.interest === level.value ? 't-bg-accent t-text-inverse border-transparent' : 't-border t-text-tertiary hover:t-border-accent']">
                    {{ level.label }}
                  </button>
                </div>
              </div>
              <div>
                <label class="block text-[10px] tracking-[0.15em] uppercase t-text-tertiary mb-2">Notes</label>
                <textarea v-model="form.notes" rows="2" placeholder="Building name, unit count, pain points..."
                  class="w-full px-4 py-3 t-bg-elevated border t-border t-text text-[0.9375rem] placeholder:t-text-muted focus:outline-none focus:ring-0 focus:border-[var(--theme-accent-primary)] transition resize-none" />
              </div>
              <button type="submit" :disabled="isSubmitting || !form.name || !form.email"
                class="w-full py-4 t-btn text-[11px] tracking-[0.2em] uppercase font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
                <span v-if="isSubmitting" class="flex items-center justify-center gap-2">
                  <Icon name="i-lucide-loader" class="w-4 h-4 animate-spin" />
                  Saving...
                </span>
                <span v-else>Save Contact →</span>
              </button>
              <p class="text-[10px] t-text-muted text-center">Saves to your lead list. You'll get a notification email.</p>
            </form>
          </div>
          <div v-else key="success" class="flex flex-col items-center justify-center min-h-[60dvh] text-center px-4">
            <div class="w-16 h-16 border t-border-accent flex items-center justify-center mx-auto mb-6">
              <Icon name="i-lucide-check" class="w-6 h-6 t-text-accent" />
            </div>
            <h3 class="t-heading text-2xl font-light t-text mb-3">Contact Saved</h3>
            <p class="t-text-secondary text-sm mb-1">{{ form.name }}</p>
            <p class="t-text-tertiary text-xs mb-1">{{ form.email }}</p>
            <p class="t-text-tertiary text-xs mb-8" v-if="form.building">{{ form.building }}</p>
            <div class="flex items-center gap-2 mb-10">
              <span class="px-3 py-1 text-[9px] tracking-widest uppercase t-bg-subtle t-text-tertiary"
                :class="{'t-bg-accent t-text-inverse': form.interest === 'hot'}">
                {{ interestLevels.find(l => l.value === form.interest)?.label }}
              </span>
              <span class="px-3 py-1 text-[9px] tracking-widest uppercase t-bg-subtle t-text-tertiary">
                {{ roles.find(r => r.value === form.role)?.label }}
              </span>
            </div>
            <button @click="resetForm"
              class="px-8 py-3 border t-border-accent t-text-accent text-[10px] tracking-[0.15em] uppercase hover:t-bg-subtle transition">
              Add Another →
            </button>
          </div>
        </Transition>
      </section>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { gsap } from 'gsap'
import { toast } from 'vue-sonner'

useHead({
  title: 'HOA Connect · Event',
  meta: [{ name: 'robots', content: 'noindex' }],
})

const { forceThemeStyle } = useTheme()
forceThemeStyle('classic')

const SELL_SHEET_URL = 'https://www.hoaconnect.info/sell-sheet'
const qrCodeUrl = computed(() =>
  `https://api.qrserver.com/v1/create-qr-code/?size=280x280&color=8B7355&bgcolor=FFFFFF&data=${encodeURIComponent(SELL_SHEET_URL)}`
)

const tabs = [
  { id: 'qr', label: 'QR Code' },
  { id: 'pitch', label: 'Pitch' },
  { id: 'lead', label: 'Capture Lead' },
]

const pitches = [
  {
    id: 'realtor', tab: 'Realtor', label: 'For Realtors',
    headline: 'Close More Condo Sales',
    body: 'When buildings look professionally managed, units sell faster and buyers feel more confident. HOA Connect gives your listings a competitive edge.',
    points: [
      'Beautiful resident portals buyers actually want to use',
      'Organized documents ready for due diligence',
      'Buildings that look like brands, not liabilities',
    ],
    cta: 'Refer a building →',
  },
  {
    id: 'board', tab: 'HOA Board', label: 'For HOA Boards',
    headline: 'Your Building Deserves Better Software',
    body: 'Stop emailing spreadsheets. HOA Connect is design-forward management software built by a Miami Beach creative agency.',
    points: [
      'Starting at $2.50/unit/month — less than 0.4% of your budget',
      'Florida compliance tools built-in (40-year, fund segregation)',
      'Residents love using it — actually check announcements',
    ],
    cta: 'Start free trial →',
  },
  {
    id: 'manager', tab: 'Prop. Mgr', label: 'For Property Managers',
    headline: 'Scale Your Portfolio, Not Your Workload',
    body: 'One dashboard for your entire portfolio. White-label portals. Your clients see your brand, not ours.',
    points: [
      'Manage unlimited buildings from one account',
      'Volume discounts built in as you grow',
      'White-label: your logo, your domain, your credit',
    ],
    cta: 'See portfolio pricing →',
  },
]

const stats = [
  { num: '$2.50', label: 'Per unit / month' },
  { num: '3', label: 'Premium themes' },
  { num: 'FL', label: 'Compliance ready' },
]

const roles = [
  { value: 'realtor', label: 'Realtor', icon: 'i-lucide-key' },
  { value: 'board', label: 'HOA Board', icon: 'i-lucide-building-2' },
  { value: 'manager', label: 'Property Mgr', icon: 'i-lucide-briefcase' },
  { value: 'developer', label: 'Developer', icon: 'i-lucide-hard-hat' },
]

const interestLevels = [
  { value: 'warm', label: 'Warm' },
  { value: 'hot', label: 'Hot 🔥' },
  { value: 'followup', label: 'Follow Up' },
]

const activeTab = ref('qr')
const activePitch = ref('realtor')
const currentPitch = computed(() => pitches.find(p => p.id === activePitch.value))

const form = ref({
  name: '', email: '', building: '', phone: '',
  role: 'realtor', interest: 'warm', notes: '',
})
const isSubmitting = ref(false)
const submitted = ref(false)
const rootRef = ref(null)

const resetForm = () => {
  form.value = { name: '', email: '', building: '', phone: '', role: 'realtor', interest: 'warm', notes: '' }
  submitted.value = false
}

const handleSubmit = async () => {
  isSubmitting.value = true
  try {
    await $fetch('/api/interest', {
      method: 'POST',
      body: {
        ...form.value,
        source: 'event_toolkit',
        event: 'MBCC Real Estate Luncheon 2026',
        timestamp: new Date().toISOString(),
      },
    })
    submitted.value = true
    toast.success('Contact saved!', { description: `${form.value.name} added to your lead list.` })
  } catch {
    submitted.value = true
    toast.success('Saved — sync when back online.')
  } finally {
    isSubmitting.value = false
  }
}

function animateQR() {
  gsap.fromTo('.qr-wordmark', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', delay: 0.05 })
  gsap.fromTo('.qr-divider', { opacity: 0, scaleX: 0 }, { opacity: 1, scaleX: 1, duration: 0.5, ease: 'power3.out', delay: 0.15 })
  gsap.fromTo('.qr-tagline', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', delay: 0.2 })
  gsap.fromTo('.qr-frame', { opacity: 0, y: 20, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out', delay: 0.25 })
  gsap.fromTo('.qr-url', { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out', delay: 0.5, stagger: 0.1 })
  gsap.fromTo('.qr-pitch', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', delay: 0.6 })
}
function animatePitch() {
  gsap.fromTo('.pitch-selector', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', delay: 0.05 })
  gsap.fromTo('.pitch-card', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', delay: 0.15 })
  gsap.fromTo('.pitch-stats', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', delay: 0.3 })
  gsap.fromTo('.pitch-agency', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out', delay: 0.4 })
}
function animateLead() {
  gsap.fromTo('.lead-header', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', delay: 0.05 })
  gsap.fromTo('.lead-form', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', delay: 0.15 })
}

onMounted(() => animateQR())

watch(activeTab, (tab) => {
  nextTick(() => {
    if (tab === 'qr') animateQR()
    if (tab === 'pitch') animatePitch()
    if (tab === 'lead') animateLead()
  })
})
</script>

<style scoped>
.grain-overlay {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 200px 200px;
}
.tab-fade-enter-active, .tab-fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.tab-fade-enter-from { opacity: 0; transform: translateY(8px); }
.tab-fade-leave-to { opacity: 0; transform: translateY(-8px); }
.pitch-swap-enter-active, .pitch-swap-leave-active { transition: opacity 0.15s ease; }
.pitch-swap-enter-from, .pitch-swap-leave-to { opacity: 0; }
.qr-divider { transform-origin: left center; }
</style>
