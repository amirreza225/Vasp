import { ref } from 'vue'

export const notifications = ref([])

export function pushNotification(type, message, timeoutMs = 3500) {
  const id = Date.now() + Math.floor(Math.random() * 1000)
  notifications.value.push({ id, type, message })

  if (timeoutMs > 0) {
    setTimeout(() => removeNotification(id), timeoutMs)
  }

  return id
}

export function removeNotification(id) {
  notifications.value = notifications.value.filter((item) => item.id !== id)
}

export function notifyError(error) {
  if (error instanceof Error && error.message) {
    pushNotification('error', error.message)
    return
  }
  pushNotification('error', 'Request failed')
}

export function useVaspNotifications() {
  return {
    notifications,
    pushNotification,
    removeNotification,
    notifyError,
  }
}
