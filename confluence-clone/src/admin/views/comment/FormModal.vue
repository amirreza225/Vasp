<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import Password from 'primevue/password'
import { useToast } from 'primevue/usetoast'
import { CommentApi } from '../../api/comment.js'
import { PageApi } from '../../api/page.js'
import { UserApi } from '../../api/user.js'
import { CommentApi } from '../../api/comment.js'

const props = defineProps({
  visible: Boolean,
  record: Object,
})

const emit = defineEmits(['close', 'saved'])

const toast = useToast()

// JSON fields need string ↔ object conversion
const jsonFields = []
// Nullable DateTime fields — convert empty string to null before submitting
const nullableDateTimeFields = ['editedAt', ]
// Nullable String/Text fields — convert empty string to null before submitting
const nullableStringTextFields = []

// Options for relation selects (loaded on mount)
const pageOptions = ref([])
const authorOptions = ref([])
const parentOptions = ref([])
function emptyForm() {
  return {
    content: '',
    isEdited: false,
    editedAt: null,
    pageId: null,
    authorId: null,
    parentId: null,

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

onMounted(async () => {
  try {
    const res = await PageApi.list({ limit: 100, offset: 0 })
    // Label uses common display fields in priority order; falls back to the record's id.
    pageOptions.value = (res?.items ?? []).map((r) => ({
      label: String(r.name ?? r.title ?? r.username ?? r.email ?? r.id),
      value: r.id,
    }))
  } catch { /* ignore — options stay empty */ }
  try {
    const res = await UserApi.list({ limit: 100, offset: 0 })
    // Label uses common display fields in priority order; falls back to the record's id.
    authorOptions.value = (res?.items ?? []).map((r) => ({
      label: String(r.name ?? r.title ?? r.username ?? r.email ?? r.id),
      value: r.id,
    }))
  } catch { /* ignore — options stay empty */ }
  try {
    const res = await CommentApi.list({ limit: 100, offset: 0 })
    // Label uses common display fields in priority order; falls back to the record's id.
    parentOptions.value = (res?.items ?? []).map((r) => ({
      label: String(r.name ?? r.title ?? r.username ?? r.email ?? r.id),
      value: r.id,
    }))
  } catch { /* ignore — options stay empty */ }
})

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
      await CommentApi.update(props.record.id, payload)
    } else {
      await CommentApi.create(payload)
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
    :header="record?.id ? 'Edit Comment' : 'Create Comment'"
    :style="{ width: '560px' }"
    modal
    @update:visible="emit('close')"
  >
    <div class="vasp-admin-form">
      <div class="vasp-admin-form-field">
        <label class="vasp-admin-form-label">Content</label>
        <Textarea v-model="form.content" :rows="4" class="w-full" auto-resize />
      </div>
      <div class="vasp-admin-form-field">
        <label class="vasp-admin-form-label">IsEdited</label>
        <ToggleSwitch v-model="form.isEdited" />
      </div>
      <div class="vasp-admin-form-field">
        <label class="vasp-admin-form-label">EditedAt <span class="vasp-optional">(optional)</span></label>
        <InputText v-model="form.editedAt" placeholder="YYYY-MM-DD HH:MM:SS" class="w-full" />
      </div>
      <div class="vasp-admin-form-field">
        <label class="vasp-admin-form-label">Page</label>
        <Select
          v-model="form.pageId"
          :options="pageOptions"
          option-label="label"
          option-value="value"
          placeholder="Select Page"
          filter
          
          class="w-full"
        />
      </div>
      <div class="vasp-admin-form-field">
        <label class="vasp-admin-form-label">Author</label>
        <Select
          v-model="form.authorId"
          :options="authorOptions"
          option-label="label"
          option-value="value"
          placeholder="Select User"
          filter
          
          class="w-full"
        />
      </div>
      <div class="vasp-admin-form-field">
        <label class="vasp-admin-form-label">Parent <span class="vasp-optional">(optional)</span></label>
        <Select
          v-model="form.parentId"
          :options="parentOptions"
          option-label="label"
          option-value="value"
          placeholder="Select Comment"
          filter
          :show-clear="true"
          class="w-full"
        />
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
