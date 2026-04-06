<script setup lang="ts">
import { useRouter } from 'vue-router'
import PanelMenu from 'primevue/panelmenu'
import Button from 'primevue/button'
import { useAuth } from '../vasp/auth.js'

const { user, logout: authLogout } = useAuth()
async function handleLogout() {
  await authLogout()
}

const router = useRouter()

const menuItems = [
  { label: 'Dashboard', icon: 'pi pi-home', command: () => router.push('/admin') },
  { label: 'User', icon: 'pi pi-table', command: () => router.push('/admin/user') },
  { label: 'Space', icon: 'pi pi-table', command: () => router.push('/admin/space') },
  { label: 'Page', icon: 'pi pi-table', command: () => router.push('/admin/page') },
  { label: 'Label', icon: 'pi pi-table', command: () => router.push('/admin/label') },
  { label: 'PageVersion', icon: 'pi pi-table', command: () => router.push('/admin/page-version') },
  { label: 'Comment', icon: 'pi pi-table', command: () => router.push('/admin/comment') },
  { label: 'Attachment', icon: 'pi pi-table', command: () => router.push('/admin/attachment') },
]
</script>

<template>
  <div class="vasp-admin-shell">
    <aside class="vasp-admin-sidebar">
      <div class="vasp-admin-logo">Confluence Clone Admin</div>
      <PanelMenu :model="menuItems" class="vasp-admin-nav" />
    </aside>
    <div class="vasp-admin-body">
      <header class="vasp-admin-header">
        <span class="vasp-admin-header-title">Confluence Clone Admin</span>
        <div class="vasp-admin-header-actions" v-if="user">
          <span class="vasp-admin-username">{{ user.username ?? user.email ?? 'Admin' }}</span>
          <Button label="Logout" text severity="secondary" size="small" @click="handleLogout" />
        </div>
      </header>
      <main class="vasp-admin-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.vasp-admin-shell {
  display: flex;
  min-height: 100vh;
}

.vasp-admin-sidebar {
  width: 240px;
  background: var(--p-surface-900, #1a1a2e);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.vasp-admin-logo {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.vasp-admin-nav {
  flex: 1;
  border: none !important;
  background: transparent !important;
}

:deep(.vasp-admin-nav .p-panelmenu-header-content) {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
}

:deep(.vasp-admin-nav .p-panelmenu-header-content:hover) {
  background: rgba(255, 255, 255, 0.1);
}

.vasp-admin-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--p-surface-50, #f8f9fa);
  min-width: 0;
}

.vasp-admin-header {
  height: 56px;
  background: var(--p-surface-0, #fff);
  border-bottom: 1px solid var(--p-surface-200, #dee2e6);
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 16px;
}

.vasp-admin-header-title {
  flex: 1;
  font-weight: 600;
  font-size: 16px;
}

.vasp-admin-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vasp-admin-username {
  font-size: 14px;
  color: var(--p-surface-500, #868e96);
}

.vasp-admin-content {
  flex: 1;
  padding: 24px;
  overflow: auto;
}
</style>
