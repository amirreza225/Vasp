<template>
  <Users />
</template>

<script setup lang="ts">
import Users from '@src/pages/admin/Users.vue'
definePageMeta({
  middleware: 'auth',
  layout: 'default',
})
</script>
