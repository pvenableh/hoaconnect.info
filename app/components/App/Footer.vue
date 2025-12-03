<script setup lang="ts">
const { user } = useDirectusAuth();
const route = useRoute();
const config = useRuntimeConfig();

const currentYear = new Date().getFullYear();

// Check if we're on an organization page (slug route)
const isOnOrgPage = computed(() => !!route.params.slug);

// Footer links for authenticated users
const authenticatedLinks = [
  {
    title: "Platform",
    links: [
      { label: "Dashboard", path: "/dashboard" },
      { label: "Documents", path: "/documents" },
      { label: "Members", path: "/members" },
      { label: "Domain Setup", path: "/domain-setup" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", path: "/help" },
      { label: "Contact", path: "/contact" },
    ],
  },
];

// Footer links for public users (filter out "Get Started" on org pages)
const publicLinks = computed(() => [
  {
    title: "Product",
    links: [
      { label: "Features", path: "/#features" },
      { label: "Pricing", path: "/#plans" },
      // Only show "Get Started" if not on an org page
      ...(isOnOrgPage.value ? [] : [{ label: "Get Started", path: "/setup" }]),
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", path: "/about" },
      { label: "Contact", path: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", path: "/privacy" },
      { label: "Terms of Service", path: "/terms" },
    ],
  },
]);

const footerLinks = computed(() => (user.value ? authenticatedLinks : publicLinks.value));
</script>

<template>
  <footer class="bg-gray-900 text-gray-300">
    <div class="max-w-7xl mx-auto px-6 py-12">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
        <!-- Brand Section -->
        <div class="md:col-span-1">
          <h3 class="text-white text-xl font-bold mb-4">HOA Connect</h3>
          <p class="text-sm text-gray-400">
            Simplifying HOA management for communities of all sizes.
          </p>
        </div>

        <!-- Footer Links -->
        <div
          v-for="section in footerLinks"
          :key="section.title"
          class="md:col-span-1"
        >
          <h4 class="text-white font-semibold mb-4 uppercase text-xs tracking-wider">
            {{ section.title }}
          </h4>
          <ul class="space-y-2">
            <li v-for="link in section.links" :key="link.path">
              <component
                :is="link.path.startsWith('/#') ? 'a' : 'NuxtLink'"
                :to="link.path.startsWith('/#') ? undefined : link.path"
                :href="link.path.startsWith('/#') ? link.path : undefined"
                class="text-sm hover:text-white transition"
              >
                {{ link.label }}
              </component>
            </li>
          </ul>
        </div>
      </div>

      <!-- Bottom Bar -->
      <div
        class="mt-12 pt-8 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center"
      >
        <p class="text-sm text-gray-400">
          &copy; {{ currentYear }} HOA Connect. All rights reserved.
        </p>

        <!-- Social Links (Optional) -->
        <div class="flex gap-4 mt-4 md:mt-0">
          <a
            href="#"
            class="text-gray-400 hover:text-white transition"
            aria-label="Twitter"
          >
            <Icon name="i-lucide-twitter" class="w-5 h-5" />
          </a>
          <a
            href="#"
            class="text-gray-400 hover:text-white transition"
            aria-label="LinkedIn"
          >
            <Icon name="i-lucide-linkedin" class="w-5 h-5" />
          </a>
          <a
            href="#"
            class="text-gray-400 hover:text-white transition"
            aria-label="Facebook"
          >
            <Icon name="i-lucide-facebook" class="w-5 h-5" />
          </a>
        </div>
      </div>
    </div>
  </footer>
</template>
