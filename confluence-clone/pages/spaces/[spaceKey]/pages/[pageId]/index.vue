<template>
  <PageView />
</template>

<script setup lang="ts">
import PageView from '@src/pages/PageView.vue'
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
</script>
