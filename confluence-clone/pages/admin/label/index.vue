<script setup lang="ts">
import LabelAdmin from '@src/admin/views/label/index.vue'
definePageMeta({ layout: 'admin', middleware: 'auth' })
</script>

<template>
  <LabelAdmin />
</template>
