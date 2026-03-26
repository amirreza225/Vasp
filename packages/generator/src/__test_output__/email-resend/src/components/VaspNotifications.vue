<script setup>
import { notifications, removeNotification } from '../vasp/useVaspNotifications.js'
</script>

<template>
  <div class="vasp-notifications">
    <div
      v-for="item in notifications"
      :key="item.id"
      class="vasp-notification"
      :class="`is-${item.type}`"
      @click="removeNotification(item.id)"
    >
      
    </div>
  </div>
</template>

<style scoped>
.vasp-notifications {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vasp-notification {
  min-width: 220px;
  padding: 10px 12px;
  border-radius: 8px;
  color: #111827;
  background: #e5e7eb;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  animation: slide-in 0.2s ease-out;
}

.vasp-notification.is-error {
  background: #fee2e2;
  color: #991b1b;
}

.vasp-notification.is-success {
  background: #dcfce7;
  color: #166534;
}

.vasp-notification.is-info {
  background: #dbeafe;
  color: #1e40af;
}

@keyframes slide-in {
  from { transform: translateX(20px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
</style>
