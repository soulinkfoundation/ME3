<script setup lang="ts">
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    subject?: string;
    senderName?: string;
    fromAddress?: string;
    replyToAddress?: string;
    toLabel?: string;
    html?: string;
  }>(),
  {
    subject: "",
    senderName: "",
    fromAddress: "",
    replyToAddress: "",
    toLabel: "Subscribers",
    html: "",
  },
);

const previewWidth = ref<"desktop" | "mobile">("desktop");
const senderInitial = computed(() =>
  (props.senderName || props.fromAddress || "M").trim().charAt(0).toUpperCase(),
);
const fromLine = computed(() => {
  const address = props.fromAddress || "Sender unavailable";
  return props.senderName ? `${props.senderName} <${address}>` : address;
});
</script>

<template>
  <section class="campaign-email-preview" aria-label="Email preview">
    <div class="preview-size-toggle" role="group" aria-label="Email preview size">
      <button
        type="button"
        :class="{ active: previewWidth === 'desktop' }"
        :aria-pressed="previewWidth === 'desktop'"
        @click="previewWidth = 'desktop'"
      >
        Desktop
      </button>
      <button
        type="button"
        :class="{ active: previewWidth === 'mobile' }"
        :aria-pressed="previewWidth === 'mobile'"
        @click="previewWidth = 'mobile'"
      >
        Mobile
      </button>
    </div>

    <div class="email-frame-shell">
      <div class="email-frame" :class="`email-frame--${previewWidth}`">
        <header class="email-frame__header">
          <div class="email-frame__avatar" aria-hidden="true">{{ senderInitial }}</div>
          <dl class="email-frame__details">
            <div>
              <dt>Subject</dt>
              <dd>{{ subject || "No subject" }}</dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>{{ fromLine }}</dd>
            </div>
            <div>
              <dt>To</dt>
              <dd>{{ toLabel }}</dd>
            </div>
            <div>
              <dt>Reply-to</dt>
              <dd>{{ replyToAddress || "Not set" }}</dd>
            </div>
          </dl>
        </header>
        <iframe
          title="Rendered campaign email"
          sandbox=""
          :srcdoc="html"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.campaign-email-preview {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.preview-size-toggle {
  display: inline-flex;
  justify-self: center;
  padding: 3px;
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-surface-muted, var(--color-border));
}

.preview-size-toggle button {
  min-height: 36px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--ui-radius-sm, 7px);
  background: transparent;
  color: var(--ui-text-muted, var(--color-text-muted));
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.preview-size-toggle button.active {
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  box-shadow: var(--ui-shadow-sm, 0 1px 2px rgb(15 23 42 / 0.08));
}

.preview-size-toggle button:focus-visible {
  outline: 2px solid var(--ui-focus, var(--ui-accent));
  outline-offset: 1px;
}

.email-frame-shell {
  display: flex;
  justify-content: center;
  min-width: 0;
  overflow: hidden;
}

.email-frame {
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--ui-border-strong, var(--ui-border, var(--color-border)));
  border-radius: var(--ui-radius-lg, 14px);
  background: var(--ui-surface, var(--color-bg));
  box-shadow: var(--ui-shadow-sm, 0 1px 2px rgb(15 23 42 / 0.05));
  transition: width 0.2s ease;
}

.email-frame--mobile {
  width: min(100%, 390px);
}

.email-frame__header {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--ui-border, var(--color-border));
  background: var(--ui-surface, var(--color-bg));
}

.email-frame__avatar {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border-radius: 999px;
  background: var(--ui-surface-muted, var(--color-border));
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 14px;
  font-weight: 800;
}

.email-frame__details {
  display: grid;
  flex: 1;
  gap: 5px;
  min-width: 0;
  margin: 0;
}

.email-frame__details > div {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
}

.email-frame__details dt,
.email-frame__details dd {
  margin: 0;
  font-size: 12px;
  line-height: 1.35;
}

.email-frame__details dt {
  color: var(--ui-text-muted, var(--color-text-muted));
  text-align: right;
}

.email-frame__details dd {
  overflow-wrap: anywhere;
  color: var(--ui-text, var(--color-text));
  font-weight: 650;
}

.email-frame iframe {
  display: block;
  width: 100%;
  min-height: 570px;
  border: 0;
  background: #f4f5f4;
}

@media (max-width: 520px) {
  .email-frame__header {
    padding: 13px;
  }

  .email-frame__details > div {
    grid-template-columns: 52px minmax(0, 1fr);
  }

  .email-frame iframe {
    min-height: 500px;
  }
}
</style>
