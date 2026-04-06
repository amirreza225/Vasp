<template>
  <Profile />
</template>

<script setup lang="ts">
import Profile from '@src/pages/Profile.vue'
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
</script>
