<script setup lang="ts">
import UserAdmin from '@src/admin/views/user/index.vue'
definePageMeta({ layout: 'admin', middleware: 'auth' })
</script>

<template>
  <UserAdmin />
</template>
