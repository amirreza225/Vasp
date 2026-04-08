<template>
  <PageEdit />
</template>

<script setup lang="ts">
import PageEdit from '@src/pages/PageEdit.vue'
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
</script>
