<template>
  <section class="py-24 lg:py-32 px-6 lg:px-16 bg-gray-900 text-cream" id="early-access">
    <div class="max-w-2xl mx-auto text-center">
      <p class="text-xs tracking-[0.25em] uppercase text-gold mb-6 opacity-0 animate-fade-up">
        Early Access
      </p>
      <h2 class="t-heading text-[clamp(2rem,5vw,3rem)] font-light leading-tight mb-6 opacity-0 animate-fade-up animation-delay-100">
        Be First to Transform<br />Your Building
      </h2>
      <div class="w-12 h-px bg-gold mx-auto mb-8 opacity-0 animate-fade-up animation-delay-200" />
      <p class="text-[1.0625rem] leading-relaxed text-cream/70 mb-12 opacity-0 animate-fade-up animation-delay-300">
        HOA Connect is launching in Miami Beach. Join the early access list and lock in founding
        member pricing before we go public.
      </p>

      <form
        v-if="!submitted"
        class="flex flex-col gap-4 text-left opacity-0 animate-fade-up animation-delay-400"
        @submit.prevent="handleSubmit"
      >
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs tracking-[0.15em] uppercase text-gold/70 mb-2">Your Name</label>
            <input v-model="form.name" type="text" placeholder="Jane Smith" required
              class="w-full px-4 py-3 bg-white/5 border border-white/10 text-cream placeholder:text-cream/30 focus:border-gold/50 focus:outline-none focus:ring-0 transition text-[0.9375rem]" />
          </div>
          <div>
            <label class="block text-xs tracking-[0.15em] uppercase text-gold/70 mb-2">Email Address</label>
            <input v-model="form.email" type="email" placeholder="jane@example.com" required
              class="w-full px-4 py-3 bg-white/5 border border-white/10 text-cream placeholder:text-cream/30 focus:border-gold/50 focus:outline-none focus:ring-0 transition text-[0.9375rem]" />
          </div>
        </div>
        <div>
          <label class="block text-xs tracking-[0.15em] uppercase text-gold/70 mb-2">Building or Company Name</label>
          <input v-model="form.building" type="text" placeholder="The Setai HOA / Compass Real Estate"
            class="w-full px-4 py-3 bg-white/5 border border-white/10 text-cream placeholder:text-cream/30 focus:border-gold/50 focus:outline-none focus:ring-0 transition text-[0.9375rem]" />
        </div>
        <div>
          <label class="block text-xs tracking-[0.15em] uppercase text-gold/70 mb-3">I Am A...</label>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              v-for="role in roles"
              :key="role.value"
              type="button"
              :class="[
                'py-3 px-2 text-xs tracking-[0.1em] uppercase border transition text-center',
                form.role === role.value
                  ? 'border-gold/60 bg-gold/10 text-gold'
                  : 'border-white/10 text-cream/40 hover:border-white/20 hover:text-cream/60'
              ]"
              @click="form.role = role.value"
            >{{ role.label }}</button>
          </div>
        </div>
        <button type="submit" :disabled="isSubmitting"
          class="w-full py-4 bg-gold/90 hover:bg-gold text-gray-900 font-medium tracking-[0.2em] uppercase text-sm transition disabled:opacity-50 disabled:cursor-not-allowed mt-2">
          <span v-if="isSubmitting" class="flex items-center justify-center gap-2">
            <Icon name="i-lucide-loader" class="w-4 h-4 animate-spin" />
            Submitting...
          </span>
          <span v-else>Request Early Access →</span>
        </button>
        <p class="text-xs text-cream/30 text-center">No spam. Founding member pricing locked at sign-up.</p>
      </form>

      <div v-else class="py-16 opacity-0 animate-fade-up">
        <div class="w-16 h-16 rounded-full border border-gold/30 flex items-center justify-center mx-auto mb-8">
          <Icon name="i-lucide-check" class="w-6 h-6 text-gold" />
        </div>
        <h3 class="t-heading text-2xl font-light mb-4">You're on the list.</h3>
        <p class="text-cream/60 text-[0.9375rem] mb-2">
          We'll be in touch within 24 hours, {{ form.name.split(' ')[0] }}.
        </p>
        <p class="text-xs tracking-wider text-gold/50 uppercase">HOA Connect · Miami Beach</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { toast } from 'vue-sonner'

const form = ref({ name: '', email: '', building: '', role: 'realtor' })
const isSubmitting = ref(false)
const submitted = ref(false)

const roles = [
  { value: 'realtor', label: 'Realtor' },
  { value: 'board', label: 'HOA Board' },
  { value: 'manager', label: 'Prop. Mgr' },
  { value: 'developer', label: 'Developer' },
]

async function handleSubmit() {
  isSubmitting.value = true
  try {
    await $fetch('/api/interest', {
      method: 'POST',
      body: { ...form.value, source: 'sell_sheet', timestamp: new Date().toISOString() },
    })
    submitted.value = true
    toast.success('Request received!', { description: `We'll reach out to ${form.value.email} within 24 hours.` })
  } catch (error) {
    console.error('Interest form error:', error)
    submitted.value = true
    toast.success("You're on the list!")
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
@keyframes fade-up {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-up { animation: fade-up 0.7s ease forwards; }
.animation-delay-100 { animation-delay: 0.1s; }
.animation-delay-200 { animation-delay: 0.2s; }
.animation-delay-300 { animation-delay: 0.3s; }
.animation-delay-400 { animation-delay: 0.4s; }
</style>
