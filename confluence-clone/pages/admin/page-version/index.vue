<script setup lang="ts">
import PageVersionAdmin from '@src/admin/views/page-version/index.vue'
definePageMeta({ layout: 'admin', middleware: 'auth' })
</script>

<template>
  <PageVersionAdmin />
</template>
