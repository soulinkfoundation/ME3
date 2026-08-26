<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (event: "update:modelValue", value: string): void }>();

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      heading: { levels: [1, 2] },
      orderedList: false,
      strike: false,
    }),
    Underline,
    Link.configure({ openOnClick: false, autolink: true }),
    Placeholder.configure({ placeholder: "Write your campaign…" }),
  ],
  editorProps: {
    attributes: {
      class: "campaign-rich-text__content",
      "aria-label": "Campaign message",
    },
  },
  onUpdate: ({ editor: activeEditor }) => {
    emit("update:modelValue", activeEditor.getHTML());
  },
});

watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value || editor.value.getHTML() === value) return;
    editor.value.commands.setContent(value, { emitUpdate: false });
  },
);

function editLink() {
  if (!editor.value) return;
  const current = editor.value.getAttributes("link").href || "";
  const href = window.prompt("Link URL", current);
  if (href === null) return;
  if (!href.trim()) {
    editor.value.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  editor.value.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
}

onBeforeUnmount(() => editor.value?.destroy());
</script>

<template>
  <div class="campaign-rich-text">
    <div v-if="editor" class="campaign-rich-text__toolbar" role="toolbar" aria-label="Text formatting">
      <button type="button" :class="{ active: editor.isActive('paragraph') }" @click="editor.chain().focus().setParagraph().run()">Text</button>
      <button type="button" :class="{ active: editor.isActive('heading', { level: 1 }) }" aria-label="Heading 1" @click="editor.chain().focus().toggleHeading({ level: 1 }).run()">H1</button>
      <button type="button" :class="{ active: editor.isActive('heading', { level: 2 }) }" aria-label="Heading 2" @click="editor.chain().focus().toggleHeading({ level: 2 }).run()">H2</button>
      <span aria-hidden="true" />
      <button type="button" :class="{ active: editor.isActive('bold') }" aria-label="Bold" @click="editor.chain().focus().toggleBold().run()"><strong>B</strong></button>
      <button type="button" :class="{ active: editor.isActive('italic') }" aria-label="Italic" @click="editor.chain().focus().toggleItalic().run()"><em>I</em></button>
      <button type="button" :class="{ active: editor.isActive('underline') }" aria-label="Underline" @click="editor.chain().focus().toggleUnderline().run()"><u>U</u></button>
      <button type="button" :class="{ active: editor.isActive('bulletList') }" aria-label="Bullet list" @click="editor.chain().focus().toggleBulletList().run()">List</button>
      <button type="button" :class="{ active: editor.isActive('link') }" aria-label="Edit link" @click="editLink">Link</button>
    </div>
    <EditorContent v-if="editor" :editor="editor" />
  </div>
</template>

<style scoped>
.campaign-rich-text {
  overflow: hidden;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 12px);
  background: var(--ui-surface, var(--color-bg));
}

.campaign-rich-text:focus-within {
  border-color: var(--ui-primary, var(--ui-accent));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-primary, var(--ui-accent)) 15%, transparent);
}

.campaign-rich-text__toolbar {
  display: flex;
  overflow-x: auto;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--ui-border, var(--color-border));
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

.campaign-rich-text__toolbar span {
  width: 1px;
  margin: 2px 3px;
  background: var(--ui-border, var(--color-border));
}

.campaign-rich-text__toolbar button {
  min-width: 34px;
  min-height: 34px;
  padding: 5px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--ui-text, var(--color-text));
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}

.campaign-rich-text__toolbar button:hover,
.campaign-rich-text__toolbar button.active {
  background: var(--ui-surface, var(--color-bg));
}

.campaign-rich-text__toolbar button:focus-visible {
  outline: 2px solid var(--ui-primary, var(--ui-accent));
  outline-offset: 1px;
}

:deep(.campaign-rich-text__content) {
  min-height: 280px;
  padding: 24px;
  outline: none;
  color: var(--ui-text, var(--color-text));
  line-height: 1.65;
}

:deep(.campaign-rich-text__content > :first-child) { margin-top: 0; }
:deep(.campaign-rich-text__content > :last-child) { margin-bottom: 0; }
:deep(.campaign-rich-text__content p.is-editor-empty:first-child::before) {
  float: left;
  height: 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  content: attr(data-placeholder);
  pointer-events: none;
}
</style>
