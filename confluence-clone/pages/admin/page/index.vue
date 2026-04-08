<script setup lang="ts">
import PageAdmin from '@src/admin/views/page/index.vue'
definePageMeta({ layout: 'admin', middleware: 'auth' })
</script>

<template>
  <PageAdmin />
</template>
