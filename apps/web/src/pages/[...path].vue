<script setup lang="ts">
import { computed } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRoute } from "vue-router";
import LandingGrids from "../components/LandingGrids.vue";
import BrandLogo from "../components/BrandLogo.vue";
import ThemeToggle from "../components/ThemeToggle.vue";
import { useAuthStore } from "../stores/auth";

definePage({
  meta: {
    title: "Page not found | ME3",
    description: "This page does not exist.",
    robots: "noindex,nofollow",
    ogImage: "/me3protocol.jpg",
  },
});

const route = useRoute();
const auth = useAuthStore();

const pathLabel = computed(() => route.path);
</script>

<template>
  <div class="not-found">
    <LandingGrids />
    <header class="header">
      <router-link to="/" class="logo" aria-label="me3 home">
        <BrandLogo class="logo-img" alt="me3" />
      </router-link>
      <nav class="nav">
        <router-link
          v-if="auth.isAuthenticated"
          to="/calendar"
          class="nav-link"
        >
          Home
        </router-link>
        <router-link v-else to="/login" class="nav-link"> Sign in </router-link>
        <ThemeToggle />
      </nav>
    </header>

    <main class="main">
      <div class="inner">
        <div class="copy">
          <p class="eyebrow">404</p>
          <h1 class="title">Page not found</h1>
          <p class="subtitle">
            <span class="path">{{ pathLabel }}</span> is not a page on ME3.
          </p>
          <div class="actions">
            <router-link to="/" class="cta"> Home </router-link>
            <router-link
              v-if="auth.isAuthenticated"
              to="/calendar"
              class="cta secondary"
            >
              Calendar
            </router-link>
            <router-link v-else to="/login" class="cta secondary">
              Sign in
            </router-link>
          </div>
        </div>
        <div class="visual-wrap">
          <div class="visual" aria-hidden="true">
            <img
              class="hero-image"
              src="/me3protocol.jpg"
              alt=""
              width="1024"
              height="1024"
              loading="lazy"
              decoding="async"
            />
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
  flex-direction: column;
  overflow-x: hidden;
  z-index: 0;
}

.header {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.logo {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  color: inherit;
}

.logo-img {
  display: block;
  height: 28px;
  width: auto;
}

.nav {
  display: flex;
  align-items: center;
  gap: 14px;
}

.nav-link {
  color: var(--color-text);
  text-decoration: none;
  font-weight: 500;
}

.nav-link:hover {
  text-decoration: underline;
}

.main {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 0 48px;
  width: 100%;
}

.inner {
  display: grid;
  gap: clamp(28px, 5dvh, 48px);
  align-items: center;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
  padding: 0 24px;
}

@media (min-width: 1024px) {
  .inner {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(20px, 3dvw, 40px);
    padding: 0 40px;
  }
}

.copy {
  text-align: center;
}

@media (min-width: 1024px) {
  .copy {
    text-align: left;
  }
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.title {
  font-size: clamp(26px, 4.2dvw, 44px);
  font-weight: 700;
  margin: 0 0 12px;
  line-height: 1.12;
}

.subtitle {
  font-size: clamp(15px, 1.6dvw, 17px);
  color: var(--color-text-muted);
  margin: 0 0 24px;
  line-height: 1.5;
  max-width: 40ch;
  margin-left: auto;
  margin-right: auto;
}

@media (min-width: 1024px) {
  .subtitle {
    margin-left: 0;
    margin-right: auto;
  }
}

.path {
  font-family: var(--font-mono);
  font-size: 0.92em;
  word-break: break-all;
  color: var(--color-text);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

@media (min-width: 1024px) {
  .actions {
    justify-content: flex-start;
  }
}

.cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 22px;
  transition:
    transform 0.2s,
    box-shadow 0.2s,
    border-color 0.2s;
}

.cta:not(.secondary) {
  background: var(--color-accent);
  color: var(--color-bg);
  border: 1px solid transparent;
}

.cta:not(.secondary):hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.cta.secondary {
  border: 1px solid var(--color-border);
  color: var(--color-text);
  background: transparent;
}

.cta.secondary:hover {
  transform: translateY(-2px);
  border-color: var(--color-text-muted);
}

.visual-wrap {
  display: flex;
  justify-content: center;
}

@media (min-width: 1024px) {
  .visual-wrap {
    justify-content: flex-end;
  }
}

.visual {
  width: min(100%, 520px);
  aspect-ratio: 1;
  border-radius: 9999px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.12);
}

.hero-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}
</style>
