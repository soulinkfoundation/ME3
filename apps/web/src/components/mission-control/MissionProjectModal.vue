<script setup lang="ts">
import Button from "../Button.vue";
import IconPicker from "../IconPicker.vue";
import UiIcon from "../UiIcon.vue";

defineProps<{
  open: boolean;
  mode: "add" | "edit";
  projectTitle: string;
  projectDescription: string;
  projectType: "standard" | "local";
  projectLocalPath: string;
  projectLogoData: string;
  projectLogoName: string;
  projectIconName: string;
  saving: boolean;
  error: string;
  createDisabled: boolean;
}>();

const emit = defineEmits<{
  "update:projectTitle": [value: string];
  "update:projectDescription": [value: string];
  "update:projectType": [value: "standard" | "local"];
  "update:projectLocalPath": [value: string];
  "update:projectIconName": [value: string];
  chooseLogo: [event: Event];
  removeLogo: [];
  close: [];
  submit: [];
}>();

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function projectTypeValue(event: Event): "standard" | "local" {
  return (event.target as HTMLSelectElement).value === "local"
    ? "local"
    : "standard";
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="mission-modal"
      role="presentation"
      @click.self="emit('close')"
    >
      <form
        class="mission-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-modal-title"
        @submit.prevent="emit('submit')"
      >
        <div class="mission-modal__header">
          <h2 id="project-modal-title">
            {{ mode === "edit" ? "Edit project" : "Add project" }}
          </h2>
          <Button
            color="ghost"
            shape="soft"
            size="compact"
            icon-only
            type="button"
            aria-label="Close"
            @click="emit('close')"
          >
            <UiIcon name="X" :size="18" />
          </Button>
        </div>

        <label class="field">
          <span>Title</span>
          <input
            :value="projectTitle"
            type="text"
            autocomplete="off"
            autofocus
            @input="emit('update:projectTitle', inputValue($event))"
          />
        </label>

        <label class="field">
          <span>Description</span>
          <textarea
            :value="projectDescription"
            rows="4"
            @input="emit('update:projectDescription', inputValue($event))"
          />
        </label>

        <label class="field">
          <span>Type</span>
          <select
            :value="projectType"
            @change="emit('update:projectType', projectTypeValue($event))"
          >
            <option value="standard">Standard</option>
            <option value="local">Local</option>
          </select>
        </label>

        <template v-if="projectType === 'local'">
          <label class="field">
            <span>Local folder path</span>
            <input
              :value="projectLocalPath"
              type="text"
              autocomplete="off"
              placeholder="e.g. /Users/yourusername/Projects/projectName"
              @input="emit('update:projectLocalPath', inputValue($event))"
            />
          </label>

          <p class="project-modal__hint">
            Provider setup lives on the local computer. Use the Local Executor
            plugin Configure button to create or edit
            <code>~/.me3/local-executor/config.json</code>.
          </p>
        </template>

        <label class="field">
          <span>Icon</span>
          <IconPicker
            :model-value="projectIconName"
            aria-label="Project icon"
            @update:model-value="emit('update:projectIconName', $event)"
          />
        </label>

        <label class="field">
          <span>Logo upload</span>
          <input type="file" accept="image/*" @change="emit('chooseLogo', $event)" />
        </label>

        <div v-if="projectLogoData" class="project-logo-preview">
          <img :src="projectLogoData" alt="" />
          <span>{{ projectLogoName }}</span>
          <Button
            color="outline"
            shape="soft"
            size="compact"
            type="button"
            @click="emit('removeLogo')"
          >
            Remove
          </Button>
        </div>

        <p v-if="error" class="mission-modal__error">
          {{ error }}
        </p>

        <div class="mission-modal__actions">
          <Button
            color="outline"
            shape="soft"
            size="compact"
            type="button"
            @click="emit('close')"
          >
            Cancel
          </Button>
          <Button
            color="primary"
            shape="soft"
            size="compact"
            type="submit"
            :disabled="createDisabled"
          >
            {{
              saving
                ? mode === "edit"
                  ? "Saving..."
                  : "Adding..."
                : mode === "edit"
                  ? "Save project"
                  : "Add project"
            }}
          </Button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.mission-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in oklab, #000, transparent 64%);
}

.mission-modal__dialog {
  display: grid;
  width: min(460px, 100%);
  max-height: min(720px, calc(100vh - 48px));
  gap: 14px;
  overflow: auto;
  padding: 18px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
  color: var(--ui-text);
  box-shadow: 0 24px 80px color-mix(in oklab, #000, transparent 78%);
}

.mission-modal__header,
.mission-modal__actions,
.project-logo-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mission-modal__header h2 {
  margin: 0;
  font-size: 16px;
}

.mission-modal__actions {
  justify-content: flex-end;
  padding-top: 4px;
}

.field {
  display: grid;
  gap: 6px;
  color: var(--ui-text);
  font-size: 13px;
  font-weight: 650;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-bg);
  color: var(--ui-text);
  font: inherit;
}

.field input,
.field select {
  min-height: 38px;
  padding: 0 10px;
}

.field input[type="file"] {
  display: grid;
  min-height: auto;
  padding: 8px;
  color: var(--ui-text-muted);
  font-weight: 500;
}

.field textarea {
  resize: vertical;
  padding: 10px;
  line-height: 1.5;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  outline: 2px solid color-mix(in oklab, var(--ui-accent), transparent 70%);
  outline-offset: 1px;
}

.project-modal__hint {
  margin: -6px 0 0;
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.project-modal__hint code {
  color: var(--ui-text);
  font-family:
    ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 0.95em;
}

.project-logo-preview {
  justify-content: flex-start;
  padding: 8px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
  font-size: 12px;
}

.project-logo-preview img {
  width: 36px;
  height: 36px;
  border-radius: var(--ui-radius-sm);
  object-fit: cover;
}

.project-logo-preview span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-modal__error {
  margin: 0;
  color: #b91c1c;
  font-size: 13px;
}

@media (max-width: 959px) {
  .mission-modal {
    padding: 14px;
  }
}
</style>
