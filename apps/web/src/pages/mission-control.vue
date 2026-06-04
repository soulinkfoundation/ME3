<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import Button from "../components/Button.vue";
import UiIcon from "../components/UiIcon.vue";

definePage({
  meta: {
    requiresAuth: true,
    requiresWorkspace: true,
    requiresPlugin: "me3.mission-control",
    title: "Mission Control | ME3",
    description: "ME3 Core Mission Control dashboard.",
    robots: "noindex,follow",
  },
});

const missionStatementPlaceholder =
  "I AM HERE... to help [who/what] with [desired change] by being [my way of being] and doing [my work/service], guided by [my core values].";
</script>

<template>
  <main class="mission-dashboard">
    <header class="mission-dashboard__topbar">
      <div class="mission-dashboard__title">
        <h1>Mission Control</h1>
      </div>
      <Button
        color="ghost"
        shape="soft"
        size="compact"
        icon-only
        to="/mission-control/wheel-of-life"
        aria-label="Open Wheel of Life"
        title="Open Wheel of Life"
      >
        <UiIcon name="ShipWheel" :size="18" />
      </Button>
    </header>

    <section
      class="mission-dashboard__workspace"
      aria-label="Mission Control dashboard"
    >
      <div class="mission-dashboard__quick-actions" aria-label="Quick actions">
        <Button
          color="outline"
          shape="pill"
          size="large"
          to="/mission-control/projects"
        >
          <template #icon>
            <span class="me3-btn__emoji" aria-hidden="true">📋</span>
          </template>
          View Projects
        </Button>
        <Button color="outline" shape="pill" size="large" to="/assistant">
          <template #icon>
            <span class="me3-btn__emoji" aria-hidden="true">💬</span>
          </template>
          Chat with ME3
        </Button>
      </div>

      <div class="mission-dashboard__grid">
        <article class="dashboard-card">
          <header class="dashboard-card__header">
            <h2>Daily Briefing</h2>
          </header>
          <p>
            Your Daily Briefing card will appear here once the dashboard
            settings API and card registry land.
          </p>
          <Button color="outline" shape="soft" size="compact" to="/assistant">
            Configure Daily Briefing
          </Button>
        </article>

        <article class="dashboard-card">
          <header class="dashboard-card__header">
            <h2>Mission Statement</h2>
          </header>
          <p>{{ missionStatementPlaceholder }}</p>
        </article>

        <article class="dashboard-card">
          <header class="dashboard-card__header">
            <h2>Wheel of Life</h2>
          </header>
          <p>Your latest Wheel of Life snapshot will appear here.</p>
          <Button
            color="outline"
            shape="soft"
            size="compact"
            to="/mission-control/wheel-of-life"
          >
            Open Wheel
          </Button>
        </article>
      </div>
    </section>
  </main>
</template>

<style scoped>
.mission-dashboard {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  gap: 18px;
  box-sizing: border-box;
  padding: 0 24px 40px;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.mission-dashboard__topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: var(--workspace-topbar-height);
  padding: var(--workspace-topbar-padding-block) 0;
  background: color-mix(in oklab, var(--ui-bg), transparent 4%);
  backdrop-filter: blur(16px);
}

.mission-dashboard__title {
  justify-self: center;
  min-width: 0;
}

.mission-dashboard__title h1 {
  margin: 0;
  color: var(--ui-text);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
}

.mission-dashboard__workspace {
  display: grid;
  width: min(1040px, 100%);
  align-self: center;
  gap: 18px;
}

.mission-dashboard__quick-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  width: min(520px, 100%);
  justify-self: center;
}

.mission-dashboard__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.dashboard-card {
  display: grid;
  align-content: start;
  min-width: 0;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
}

.dashboard-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.dashboard-card h2,
.dashboard-card p {
  margin: 0;
}

.dashboard-card h2 {
  font-size: 14px;
  line-height: 1.25;
}

.dashboard-card p {
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.55;
}

@media (max-width: 959px) {
  .mission-dashboard {
    padding: 0 14px 32px;
  }

  .mission-dashboard__topbar {
    padding-left: var(--app-shell-mobile-nav-leading-padding);
  }

  .mission-dashboard__title {
    justify-self: stretch;
  }

  .mission-dashboard__grid {
    grid-template-columns: 1fr;
  }
}
</style>
