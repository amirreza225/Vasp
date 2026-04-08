<script setup lang="ts">
import AdminDashboard from '@src/admin/views/Dashboard.vue'
definePageMeta({ layout: 'admin', middleware: 'auth' })
</script>

<template>
  <AdminDashboard />
</template>
