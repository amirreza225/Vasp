<script setup lang="ts">
import { ref, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { FilterMatchMode } from '@primevue/core/api'
import { CommentApi } from '../../api/comment.js'
import FormModal from './FormModal.vue'

const confirm = useConfirm()
const toast = useToast()

const data = ref([])
const loading = ref(false)
const total = ref(0)
const page = ref(0)
const pageSize = ref(20)
const filters = ref({ global: { value: null, matchMode: FilterMatchMode.CONTAINS } })
const modalVisible = ref(false)
const editingRecord = ref(null)

async function fetchData() {
  loading.value = true
  try {
    const res = await CommentApi.list({
      limit: pageSize.value,
      offset: page.value * pageSize.value,
    })
    data.value = res?.items ?? []
    total.value = res?.total ?? 0
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: err instanceof Error ? err.message : 'Failed to load data', life: 4000 })
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingRecord.value = null
  modalVisible.value = true
}

function openEdit(record) {
  editingRecord.value = { ...record }
  modalVisible.value = true
}

function confirmDelete(id) {
  confirm.require({
    message: 'Are you sure you want to delete this record?',
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', outlined: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      try {
        await CommentApi.remove(id)
        toast.add({ severity: 'success', summary: 'Deleted', life: 3000 })
        await fetchData()
      } catch (err) {
        toast.add({ severity: 'error', summary: 'Error', detail: err instanceof Error ? err.message : 'Delete failed', life: 4000 })
      }
    },
  })
}

function onPage(event) {
  page.value = event.page
  pageSize.value = event.rows
  fetchData()
}

function onSaved() {
  modalVisible.value = false
  fetchData()
}

function exportJson() {
  const blob = new Blob([JSON.stringify(data.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'comment.json'
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(fetchData)
</script>

<template>
  <div>
    <DataTable
      :value="data"
      :loading="loading"
      :totalRecords="total"
      lazy
      paginator
      :rows="pageSize"
      :rowsPerPageOptions="[10, 20, 50, 100]"
      v-model:filters="filters"
      filterDisplay="menu"
      stripedRows
      tableStyle="min-width: 40rem"
      @page="onPage"
    >
      <template #header>
        <div class="vasp-admin-table-header">
          <h2 class="vasp-admin-page-title">Comment Management</h2>
          <div class="vasp-admin-table-actions">
            <IconField>
              <InputIcon class="pi pi-search" />
              <InputText v-model="filters['global'].value" placeholder="Search..." @input="fetchData" />
            </IconField>
            <Button icon="pi pi-download" label="Export" severity="secondary" outlined @click="exportJson" />
            <Button icon="pi pi-plus" label="Add Comment" @click="openCreate" />
          </div>
        </div>
      </template>

      <template #empty>No records found.</template>
      <template #loading>Loading data...</template>

      <Column field="id" header="Id" sortable style="min-width: 8rem">
      </Column>
      <Column field="content" header="Content" sortable style="min-width: 8rem">
      </Column>
      <Column field="isEdited" header="IsEdited" sortable style="min-width: 8rem">
        <template #body="{ data: row }">
          <i :class="row.isEdited ? 'pi pi-check text-green-500' : 'pi pi-times text-red-400'" />
        </template>
      </Column>
      <Column field="editedAt" header="EditedAt" sortable style="min-width: 8rem">
        <template #body="{ data: row }">
          <time v-if="row.editedAt" :datetime="row.editedAt">{{ new Date(row.editedAt).toLocaleString() }}</time>
          <span v-else>—</span>
        </template>
      </Column>
      <Column field="createdAt" header="CreatedAt" sortable style="min-width: 8rem">
        <template #body="{ data: row }">
          <time v-if="row.createdAt" :datetime="row.createdAt">{{ new Date(row.createdAt).toLocaleString() }}</time>
          <span v-else>—</span>
        </template>
      </Column>
      <Column field="updatedAt" header="UpdatedAt" sortable style="min-width: 8rem">
        <template #body="{ data: row }">
          <time v-if="row.updatedAt" :datetime="row.updatedAt">{{ new Date(row.updatedAt).toLocaleString() }}</time>
          <span v-else>—</span>
        </template>
      </Column>
      <Column field="pageId" header="Page ID" style="min-width: 8rem" />
      <Column field="authorId" header="User ID" style="min-width: 8rem" />
      <Column field="parentId" header="Comment ID" style="min-width: 8rem" />
      <Column header="Actions" style="min-width: 10rem">
        <template #body="{ data: row }">
          <div class="vasp-admin-row-actions">
            <Button icon="pi pi-pencil" size="small" rounded outlined @click="openEdit(row)" />
            <Button icon="pi pi-trash" size="small" rounded outlined severity="danger" @click="confirmDelete(row.id)" />
          </div>
        </template>
      </Column>
    </DataTable>

    <FormModal
      v-if="modalVisible"
      :visible="modalVisible"
      :record="editingRecord"
      @close="modalVisible = false"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.vasp-admin-table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 8px;
}

.vasp-admin-page-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
}

.vasp-admin-table-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vasp-admin-row-actions {
  display: flex;
  gap: 6px;
}
</style>
