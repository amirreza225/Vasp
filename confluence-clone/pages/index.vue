<template>
  <Home />
</template>

<script setup lang="ts">
import Home from '@src/pages/Home.vue'
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
</script>
