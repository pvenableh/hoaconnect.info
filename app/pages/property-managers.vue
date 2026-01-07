<template>
  <div class="min-h-screen t-bg t-text">
    <PagesPropertyManagersSellSheet />
  </div>
</template>

<script setup>
const { forceThemeStyle } = useTheme();

// Force Classic theme for the property managers page
forceThemeStyle('classic');
</script>
