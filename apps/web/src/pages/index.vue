<script setup lang="ts">
import { computed } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useAuthStore } from "../stores/auth";
import BrandLogo from "../components/BrandLogo.vue";
import ThemeToggle from "../components/ThemeToggle.vue";

definePage({
  meta: {
    title: "ME3 Core | Personal AI assistant",
    description:
      "ME3 Core is an installable personal AI assistant for your calendar, email, sites, and profile.",
    ogImage: "/me3protocol.jpg",
  },
});

const auth = useAuthStore();

const primaryCta = computed(() =>
  auth.isAuthenticated
    ? { label: "Open ME3", to: "/calendar" }
    : { label: "Start local setup", to: "/login" },
);
</script>

<template>
  <div class="landing">
    <header class="landing__header">
      <router-link to="/" class="landing__brand" aria-label="me3 home">
        <BrandLogo class="landing__logo" alt="me3" />
      </router-link>
      <nav class="landing__nav" aria-label="Primary">
        <router-link
          v-if="auth.isAuthenticated"
          to="/calendar"
          class="landing__nav-link"
        >
          Calendar
        </router-link>
        <router-link v-else to="/login" class="landing__nav-link">
          Sign in
        </router-link>
        <ThemeToggle />
      </nav>
    </header>

    <main class="landing__main">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero__copy">
          <p class="hero__badge">ME3 Core</p>
          <h1 id="hero-title" class="hero__title">
            Your private personal AI assistant, installed on your own Cloudflare
            account.
          </h1>
          <p class="hero__text">
            Start with the core workspace: calendar, email, sites, settings,
            assistant, and a public <code>me.json</code> profile.
          </p>
          <div class="hero__actions">
            <router-link :to="primaryCta.to" class="hero__button">
              {{ primaryCta.label }}
            </router-link>
            <a
              class="hero__button hero__button--secondary"
              href="https://github.com/Soulink-Foundation/me3"
              target="_blank"
              rel="noopener"
            >
              View repo
            </a>
          </div>
        </div>

        <div class="hero__visual" aria-hidden="true">
          <img
            class="hero__image"
            src="/me3protocol.jpg"
            alt=""
            width="1024"
            height="1024"
            loading="eager"
            decoding="async"
          />
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.landing {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.landing__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  width: min(1120px, calc(100% - 40px));
  margin: 0 auto;
  padding: 24px 0;
}

.landing__brand,
.landing__nav-link {
  color: inherit;
  text-decoration: none;
}

.landing__logo {
  display: block;
  width: 92px;
  height: auto;
}

.landing__nav {
  display: flex;
  align-items: center;
  gap: 16px;
}

.landing__nav-link {
  font-size: 0.94rem;
  font-weight: 700;
  color: var(--ui-text-muted, var(--color-text-muted));
}

.landing__main {
  flex: 1;
  display: flex;
  align-items: center;
  width: min(1120px, calc(100% - 40px));
  margin: 0 auto;
  padding: 28px 0 72px;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.02fr) minmax(300px, 0.78fr);
  align-items: center;
  gap: clamp(40px, 7vw, 88px);
  width: 100%;
}

.hero__copy {
  max-width: 720px;
}

.hero__badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  margin: 0 0 22px;
  padding: 0 12px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: 999px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0;
}

.hero__title {
  max-width: 820px;
  margin: 0;
  font-family: var(--font-display, var(--font-sans));
  font-size: clamp(3rem, 6.3vw, 6.4rem);
  line-height: 0.95;
  letter-spacing: 0;
}

.hero__text {
  max-width: 620px;
  margin: 28px 0 0;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: clamp(1.04rem, 1.6vw, 1.22rem);
  line-height: 1.65;
}

.hero__text code {
  color: var(--ui-text, var(--color-text));
  font-size: 0.95em;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 34px;
}

.hero__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 18px;
  border: 1px solid var(--ui-text, var(--color-text));
  border-radius: 8px;
  background: var(--ui-text, var(--color-text));
  color: var(--ui-bg, var(--color-bg));
  font-weight: 800;
  text-decoration: none;
}

.hero__button--secondary {
  background: transparent;
  color: var(--ui-text, var(--color-text));
}

.hero__visual {
  display: flex;
  justify-content: center;
}

.hero__image {
  display: block;
  width: min(100%, 420px);
  height: auto;
  border-radius: 8px;
  border: 1px solid var(--ui-border, var(--color-border));
}

@media (max-width: 820px) {
  .landing__header,
  .landing__main {
    width: min(100% - 28px, 1120px);
  }

  .landing__main {
    align-items: flex-start;
    padding-top: 38px;
  }

  .hero {
    grid-template-columns: 1fr;
  }

  .hero__title {
    font-size: clamp(2.7rem, 14vw, 4.8rem);
  }

  .hero__visual {
    justify-content: flex-start;
  }

  .hero__image {
    width: min(100%, 360px);
  }
}
</style>
