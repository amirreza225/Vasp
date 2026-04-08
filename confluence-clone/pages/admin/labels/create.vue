<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Form } from '@primevue/forms'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import DatePicker from 'primevue/datepicker'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import FileUpload from 'primevue/fileupload'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'

const route = useRoute()
const router = useRouter()
const toast = useToast()

const isEdit = !!route.params.id
const loading = ref(false)

const initialValues = ref({
  name: null,
  color: null,
})


onMounted(async () => {
  if (isEdit) {
    loading.value = true
    try {
      const res = await fetch('/api/crud/label/' + route.params.id, { credentials: 'include' })
      const json = await res.json()
      const data = json?.ok === true ? json.data : json
      initialValues.value = data
    } finally {
      loading.value = false
    }
  }
})


async function onSubmit({ valid, values }) {
  if (!valid) return
  const payload = { ...values }
  const url = isEdit
    ? '/api/crud/label/' + route.params.id
    : '/api/crud/label'
  const method = isEdit ? 'PUT' : 'POST'
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json()
    toast.add({ severity: 'error', summary: 'Save failed', detail: err?.error?.message ?? 'Unknown error', life: 4000 })
    return
  }
  toast.add({ severity: 'success', summary: isEdit ? 'Updated!' : 'Created!', life: 3000 })
  router.push('/admin/labels-list')
}
</script>

<template>
  <div class="p-6">
    <div class="max-w-2xl mx-auto">
      <div class="flex items-center gap-4 mb-6">
        <Button icon="pi pi-arrow-left" severity="secondary" rounded outlined @click="router.back()" />
        <h1 class="text-2xl font-semibold m-0">Create Label</h1>
      </div>

      <div class="card p-6 border border-surface rounded-xl shadow-sm">
        <Form
          v-slot="$form"
          :initialValues="initialValues"
          @submit="onSubmit"
          class="flex flex-col gap-4"
        >
          <div class="flex flex-col gap-1">
            <label for="field-name" class="font-medium text-sm">
              Name <span class="text-red-500">*</span>
            </label>

            <InputText name="name" id="field-name" fluid />
            
            <Message v-if="$form.name?.invalid" severity="error" size="small" variant="simple">
              {{ $form.name.error?.message }}
            </Message>
          </div>
          <div class="flex flex-col gap-1">
            <label for="field-color" class="font-medium text-sm">
              Color
            </label>

            <InputText name="color" id="field-color" fluid />
            
            <Message v-if="$form.color?.invalid" severity="error" size="small" variant="simple">
              {{ $form.color.error?.message }}
            </Message>
          </div>

          <div class=" flex gap-3 justify-end pt-4 border-t border-surface">
            <Button
              label="Cancel"
              severity="secondary"
              outlined
              type="button"
              @click="router.back()"
            />
            <Button
              :label="isEdit ? 'Save Changes' : 'Create'"
              type="submit"
              icon="pi pi-check"
              :loading="loading"
            />
          </div>
        </Form>
      </div>
    </div>
  </div>
</template>
