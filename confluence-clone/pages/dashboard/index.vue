<template>
  <Dashboard />
</template>

<script setup lang="ts">
import Dashboard from '@src/pages/Dashboard.vue'
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
</script>
