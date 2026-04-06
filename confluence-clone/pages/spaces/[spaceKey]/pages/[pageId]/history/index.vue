<template>
  <PageHistory />
</template>

<script setup lang="ts">
import PageHistory from '@src/pages/PageHistory.vue'
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
</script>
