<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Card from 'primevue/card'
import { UserApi } from '../api/user.js'
import { SpaceApi } from '../api/space.js'
import { PageApi } from '../api/page.js'
import { LabelApi } from '../api/label.js'
import { PageVersionApi } from '../api/page-version.js'
import { CommentApi } from '../api/comment.js'
import { AttachmentApi } from '../api/attachment.js'

const loading = ref(true)
const counts = ref({
  user: 0,
  space: 0,
  page: 0,
  label: 0,
  pageVersion: 0,
  comment: 0,
  attachment: 0,
})

async function fetchCounts() {
  loading.value = true
  try {
    const results = await Promise.allSettled([
      UserApi.list({ limit: 1, offset: 0 }).then((r) => ({ key: 'user', total: r?.total ?? 0 })),
      SpaceApi.list({ limit: 1, offset: 0 }).then((r) => ({ key: 'space', total: r?.total ?? 0 })),
      PageApi.list({ limit: 1, offset: 0 }).then((r) => ({ key: 'page', total: r?.total ?? 0 })),
      LabelApi.list({ limit: 1, offset: 0 }).then((r) => ({ key: 'label', total: r?.total ?? 0 })),
      PageVersionApi.list({ limit: 1, offset: 0 }).then((r) => ({ key: 'pageVersion', total: r?.total ?? 0 })),
      CommentApi.list({ limit: 1, offset: 0 }).then((r) => ({ key: 'comment', total: r?.total ?? 0 })),
      AttachmentApi.list({ limit: 1, offset: 0 }).then((r) => ({ key: 'attachment', total: r?.total ?? 0 })),
    ])
    for (const result of results) {
      if (result.status === 'fulfilled') {
        counts.value[result.value.key] = result.value.total
      }
    }
  } finally {
    loading.value = false
  }
}

onMounted(fetchCounts)
</script>

<template>
  <div>
    <h2 class="vasp-admin-page-title">Dashboard</h2>
    <div class="vasp-admin-stats">
      <Card class="vasp-admin-stat-card">
        <template #title>User</template>
        <template #content>
          <span class="vasp-admin-stat-value" v-if="!loading">{{ counts.user }}</span>
          <span class="vasp-admin-stat-loading" v-else>…</span>
        </template>
      </Card>
      <Card class="vasp-admin-stat-card">
        <template #title>Space</template>
        <template #content>
          <span class="vasp-admin-stat-value" v-if="!loading">{{ counts.space }}</span>
          <span class="vasp-admin-stat-loading" v-else>…</span>
        </template>
      </Card>
      <Card class="vasp-admin-stat-card">
        <template #title>Page</template>
        <template #content>
          <span class="vasp-admin-stat-value" v-if="!loading">{{ counts.page }}</span>
          <span class="vasp-admin-stat-loading" v-else>…</span>
        </template>
      </Card>
      <Card class="vasp-admin-stat-card">
        <template #title>Label</template>
        <template #content>
          <span class="vasp-admin-stat-value" v-if="!loading">{{ counts.label }}</span>
          <span class="vasp-admin-stat-loading" v-else>…</span>
        </template>
      </Card>
      <Card class="vasp-admin-stat-card">
        <template #title>PageVersion</template>
        <template #content>
          <span class="vasp-admin-stat-value" v-if="!loading">{{ counts.pageVersion }}</span>
          <span class="vasp-admin-stat-loading" v-else>…</span>
        </template>
      </Card>
      <Card class="vasp-admin-stat-card">
        <template #title>Comment</template>
        <template #content>
          <span class="vasp-admin-stat-value" v-if="!loading">{{ counts.comment }}</span>
          <span class="vasp-admin-stat-loading" v-else>…</span>
        </template>
      </Card>
      <Card class="vasp-admin-stat-card">
        <template #title>Attachment</template>
        <template #content>
          <span class="vasp-admin-stat-value" v-if="!loading">{{ counts.attachment }}</span>
          <span class="vasp-admin-stat-loading" v-else>…</span>
        </template>
      </Card>
    </div>
    <Card style="margin-top: 20px">
      <template #title>Welcome to Confluence Clone Admin</template>
      <template #content>
        <p>Manage your application data using the sidebar navigation.</p>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.vasp-admin-page-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 20px;
}

.vasp-admin-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.vasp-admin-stat-card {
  text-align: center;
}

.vasp-admin-stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--p-primary-500, #6366f1);
}

.vasp-admin-stat-loading {
  font-size: 24px;
  color: var(--p-surface-400, #adb5bd);
}
</style>
