<script setup>
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: {
    type: [Object, String],
    default: null,
  },
  placeholder: {
    type: String,
    default: 'Start writing…',
  },
  readonly: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue'])

const editor = useEditor({
  content: props.modelValue ?? '',
  editable: !props.readonly,
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: props.placeholder }),
  ],
  onUpdate({ editor }) {
    emit('update:modelValue', editor.getJSON())
  },
})

watch(() => props.modelValue, (val) => {
  if (!editor.value) return
  const current = editor.value.getJSON()
  if (JSON.stringify(current) !== JSON.stringify(val)) {
    editor.value.commands.setContent(val ?? '')
  }
})

watch(() => props.readonly, (val) => {
  editor.value?.setEditable(!val)
})

onBeforeUnmount(() => editor.value?.destroy())
</script>

<template>
  <div class="vasp-rich-editor" :class="{ 'vasp-rich-editor--readonly': readonly }">
    <!-- Toolbar (hidden in readonly mode) -->
    <div v-if="!readonly && editor" class="vasp-rich-editor__toolbar border border-surface border-b-0 rounded-t-lg p-1 flex flex-wrap gap-1 bg-surface-50 dark:bg-surface-800">
      <button type="button" class="vasp-rich-editor__btn" :class="{ 'is-active': editor.isActive('bold') }" @click="editor.chain().focus().toggleBold().run()" title="Bold"><i class="pi pi-bold" /></button>
      <button type="button" class="vasp-rich-editor__btn" :class="{ 'is-active': editor.isActive('italic') }" @click="editor.chain().focus().toggleItalic().run()" title="Italic"><i class="pi pi-italic" /></button>
      <button type="button" class="vasp-rich-editor__btn" :class="{ 'is-active': editor.isActive('strike') }" @click="editor.chain().focus().toggleStrike().run()" title="Strike"><i class="pi pi-minus" /></button>
      <div class="vasp-rich-editor__divider" />
      <button type="button" class="vasp-rich-editor__btn" :class="{ 'is-active': editor.isActive('heading', { level: 1 }) }" @click="editor.chain().focus().toggleHeading({ level: 1 }).run()">H1</button>
      <button type="button" class="vasp-rich-editor__btn" :class="{ 'is-active': editor.isActive('heading', { level: 2 }) }" @click="editor.chain().focus().toggleHeading({ level: 2 }).run()">H2</button>
      <button type="button" class="vasp-rich-editor__btn" :class="{ 'is-active': editor.isActive('heading', { level: 3 }) }" @click="editor.chain().focus().toggleHeading({ level: 3 }).run()">H3</button>
      <div class="vasp-rich-editor__divider" />
      <button type="button" class="vasp-rich-editor__btn" :class="{ 'is-active': editor.isActive('bulletList') }" @click="editor.chain().focus().toggleBulletList().run()" title="Bullet list"><i class="pi pi-list" /></button>
      <button type="button" class="vasp-rich-editor__btn" :class="{ 'is-active': editor.isActive('orderedList') }" @click="editor.chain().focus().toggleOrderedList().run()" title="Ordered list"><i class="pi pi-sort-numeric-up" /></button>
      <button type="button" class="vasp-rich-editor__btn" :class="{ 'is-active': editor.isActive('blockquote') }" @click="editor.chain().focus().toggleBlockquote().run()" title="Blockquote"><i class="pi pi-comment" /></button>
      <button type="button" class="vasp-rich-editor__btn" :class="{ 'is-active': editor.isActive('codeBlock') }" @click="editor.chain().focus().toggleCodeBlock().run()" title="Code block"><i class="pi pi-code" /></button>
      <div class="vasp-rich-editor__divider" />
      <button type="button" class="vasp-rich-editor__btn" @click="editor.chain().focus().undo().run()" :disabled="!editor.can().undo()" title="Undo"><i class="pi pi-undo" /></button>
      <button type="button" class="vasp-rich-editor__btn" @click="editor.chain().focus().redo().run()" :disabled="!editor.can().redo()" title="Redo"><i class="pi pi-refresh" /></button>
    </div>
    <EditorContent :editor="editor" class="vasp-rich-editor__content" :class="readonly ? 'rounded-lg' : 'rounded-b-lg'" />
  </div>
</template>

<style scoped>
.vasp-rich-editor { width: 100%; }
.vasp-rich-editor__toolbar { user-select: none; }
.vasp-rich-editor__btn {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 2rem; height: 2rem; padding: 0 0.375rem;
  border: none; border-radius: 0.375rem; background: transparent;
  color: var(--p-text-color); font-size: 0.8125rem; font-weight: 600;
  cursor: pointer; transition: background 0.15s;
}
.vasp-rich-editor__btn:hover:not(:disabled) { background: var(--p-surface-100); }
.vasp-rich-editor__btn.is-active { background: var(--p-primary-color); color: var(--p-primary-contrast-color); }
.vasp-rich-editor__btn:disabled { opacity: 0.4; cursor: not-allowed; }
.vasp-rich-editor__divider { width: 1px; height: 1.5rem; background: var(--p-surface-200); margin: 0.25rem; }
.vasp-rich-editor__content :deep(.ProseMirror) {
  min-height: 12rem; padding: 0.75rem 1rem;
  border: 1px solid var(--p-surface-200); border-radius: inherit;
  outline: none; font-size: 0.9375rem; line-height: 1.7;
}
.vasp-rich-editor--readonly .vasp-rich-editor__content :deep(.ProseMirror) { border-color: transparent; padding: 0; }
.vasp-rich-editor__content :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder); color: var(--p-text-muted-color);
  pointer-events: none; float: left; height: 0;
}
.vasp-rich-editor__content :deep(.ProseMirror h1) { font-size: 1.875rem; font-weight: 700; margin: 1rem 0 0.5rem; }
.vasp-rich-editor__content :deep(.ProseMirror h2) { font-size: 1.5rem; font-weight: 600; margin: 0.875rem 0 0.5rem; }
.vasp-rich-editor__content :deep(.ProseMirror h3) { font-size: 1.25rem; font-weight: 600; margin: 0.75rem 0 0.5rem; }
.vasp-rich-editor__content :deep(.ProseMirror ul) { list-style: disc; padding-left: 1.5rem; }
.vasp-rich-editor__content :deep(.ProseMirror ol) { list-style: decimal; padding-left: 1.5rem; }
.vasp-rich-editor__content :deep(.ProseMirror blockquote) { border-left: 3px solid var(--p-primary-color); padding-left: 1rem; color: var(--p-text-muted-color); margin: 0.5rem 0; }
.vasp-rich-editor__content :deep(.ProseMirror pre) { background: var(--p-surface-100); border-radius: 0.5rem; padding: 0.75rem 1rem; font-family: monospace; font-size: 0.875rem; }
.vasp-rich-editor__content :deep(.ProseMirror code) { background: var(--p-surface-100); border-radius: 0.25rem; padding: 0.125rem 0.375rem; font-family: monospace; font-size: 0.875rem; }
</style>
