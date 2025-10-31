<template>
  <div class="min-h-screen bg-white">
    <main class="">
      <slot />
    </main>

    <!-- <footer class="py-16 mt-32">
      <div class="container mx-auto px-6">
        <div class="grid grid-cols-1 gap-8">
          <div class="text-center">
            <p class="text-elegant uppercase text-xs">
              © {{ new Date().getFullYear() }} {{ $config.public.siteTitle }}.
              All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer> -->
  </div>
</template>

<script setup></script>
