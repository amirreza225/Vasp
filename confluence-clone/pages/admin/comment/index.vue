<script setup lang="ts">
import CommentAdmin from '@src/admin/views/comment/index.vue'
definePageMeta({ layout: 'admin', middleware: 'auth' })
</script>

<template>
  <CommentAdmin />
</template>
