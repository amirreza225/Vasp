<script setup lang="ts">
import SpaceAdmin from '@src/admin/views/space/index.vue'
definePageMeta({ layout: 'admin', middleware: 'auth' })
</script>

<template>
  <SpaceAdmin />
</template>
