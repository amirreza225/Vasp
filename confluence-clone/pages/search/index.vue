<template>
  <Search />
</template>

<script setup lang="ts">
import Search from '@src/pages/Search.vue'
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
</script>
