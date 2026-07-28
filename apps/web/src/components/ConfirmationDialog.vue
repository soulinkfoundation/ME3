<script setup lang="ts">
import { useId } from "vue";
import AppDialog from "./AppDialog.vue";
import Button from "./Button.vue";
import UiIcon from "./UiIcon.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    busy?: boolean;
    danger?: boolean;
  }>(),
  {
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    busy: false,
    danger: false,
  },
);

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const instanceId = useId();
const titleId = `confirmation-dialog-title-${instanceId}`;
const descriptionId = `confirmation-dialog-description-${instanceId}`;

function cancel() {
  if (!props.busy) emit("cancel");
}
</script>

<template>
  <AppDialog
    :open="open"
    :labelled-by="titleId"
    :described-by="descriptionId"
    @close="cancel"
  >
    <section class="confirmation-dialog">
      <header>
        <h2 :id="titleId">{{ title }}</h2>
        <Button
          color="ghost"
          shape="soft"
          size="large"
          icon-only
          type="button"
          aria-label="Close confirmation"
          :disabled="busy"
          @click="cancel"
        >
          <UiIcon name="X" :size="18" aria-hidden="true" />
        </Button>
      </header>

      <p :id="descriptionId">{{ message }}</p>

      <footer>
        <Button
          color="outline"
          shape="soft"
          size="large"
          type="button"
          :disabled="busy"
          autofocus
          @click="cancel"
        >
          {{ cancelLabel }}
        </Button>
        <Button
          :color="danger ? 'danger' : 'primary'"
          shape="soft"
          size="large"
          type="button"
          :disabled="busy"
          @click="emit('confirm')"
        >
          {{ busy ? `${confirmLabel}…` : confirmLabel }}
        </Button>
      </footer>
    </section>
  </AppDialog>
</template>

<style scoped>
.confirmation-dialog {
  box-sizing: border-box;
  width: min(100%, 440px);
  padding: 20px;
  color: var(--ui-text, var(--color-text));
  background: var(--ui-surface, var(--color-bg));
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-lg, 12px);
  box-shadow: var(--ui-shadow-md, 0 18px 50px rgb(0 0 0 / 20%));
}

.confirmation-dialog header,
.confirmation-dialog footer {
  display: flex;
  align-items: center;
}

.confirmation-dialog header {
  justify-content: space-between;
  gap: 16px;
}

.confirmation-dialog h2 {
  margin: 0;
  font-size: 18px;
  line-height: 1.25;
}

.confirmation-dialog p {
  margin: 14px 0 20px;
  color: var(--ui-text-muted, var(--color-text-muted));
  line-height: 1.55;
}

.confirmation-dialog footer {
  justify-content: flex-end;
  gap: 10px;
}

.confirmation-dialog :deep(.me3-btn) {
  min-height: 44px;
}

@media (max-width: 640px) {
  .confirmation-dialog {
    width: 100%;
    padding: 20px 18px max(20px, env(safe-area-inset-bottom));
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: var(--ui-radius-lg, 12px) var(--ui-radius-lg, 12px) 0 0;
  }

  .confirmation-dialog footer {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .confirmation-dialog footer :deep(.me3-btn) {
    width: 100%;
  }
}
</style>
