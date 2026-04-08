<template>
  <Labels />
</template>

<script setup lang="ts">
import Labels from '@src/pages/admin/Labels.vue'
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
</script>
