<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { FilterMatchMode } from '@primevue/core/api'

const router = useRouter()
const confirm = useConfirm()
const toast = useToast()

const rows = ref([])
const loading = ref(true)
const filters = ref({
  global: { value: null, matchMode: FilterMatchMode.CONTAINS }
})

async function load() {
  loading.value = true
  try {
    const res = await fetch('/api/crud/label', { credentials: 'include' })
    const json = await res.json()
    if (!res.ok) {
      toast.add({ severity: 'error', summary: 'Failed to load', detail: json?.error?.message ?? 'Unknown error', life: 4000 })
      return
    }
    // Vasp wraps successful responses in { ok: true, data: { items, total } }
    const payload = json?.ok === true ? json.data : json
    rows.value = payload?.items ?? (Array.isArray(payload) ? payload : [])
  } finally {
    loading.value = false
  }
}

onMounted(load)

function confirmDelete(id) {
  confirm.require({
    message: 'Are you sure you want to delete this record?',
    header: 'Confirm',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      await fetch('/api/crud/label/' + id, { method: 'DELETE', credentials: 'include' })
      toast.add({ severity: 'success', summary: 'Deleted', life: 3000 })
      await load()
    }
  })
}
</script>

<template>
  <div class="p-6">
    <DataTable
      :value="rows"
      :loading="loading"
      paginator
      :rows="50"
      :rowsPerPageOptions="[10, 20, 50, 100]"
      paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
      v-model:filters="filters"
      filterDisplay="menu"
      sortMode="multiple"
      removableSort
      stripedRows
      tableStyle="min-width: 50rem"
    >
      <template #header>
        <div class="flex justify-between items-center gap-4 flex-wrap">
          <h1 class="text-2xl font-semibold m-0">Labels</h1>
          <div class="flex gap-2 items-center">
            <IconField>
              <InputIcon class="pi pi-search" />
              <InputText v-model="filters['global'].value" placeholder="Search..." />
            </IconField>
            <Button
              label="New Label"
              icon="pi pi-plus"
              @click="router.push('/admin/labels/create')"
            />
          </div>
        </div>
      </template>

      <template #empty>No records found.</template>
      <template #loading>Loading data...</template>

      <Column
        field="id"
        header="Id"
        
        style="min-width: 10rem"
      >
      </Column>
      <Column
        field="name"
        header="Name"
        sortable
        style="min-width: 10rem"
      >
      </Column>
      <Column
        field="color"
        header="Color"
        
        style="min-width: 10rem"
      >
      </Column>

      <Column header="Actions" style="min-width: 12rem">
        <template #body="{ data }">
          <div class="flex gap-2">
            <Button
              icon="pi pi-pencil"
              rounded
              outlined
              size="small"
              @click="router.push('/admin/labels/:id/edit'.replace(':id', data.id))"
            />
            <Button
              icon="pi pi-trash"
              severity="danger"
              rounded
              outlined
              size="small"
              @click="confirmDelete(data.id)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>
