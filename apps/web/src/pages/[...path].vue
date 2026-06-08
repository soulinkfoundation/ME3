<script setup lang="ts">
import { computed } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRoute } from "vue-router";
import Button from "../components/Button.vue";
import UiIcon from "../components/UiIcon.vue";

definePage({
  meta: {
    title: "Page not found | ME3",
    description: "This page does not exist.",
    robots: "noindex,nofollow",
    ogImage: "/icons/icon-512.png",
  },
});

const route = useRoute();

const pathLabel = computed(() => route.path);
</script>

<template>
  <div class="not-found">
    <main class="main">
      <div class="inner">
        <div class="copy">
          <p class="eyebrow">404</p>
          <h1 class="title">Page not found</h1>
          <p class="subtitle">
            <span class="path">{{ pathLabel }}</span> is not a page on ME3.
          </p>
          <div class="actions">
            <Button to="/" color="ghost" shape="soft" size="compact">
              <template #icon>
                <UiIcon name="ArrowLeft" :size="16" />
              </template>
              back to base
            </Button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.not-found {
  min-height: 100dvh;
  position: relative;
  display: flex;
  overflow-x: hidden;
  z-index: 0;
}

.main {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 40px 24px;
  width: 100%;
}

.inner {
  max-width: 520px;
  width: 100%;
}

.copy {
  text-align: center;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: uppercase;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.title {
  font-size: clamp(26px, 4.2dvw, 44px);
  font-weight: 700;
  margin: 0 0 12px;
  line-height: 1.12;
}

.subtitle {
  font-size: clamp(15px, 1.6dvw, 17px);
  color: var(--ui-text-muted, var(--color-text-muted));
  margin: 0 0 24px;
  line-height: 1.5;
  max-width: 40ch;
  margin-left: auto;
  margin-right: auto;
}

.path {
  font-family: var(--font-mono);
  font-size: 0.92em;
  word-break: break-all;
  color: var(--ui-text, var(--color-text));
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}
</style>
