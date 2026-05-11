<script setup lang="ts">
defineProps<{
  name: string;
  quote: string;
  handle?: string;
  avatar?: string;
  profileUrl?: string;
}>();
</script>

<template>
  <article class="testimonial-card">
    <p class="testimonial-card__quote">“{{ quote }}”</p>
    <footer class="testimonial-card__person">
      <img
        v-if="avatar"
        class="testimonial-card__avatar"
        :src="avatar"
        :alt="name"
        loading="lazy"
      />
      <span v-else class="testimonial-card__avatar" aria-hidden="true">
        {{ name.slice(0, 1).toUpperCase() }}
      </span>
      <span class="testimonial-card__meta">
        <a
          v-if="profileUrl"
          class="testimonial-card__name"
          :href="profileUrl"
          target="_blank"
          rel="noopener"
        >
          {{ name }}
        </a>
        <strong v-else class="testimonial-card__name">{{ name }}</strong>
        <span v-if="handle" class="testimonial-card__handle">@{{ handle }}</span>
      </span>
    </footer>
  </article>
</template>

<style scoped>
.testimonial-card {
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: 8px;
  background: var(--ui-surface, var(--color-bg));
  color: var(--ui-text, var(--color-text));
}

.testimonial-card__quote {
  margin: 0;
  color: var(--ui-text, var(--color-text));
  font-size: 0.98rem;
  line-height: 1.55;
}

.testimonial-card__person {
  display: flex;
  align-items: center;
  gap: 10px;
}

.testimonial-card__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: 999px;
  background: var(--ui-surface-muted, var(--color-bg-soft));
  color: var(--ui-text-muted, var(--color-text-muted));
  font-weight: 800;
  object-fit: cover;
}

.testimonial-card__meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.testimonial-card__name {
  color: var(--ui-text, var(--color-text));
  font-size: 0.92rem;
  line-height: 1.2;
  text-decoration: none;
}

.testimonial-card__handle {
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 0.82rem;
}
</style>
