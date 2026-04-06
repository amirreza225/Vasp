<script setup lang="ts">
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import Password from 'primevue/password'
import { useToast } from 'primevue/usetoast'
import { UserApi } from '../../api/user.js'

const props = defineProps({
  visible: Boolean,
  record: Object,
})

const emit = defineEmits(['close', 'saved'])

const toast = useToast()

// JSON fields need string ↔ object conversion
const jsonFields = []
// Nullable DateTime fields — convert empty string to null before submitting
const nullableDateTimeFields = []
// Nullable String/Text fields — convert empty string to null before submitting
const nullableStringTextFields = ['displayName', 'bio', ]

// Options for relation selects (loaded on mount)
function emptyForm() {
  return {
    username: '',
    email: '',
    role: 'admin',
    displayName: null,
    bio: null,
    avatar: null,
    isActive: false,

    password: '',

  }
}

const form = ref(emptyForm())
const loading = ref(false)

watch(() => props.record, (val) => {
  if (val) {
    const copy = { ...val }
    for (const k of jsonFields) {
      if (copy[k] != null) {
        copy[k] = typeof copy[k] === 'string' ? copy[k] : JSON.stringify(copy[k], null, 2)
      }
    }
    form.value = copy
  } else {
    form.value = emptyForm()
  }
}, { immediate: true })


async function handleSubmit() {
  loading.value = true
  try {
    const payload = { ...form.value }
    for (const k of jsonFields) {
      if (payload[k] && typeof payload[k] === 'string') {
        try { payload[k] = JSON.parse(payload[k]) } catch {
          toast.add({ severity: 'error', summary: 'Invalid JSON', detail: `Field "${k}" must be valid JSON`, life: 4000 })
          return
        }
      }
    }
    for (const k of nullableDateTimeFields) {
      if (payload[k] === '') payload[k] = null
    }
    for (const k of nullableStringTextFields) {
      if (payload[k] === '') payload[k] = null
    }
    if (props.record?.id) {
      await UserApi.update(props.record.id, payload)
    } else {
      await UserApi.create(payload)
    }
    emit('saved')
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Save Failed', detail: err instanceof Error ? err.message : 'An error occurred', life: 4000 })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="record?.id ? 'Edit User' : 'Create User'"
    :style="{ width: '560px' }"
    modal
    @update:visible="emit('close')"
  >
    <div class="vasp-admin-form">
      <div class="vasp-admin-form-field">
        <label class="vasp-admin-form-label">Username</label>
        <InputText v-model="form.username" class="w-full" />
      </div>
      <div class="vasp-admin-form-field">
        <label class="vasp-admin-form-label">Email</label>
        <InputText v-model="form.email" class="w-full" />
      </div>
      <div class="vasp-admin-form-field">
        <label class="vasp-admin-form-label">Role</label>
        <Select
          v-model="form.role"
          :options="['admin', 'editor', 'viewer']"
          class="w-full"
        />
      </div>
      <div class="vasp-admin-form-field">
        <label class="vasp-admin-form-label">DisplayName <span class="vasp-optional">(optional)</span></label>
        <InputText v-model="form.displayName" class="w-full" />
      </div>
      <div class="vasp-admin-form-field">
        <label class="vasp-admin-form-label">Bio <span class="vasp-optional">(optional)</span></label>
        <Textarea v-model="form.bio" :rows="4" class="w-full" auto-resize />
      </div>
      <div class="vasp-admin-form-field">
        <label class="vasp-admin-form-label">Avatar <span class="vasp-optional">(optional)</span></label>
        <InputText v-model="form.avatar" class="w-full" />
      </div>
      <div class="vasp-admin-form-field">
        <label class="vasp-admin-form-label">IsActive</label>
        <ToggleSwitch v-model="form.isActive" />
      </div>

      <div class="vasp-admin-form-field">
        <label class="vasp-admin-form-label">{{ record?.id ? 'New Password' : 'Password' }}</label>
        <Password v-model="form.password" :feedback="false" placeholder="Min. 8 characters" class="w-full" />
        <small class="vasp-field-hint">{{ record?.id ? 'Leave blank to keep current password' : 'Required, min. 8 characters' }}</small>
      </div>

    </div>
    <template #footer>
      <Button label="Cancel" severity="secondary" outlined @click="emit('close')" />
      <Button label="Save" :loading="loading" @click="handleSubmit" />
    </template>
  </Dialog>
</template>

<style scoped>
.vasp-admin-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0;
}

.vasp-admin-form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vasp-admin-form-label {
  font-weight: 500;
  font-size: 14px;
}

.vasp-optional {
  font-weight: 400;
  color: var(--p-surface-400, #adb5bd);
  font-size: 12px;
}

.vasp-field-hint {
  color: var(--p-surface-500, #868e96);
  font-size: 12px;
}

.vasp-monospace {
  font-family: monospace;
}
</style>
