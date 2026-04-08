<template>
  <PageCreate />
</template>

<script setup lang="ts">
import PageCreate from '@src/pages/PageCreate.vue'
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
</script>
