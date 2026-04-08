<template>
  <Spaces />
</template>

<script setup lang="ts">
import Spaces from '@src/pages/Spaces.vue'
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
</script>
