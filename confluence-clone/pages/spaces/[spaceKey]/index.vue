<template>
  <SpaceView />
</template>

<script setup lang="ts">
import SpaceView from '@src/pages/SpaceView.vue'
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
</script>
