<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { api } from "../../api";
import Button from "../../components/Button.vue";
import UiIcon from "../../components/UiIcon.vue";
import type {
  Me3CapabilityCategory,
  Me3CapabilityRuntimeState,
  Me3KnowledgeFact,
  Me3KnowledgePluginDerivedSummary,
  Me3ResolvedCapability,
} from "@me3/knowledge";
import type { UiIconName } from "../../utils/icons";

definePage({
  meta: {
    requiresAuth: true,
    title: "Assistant | ME3",
    description: "ME3 Core assistant workspace.",
    robots: "noindex,follow",
  },
});

type KnowledgeResponse = {
  schemaVersion: string;
  catalogVersion: string;
  facts: Me3KnowledgeFact[];
  capabilities: Me3ResolvedCapability[];
  plugins?: Me3KnowledgePluginDerivedSummary[];
};

const knowledge = ref<KnowledgeResponse | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const pluginChangedEvent = "me3:plugins-changed";

const categoryLabels: Record<Me3CapabilityCategory, string> = {
  assistant: "Assistant",
  identity: "Identity",
  workspace: "Workspace",
  calendar: "Calendar",
  mailbox: "Mailbox",
  contacts: "Contacts",
  content: "Content",
  sites: "Sites",
  providers: "Providers",
  safety: "Safety",
};

const categoryIcons: Record<Me3CapabilityCategory, UiIconName> = {
  assistant: "Bot",
  identity: "Fingerprint",
  workspace: "ClipboardList",
  calendar: "CalendarDays",
  mailbox: "Mail",
  contacts: "Users",
  content: "Megaphone",
  sites: "Globe2",
  providers: "Settings2",
  safety: "ShieldCheck",
};

const stateLabels: Record<Me3CapabilityRuntimeState, string> = {
  available: "Available",
  partial: "Partial",
  setup_required: "Setup required",
  disabled: "Disabled",
  coming_soon: "Coming soon",
  not_installed: "Not installed",
  unsupported: "Unsupported",
  unknown: "Unknown",
};

const stateIcons: Record<Me3CapabilityRuntimeState, UiIconName> = {
  available: "CheckCircle2",
  partial: "CircleDashed",
  setup_required: "AlertCircle",
  disabled: "CircleOff",
  coming_soon: "Clock3",
  not_installed: "PackageOpen",
  unsupported: "Ban",
  unknown: "CircleHelp",
};

const priorityStates: Me3CapabilityRuntimeState[] = [
  "available",
  "partial",
  "setup_required",
  "coming_soon",
  "disabled",
  "not_installed",
  "unsupported",
  "unknown",
];

const capabilities = computed(() => knowledge.value?.capabilities || []);
const facts = computed(() => knowledge.value?.facts || []);
const pluginCount = computed(() => knowledge.value?.plugins?.length || 0);
const availableCount = computed(
  () =>
    capabilities.value.filter(
      (capability) =>
        capability.runtimeState === "available" ||
        capability.runtimeState === "partial",
    ).length,
);
const setupCount = computed(
  () =>
    capabilities.value.filter(
      (capability) => capability.runtimeState === "setup_required",
    ).length,
);

const groupedCapabilities = computed(() => {
  const groups = new Map<Me3CapabilityCategory, Me3ResolvedCapability[]>();
  for (const capability of capabilities.value) {
    const group = groups.get(capability.category) || [];
    group.push(capability);
    groups.set(capability.category, group);
  }

  return Array.from(groups.entries()).map(([category, items]) => ({
    category,
    label: categoryLabels[category],
    icon: categoryIcons[category],
    items: items.sort(compareCapabilities),
  }));
});

function compareCapabilities(
  left: Me3ResolvedCapability,
  right: Me3ResolvedCapability,
): number {
  return (
    priorityStates.indexOf(left.runtimeState) -
      priorityStates.indexOf(right.runtimeState) ||
    left.title.localeCompare(right.title)
  );
}

function statusLabel(state: Me3CapabilityRuntimeState): string {
  return stateLabels[state] || "Unknown";
}

