<template>
  <div class="t-card p-6 sm:p-8 max-w-2xl">
    <!-- Success state -->
    <div v-if="submitted" class="text-center py-8">
      <div
        class="w-14 h-14 mx-auto mb-5 rounded-full t-bg-accent flex items-center justify-center"
      >
        <Icon name="i-heroicons-check" class="w-7 h-7 t-text-inverse" />
      </div>
      <h3 class="t-heading text-2xl font-normal t-text mb-2">You're on the list</h3>
      <p class="text-[0.9375rem] leading-relaxed t-text-secondary max-w-md mx-auto">
        Thanks{{ form.name ? `, ${form.name.split(" ")[0]}` : "" }}. We'll reach out
        to <span class="t-text-accent">{{ form.email }}</span> as early access opens
        up for your building.
      </p>
    </div>

    <!-- Form -->
    <form v-else @submit.prevent="submit" novalidate>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs tracking-wider uppercase t-text-tertiary mb-2"
            >Name</label
          >
          <input
            v-model.trim="form.name"
            type="text"
            class="t-input w-full"
            placeholder="Your name"
            autocomplete="name"
          />
        </div>
        <div>
          <label class="block text-xs tracking-wider uppercase t-text-tertiary mb-2"
            >Email <span class="t-text-accent">*</span></label
          >
          <input
            v-model.trim="form.email"
            type="email"
            required
            class="t-input w-full"
            placeholder="name@example.com"
            autocomplete="email"
          />
        </div>

        <div>
          <label class="block text-xs tracking-wider uppercase t-text-tertiary mb-2"
            >I'm a…</label
          >
          <select v-model="form.role" class="t-input w-full">
            <option value="" disabled>Select your role</option>
            <option value="board_member">Board member</option>
            <option value="property_manager">Property manager</option>
            <option value="developer">Developer / sponsor</option>
            <option value="resident">Resident / owner</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label class="block text-xs tracking-wider uppercase t-text-tertiary mb-2"
            >Building / association</label
          >
          <input
            v-model.trim="form.association_name"
            type="text"
            class="t-input w-full"
            placeholder="Building name"
            autocomplete="organization"
          />
        </div>

        <div>
          <label class="block text-xs tracking-wider uppercase t-text-tertiary mb-2"
            >Building size</label
          >
          <select v-model="form.unit_count" class="t-input w-full">
            <option value="" disabled>Number of units</option>
            <option value="0-30">Up to 30 units</option>
            <option value="31-60">31–60 units</option>
            <option value="61-100">61–100 units</option>
            <option value="101-200">101–200 units</option>
            <option value="200+">200+ units</option>
          </select>
        </div>
        <div class="grid grid-cols-[1fr_5rem] gap-3">
          <div>
            <label
              class="block text-xs tracking-wider uppercase t-text-tertiary mb-2"
              >City</label
            >
            <input
              v-model.trim="form.city"
              type="text"
              class="t-input w-full"
              placeholder="Miami Beach"
              autocomplete="address-level2"
            />
          </div>
          <div>
            <label
              class="block text-xs tracking-wider uppercase t-text-tertiary mb-2"
              >State</label
            >
            <input
              v-model.trim="form.state"
              type="text"
              maxlength="2"
              class="t-input w-full uppercase"
              placeholder="FL"
              autocomplete="address-level1"
            />
          </div>
        </div>
      </div>

      <!-- Interests -->
      <div class="mt-5">
        <label class="block text-xs tracking-wider uppercase t-text-tertiary mb-3"
          >What are you most interested in?</label
        >
        <div class="flex flex-wrap gap-2">
          <button
            v-for="opt in interestOptions"
            :key="opt"
            type="button"
            @click="toggleInterest(opt)"
            class="px-3 py-1.5 text-sm rounded-full border transition"
            :class="
              form.interests.includes(opt)
                ? 't-bg-accent t-text-inverse border-transparent'
                : 't-border t-text-secondary hover:t-border-accent'
            "
          >
            {{ opt }}
          </button>
        </div>
      </div>

      <!-- Goals -->
      <div class="mt-5">
        <label class="block text-xs tracking-wider uppercase t-text-tertiary mb-2"
          >Your goals <span class="t-text-tertiary normal-case">(optional)</span></label
        >
        <textarea
          v-model.trim="form.goals"
          rows="3"
          class="t-input w-full resize-none"
          placeholder="What would you love HOA Connect to do for your building?"
        ></textarea>
      </div>

      <!-- Honeypot: hidden from humans, catches bots -->
      <div class="hidden" aria-hidden="true">
        <label>Company website</label>
        <input v-model="honeypot" type="text" tabindex="-1" autocomplete="off" />
      </div>

      <p v-if="errorMsg" class="mt-4 text-sm text-red-500">{{ errorMsg }}</p>

      <button
        type="submit"
        :disabled="submitting"
        class="t-btn w-full mt-6 py-3.5 text-sm font-semibold transition disabled:opacity-60"
      >
        <span v-if="submitting" class="inline-flex items-center gap-2">
          <span
            class="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
          ></span>
          Submitting…
        </span>
        <span v-else>Request Early Access</span>
      </button>
      <p class="mt-3 text-xs t-text-tertiary text-center">
        No spam. We'll only email you about HOA Connect early access.
      </p>
    </form>
  </div>
</template>

<script setup>
import { reactive, ref } from "vue";

const props = defineProps({
  sourcePage: { type: String, default: "home" },
  // Interests pre-checked when the form mounts (e.g. ["Contextual AI assistant"]).
  defaultInterests: { type: Array, default: () => [] },
});

const config = useRuntimeConfig();
const directusUrl = (config.public.directusUrl || "").replace(/\/$/, "");

const interestOptions = [
  "Contextual AI assistant",
  "Voyage document reader",
  "Context-aware drafting",
  "Branded resident portal",
  "Financial & compliance tools",
  "Property-manager portal",
  "Data ownership & export",
];

const form = reactive({
  name: "",
  email: "",
  role: "",
  association_name: "",
  unit_count: "",
  city: "",
  state: "",
  interests: [...props.defaultInterests],
  goals: "",
});

const honeypot = ref("");
const submitting = ref(false);
const submitted = ref(false);
const errorMsg = ref("");

const toggleInterest = (opt) => {
  const i = form.interests.indexOf(opt);
  if (i === -1) form.interests.push(opt);
  else form.interests.splice(i, 1);
};

const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

const submit = async () => {
  errorMsg.value = "";
  if (!isValidEmail(form.email)) {
    errorMsg.value = "Please enter a valid email address.";
    return;
  }
  // Bot trap — silently "succeed" without writing anything.
  if (honeypot.value) {
    submitted.value = true;
    return;
  }

  submitting.value = true;
  try {
    await $fetch(`${directusUrl}/items/waitlist_signups`, {
      method: "POST",
      body: {
        name: form.name || null,
        email: form.email,
        role: form.role || null,
        association_name: form.association_name || null,
        unit_count: form.unit_count || null,
        city: form.city || null,
        state: form.state ? form.state.toUpperCase() : null,
        interests: form.interests.length ? form.interests : null,
        goals: form.goals || null,
        source_page: props.sourcePage,
        user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      },
    });
    submitted.value = true;
  } catch (e) {
    errorMsg.value =
      "Something went wrong submitting the form. Please try again, or email hello@hoaconnect.info.";
  } finally {
    submitting.value = false;
  }
};
</script>
