<script setup lang="ts">
import AttachmentAdmin from '@src/admin/views/attachment/index.vue'
definePageMeta({ layout: 'admin', middleware: 'auth' })
</script>

<template>
  <AttachmentAdmin />
</template>