function statusIcon(state: Me3CapabilityRuntimeState): UiIconName {
  return stateIcons[state] || "CircleHelp";
}

async function loadKnowledge() {
  loading.value = true;
  error.value = null;
  try {
    knowledge.value = await api.get<KnowledgeResponse>("/knowledge");
  } catch (err) {
    error.value =
      err instanceof Error ? err.message : "Failed to load assistant knowledge";
  } finally {
    loading.value = false;
  }
}

function handlePluginChanged() {
  void loadKnowledge();
}

onMounted(() => {
  void loadKnowledge();
  window.addEventListener(pluginChangedEvent, handlePluginChanged);
});

onBeforeUnmount(() => {
  window.removeEventListener(pluginChangedEvent, handlePluginChanged);
});
</script>

<template>
  <main class="assistant-knowledge">
    <section class="assistant-knowledge__intro">
      <div class="assistant-knowledge__intro-copy">
        <div class="assistant-knowledge__icon" aria-hidden="true">
          <UiIcon name="Bot" :size="22" />
        </div>
        <div>
          <h1>Assistant</h1>
          <p>
            ME3 keeps one setup-aware capability map for chat, app help, and
            plugin surfaces. The chat agent gets a lean version; this page shows
            the fuller owner view.
          </p>
        </div>
      </div>

      <div class="assistant-knowledge__actions">
        <Button to="/account?section=plugins" variant="outline">
          <template #icon>
            <UiIcon name="Plug" :size="16" />
          </template>
          Plugins
        </Button>
        <Button to="/account" variant="outline">
          <template #icon>
            <UiIcon name="Settings2" :size="16" />
          </template>
          Settings
        </Button>
      </div>
    </section>

    <section v-if="loading" class="knowledge-state" aria-live="polite">
      Loading assistant knowledge...
    </section>

    <section v-else-if="error" class="knowledge-state knowledge-state--error">
      <p>{{ error }}</p>
      <Button variant="outline" @click="loadKnowledge">Try again</Button>
    </section>

    <template v-else-if="knowledge">
      <section class="knowledge-summary" aria-label="Assistant knowledge summary">
        <div class="knowledge-summary__item">
          <strong>{{ availableCount }}</strong>
          <span>ready or partial</span>
        </div>
        <div class="knowledge-summary__item">
          <strong>{{ setupCount }}</strong>
          <span>need setup</span>
        </div>
        <div class="knowledge-summary__item">
          <strong>{{ pluginCount }}</strong>
          <span>plugin sources</span>
        </div>
      </section>

      <section class="knowledge-facts" aria-label="ME3 boundaries">
        <article
          v-for="fact in facts"
          :key="fact.id"
          class="knowledge-fact"
        >
          <h2>{{ fact.title }}</h2>
          <p>{{ fact.summary }}</p>
        </article>
      </section>

      <section class="knowledge-capabilities" aria-label="ME3 capabilities">
        <article
          v-for="group in groupedCapabilities"
          :key="group.category"
          class="knowledge-group"
        >
          <header class="knowledge-group__header">
            <span class="knowledge-group__icon" aria-hidden="true">
              <UiIcon :name="group.icon" :size="18" />
            </span>
            <h2>{{ group.label }}</h2>
          </header>

          <div class="knowledge-capability-list">
            <article
              v-for="capability in group.items"
              :key="capability.id"
              class="knowledge-capability"
            >
              <div class="knowledge-capability__main">
                <div class="knowledge-capability__title-row">
                  <h3>{{ capability.title }}</h3>
                  <span
                    class="knowledge-status"
                    :class="`knowledge-status--${capability.runtimeState}`"
                  >
                    <UiIcon
                      :name="statusIcon(capability.runtimeState)"
                      :size="14"
                      aria-hidden="true"
                    />
                    {{ statusLabel(capability.runtimeState) }}
                  </span>
                </div>
                <p>{{ capability.summary }}</p>
                <small>{{ capability.runtimeNote }}</small>
              </div>
            </article>
          </div>
        </article>
      </section>
    </template>
  </main>
</template>

