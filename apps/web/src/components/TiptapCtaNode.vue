<script setup lang="ts">
import { computed, ref } from "vue";
import { NodeViewWrapper } from "@tiptap/vue-3";
import IconPicker from "./IconPicker.vue";
import UiIcon from "./UiIcon.vue";
import { isUiIconName } from "../utils/icons";
import { normalizeCtaUrl } from "../utils/cta-url";

type CtaStyle = "primary" | "secondary" | "outline";

const props = defineProps<{
  node: any;
  updateAttributes: (attrs: Record<string, any>) => void;
  deleteNode: () => void;
}>();

const urlError = ref("");
const text = computed(() => String(props.node?.attrs?.text || ""));
const url = computed(() => String(props.node?.attrs?.url || ""));
const icon = computed(() => String(props.node?.attrs?.icon || ""));
const style = computed<CtaStyle>(() => {
  const value = props.node?.attrs?.style;
  return value === "secondary" || value === "outline" ? value : "primary";
});

function updateText(event: Event) {
  props.updateAttributes({
    text: (event.target as HTMLInputElement).value.slice(0, 50),
  });
}

function updateUrl(event: Event) {
  urlError.value = "";
  props.updateAttributes({ url: (event.target as HTMLInputElement).value });
}

function normalizeUrl() {
  if (!url.value.trim()) {
    urlError.value = "Add a destination for this button.";
    return;
  }
  const normalized = normalizeCtaUrl(url.value);
  if (!normalized) {
    urlError.value =
      "Use an https:// URL, /page path, #section, mailto:, or tel: link.";
    return;
  }
  urlError.value = "";
  props.updateAttributes({ url: normalized });
}

function updateIcon(value: string) {
  props.updateAttributes({ icon: value });
}

function updateStyle(value: CtaStyle) {
  props.updateAttributes({ style: value });
}
</script>

<template>
  <NodeViewWrapper class="cta-node" contenteditable="false">
    <div class="cta-node-header">
      <div>
        <strong>Call-to-action button</strong>
        <span>Uses your published site button styles</span>
      </div>
      <button
        class="cta-node-remove"
        type="button"
        aria-label="Remove call-to-action button"
        title="Remove call-to-action button"
        @click="deleteNode"
      >
        <UiIcon name="Trash2" :size="15" aria-hidden="true" />
      </button>
    </div>

    <div class="cta-node-fields">
      <label>
        <span>Button text</span>
        <input
          :value="text"
          type="text"
          maxlength="50"
          placeholder="Book a session"
          @input="updateText"
        />
      </label>

      <label>
        <span>Destination</span>
        <input
          :value="url"
          type="text"
          inputmode="url"
          placeholder="/services or https://example.com"
          :aria-invalid="Boolean(urlError)"
          @input="updateUrl"
          @blur="normalizeUrl"
        />
      </label>
      <p v-if="urlError" class="cta-node-error" role="alert">{{ urlError }}</p>

      <div class="cta-node-options">
        <div class="cta-node-icon">
          <span>Icon <small>(optional)</small></span>
          <IconPicker
            :model-value="icon"
            aria-label="Choose button icon or emoji"
            @update:model-value="updateIcon"
          />
        </div>

        <div class="cta-node-styles" role="group" aria-label="Button style">
          <span>Style</span>
          <div>
            <button
              v-for="option in (['primary', 'secondary', 'outline'] as CtaStyle[])"
              :key="option"
              type="button"
              :class="{ active: style === option }"
              :aria-pressed="style === option"
              @click="updateStyle(option)"
            >
              {{ option }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="cta-node-preview">
      <span :class="['cta-preview-button', style]">
        <span v-if="icon" aria-hidden="true">
          <UiIcon
            v-if="isUiIconName(icon)"
            :name="icon"
            :size="15"
          />
          <span v-else>{{ icon }}</span>
        </span>
        {{ text || "Button text" }}
      </span>
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.cta-node {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 12px);
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.cta-node-header,
.cta-node-options,
.cta-node-styles > div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cta-node-header {
  justify-content: space-between;
}

.cta-node-header > div,
.cta-node-fields,
.cta-node-fields label,
.cta-node-icon,
.cta-node-styles {
  display: grid;
  gap: 6px;
}

.cta-node-header strong {
  font-size: 14px;
}

.cta-node-header span,
.cta-node-fields label > span,
.cta-node-icon > span,
.cta-node-styles > span {
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
}

.cta-node-remove {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: var(--ui-radius-sm, 8px);
  background: transparent;
  color: var(--ui-text-muted, var(--color-text-muted));
  cursor: pointer;
}

.cta-node-remove:hover,
.cta-node-remove:focus-visible {
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  color: var(--ui-text, var(--color-text));
}

.cta-node-fields input {
  width: 100%;
  min-height: 42px;
  box-sizing: border-box;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 8px);
  padding: 9px 11px;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font: inherit;
}

.cta-node-fields input:focus,
.cta-node-remove:focus-visible,
.cta-node-styles button:focus-visible {
  outline: 2px solid var(--ui-accent, var(--color-primary));
  outline-offset: 2px;
}

.cta-node-options {
  align-items: end;
  justify-content: space-between;
  flex-wrap: wrap;
}

.cta-node-icon small {
  font-weight: 400;
}

.cta-node-styles button {
  min-height: 34px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 8px);
  padding: 6px 9px;
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text-muted, var(--color-text-muted));
  font: inherit;
  font-size: 12px;
  text-transform: capitalize;
  cursor: pointer;
}

.cta-node-styles button.active {
  border-color: var(--ui-text, var(--color-text));
  color: var(--ui-text, var(--color-text));
  font-weight: 700;
}

.cta-node-error {
  margin: -2px 0 0;
  color: #b42318;
  font-size: 12px;
}

.cta-node-preview {
  padding-top: 4px;
  border-top: 1px solid var(--ui-border, var(--color-border));
}

.cta-preview-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 42px;
  padding: 0 16px;
  border: 2px solid transparent;
  border-radius: var(--ui-radius-md, 12px);
  font-size: 13px;
  font-weight: 700;
}

.cta-preview-button.primary {
  background: var(--ui-accent, var(--color-primary));
  color: var(--ui-accent-contrast, #fff);
}

.cta-preview-button.secondary {
  background: var(--ui-text, var(--color-text));
  color: var(--ui-bg, var(--color-bg));
}

.cta-preview-button.outline {
  border-color: var(--ui-text, var(--color-text));
  color: var(--ui-text, var(--color-text));
}

@media (max-width: 560px) {
  .cta-node-options,
  .cta-node-styles > div {
    align-items: stretch;
  }

  .cta-node-options {
    display: grid;
  }

  .cta-node-styles > div {
    flex-wrap: wrap;
  }
}
</style>
