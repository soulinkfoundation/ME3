<script setup lang="ts">
import { ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import Button from "../components/Button.vue";
import ContactsPanel from "../components/ContactsPanel.vue";
import UiIcon from "../components/UiIcon.vue";

definePage({
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    title: "Contacts | ME3",
    description: "Review and manage your ME3 contacts.",
    robots: "noindex,follow",
  },
});

const contactsPanel = ref<InstanceType<typeof ContactsPanel> | null>(null);
const contactSearchQuery = ref("");

function openContactModal() {
  contactsPanel.value?.openContactModal();
}
</script>

<template>
  <main class="agent-page contacts-page">
    <Teleport to="#app-side-nav-mobile-page-controls">
      <form class="contacts-mobile-nav" role="search" @submit.prevent>
        <label class="contacts-mobile-nav__label" for="contacts-search-input-top">
          Search contacts
        </label>
        <input
          id="contacts-search-input-top"
          v-model="contactSearchQuery"
          class="contacts-mobile-nav__input"
          type="search"
          placeholder="Search contacts"
        />
        <Button
          color="ghost"
          shape="soft"
          size="compact"
          icon-only
          class="contacts-mobile-nav__icon-btn"
          type="submit"
          aria-label="Search contacts"
          title="Search"
        >
          <UiIcon name="Search" :size="18" aria-hidden="true" />
        </Button>
        <Button
          color="outline"
          shape="soft"
          size="compact"
          class="contacts-mobile-nav__add-btn"
          type="button"
          aria-label="Add contact"
          @click="openContactModal"
        >
          <template #icon>
            <UiIcon name="Plus" :size="16" aria-hidden="true" />
          </template>
          Add contact
        </Button>
      </form>
    </Teleport>

    <ContactsPanel
      ref="contactsPanel"
      v-model:search-query="contactSearchQuery"
      :show-header="false"
    />
  </main>
</template>

<style scoped>
.contacts-page {
  min-height: 100%;
  background: var(--ui-bg, var(--color-bg));
}

.contacts-mobile-nav {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px auto;
  gap: 10px;
  width: 100%;
  align-items: center;
}

.contacts-mobile-nav__label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.contacts-mobile-nav__input {
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-sm, 6px);
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font: inherit;
  font-size: 14px;
}

.contacts-mobile-nav__input:focus {
  outline: 2px solid var(--ui-text, var(--color-text));
  outline-offset: 1px;
}

.contacts-mobile-nav__icon-btn {
  width: 36px;
  height: 36px;
  padding: 0;
}

.contacts-mobile-nav__add-btn {
  gap: 6px;
  min-height: 36px;
  padding-inline: 10px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  background: var(--ui-surface, var(--color-bg));
  border-color: var(--ui-border, var(--color-border));
  color: var(--ui-text, var(--color-text));
}

.contacts-mobile-nav__add-btn:hover:not(:disabled),
.contacts-mobile-nav__add-btn:focus-visible {
  background: var(--ui-surface-muted, var(--color-bg-subtle));
  border-color: var(--ui-border, var(--color-border));
  color: var(--ui-text, var(--color-text));
}
</style>