<style scoped>
.assistant-knowledge {
  min-height: 100vh;
  padding: 32px;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.assistant-knowledge__intro,
.knowledge-summary,
.knowledge-facts,
.knowledge-capabilities {
  width: min(1040px, 100%);
  margin: 0 auto;
}

.assistant-knowledge__intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--ui-border);
}

.assistant-knowledge__intro-copy {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  min-width: 0;
}

.assistant-knowledge__icon,
.knowledge-group__icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid var(--ui-border);
  background: var(--ui-surface-muted);
  color: var(--ui-accent);
}

.assistant-knowledge__icon {
  width: 44px;
  height: 44px;
  border-radius: var(--ui-radius-md);
}

.assistant-knowledge h1 {
  margin: 0 0 8px;
  font-size: 30px;
  line-height: 1.1;
  letter-spacing: 0;
}

.assistant-knowledge p {
  margin: 0;
  color: var(--ui-text-muted);
}

.assistant-knowledge__intro p {
  max-width: 680px;
  font-size: 15px;
  line-height: 1.6;
}

.assistant-knowledge__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.knowledge-state {
  width: min(1040px, 100%);
  margin: 24px auto 0;
  padding: 18px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
  color: var(--ui-text-muted);
}

.knowledge-state--error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-color: var(--ui-border-strong);
}

.knowledge-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin-top: 24px;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-border);
}

.knowledge-summary__item {
  display: grid;
  gap: 2px;
  padding: 16px;
  background: var(--ui-surface);
}

.knowledge-summary__item strong {
  font-size: 22px;
  line-height: 1;
}

.knowledge-summary__item span {
  color: var(--ui-text-muted);
  font-size: 13px;
}

.knowledge-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin-top: 24px;
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-border);
}

.knowledge-fact {
  min-width: 0;
  padding: 18px;
  background: var(--ui-surface);
}

.knowledge-fact h2,
.knowledge-group h2,
.knowledge-capability h3 {
  margin: 0;
  letter-spacing: 0;
}

.knowledge-fact h2 {
  margin-bottom: 8px;
  font-size: 16px;
}

.knowledge-fact p {
  font-size: 14px;
  line-height: 1.55;
}

.knowledge-capabilities {
  display: grid;
  gap: 18px;
  margin-top: 24px;
}

.knowledge-group {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  overflow: hidden;
}

.knowledge-group__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-surface-muted);
}

.knowledge-group__icon {
  width: 32px;
  height: 32px;
  border-radius: var(--ui-radius-sm);
}

.knowledge-group h2 {
  font-size: 16px;
}

.knowledge-capability-list {
  display: grid;
}

.knowledge-capability + .knowledge-capability {
  border-top: 1px solid var(--ui-border);
}

.knowledge-capability {
  padding: 16px 18px;
}

.knowledge-capability__main {
  display: grid;
  gap: 8px;
}

.knowledge-capability__title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.knowledge-capability h3 {
  min-width: 0;
  font-size: 15px;
  line-height: 1.3;
}

.knowledge-capability p {
  max-width: 780px;
  font-size: 14px;
  line-height: 1.55;
}

.knowledge-capability small {
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.knowledge-status {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  flex: 0 0 auto;
  gap: 5px;
  min-height: 24px;
  padding: 4px 8px;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.knowledge-status--available {
  border-color: color-mix(in oklab, var(--ui-accent), transparent 45%);
  background: var(--ui-accent-soft);
  color: var(--ui-accent-contrast);
}

.knowledge-status--partial,
.knowledge-status--setup_required {
  border-color: var(--ui-border-strong);
  background: var(--ui-surface-muted);
  color: var(--ui-text);
}

.knowledge-status--coming_soon {
  background: var(--ui-surface-muted);
}

@media (max-width: 760px) {
  .assistant-knowledge {
    padding: calc(var(--app-shell-mobile-nav-height, 68px) + 20px) 20px 20px;
  }

  .assistant-knowledge__intro {
    flex-direction: column;
  }

  .assistant-knowledge__actions {
    justify-content: flex-start;
  }

  .knowledge-summary,
  .knowledge-facts {
    grid-template-columns: 1fr;
  }

  .knowledge-capability__title-row {
    display: grid;
  }
}
</style>
