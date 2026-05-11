<script setup lang="ts">
import { computed } from "vue";
import { useWizardStore } from "../../stores/wizard";
import UiIcon from "../UiIcon.vue";

const wizard = useWizardStore();

// Feature toggles
const newsletterEnabled = computed({
  get: () => wizard.newsletterEnabled,
  set: (val: boolean) => {
    wizard.newsletterEnabled = val;
  },
});

const blogEnabled = computed({
  get: () => wizard.blogEnabled,
  set: (val: boolean) => {
    if (!val && wizard.posts.length > 0) {
      const confirmDisable = confirm(
        "Disable blog? This will hide the blog step and remove blog posts from publish.",
      );
      if (!confirmDisable) return;
    }
    wizard.blogEnabled = val;
  },
});

const blogTitle = computed({
  get: () => wizard.blogTitle,
  set: (val: string) => {
    wizard.blogTitle = val;
  },
});

const bookingsEnabled = computed({
  get: () => wizard.bookingsEnabled,
  set: (val: boolean) => {
    wizard.bookingsEnabled = val;
  },
});

const shopEnabled = computed({
  get: () => wizard.shopEnabled,
  set: (val: boolean) => {
    wizard.shopEnabled = val;
  },
});

const shopTitle = computed({
  get: () => wizard.shopTitle,
  set: (val: string) => {
    wizard.shopTitle = val;
  },
});

const testimonialsEnabled = computed({
  get: () => wizard.testimonialsEnabled,
  set: (val: boolean) => {
    if (!val && wizard.testimonials.length > 0) {
      const confirmDisable = confirm(
        "Disable testimonials? This will hide the testimonials step and remove testimonials from publish.",
      );
      if (!confirmDisable) return;
    }
    wizard.testimonialsEnabled = val;
  },
});

</script>

<template>
  <div class="step-additional-features">
    <h2>Enable additional features</h2>
    <p class="section-desc">
      Choose which extras you want to enable. Offerings is always part of the
      wizard; this toggle controls product/resource pages.
    </p>

    <div class="feature-cards">
      <!-- Newsletter -->
      <div class="feature-card">
        <div class="feature-card-main">
          <span class="feature-icon" aria-hidden="true">
            <UiIcon name="Mail" :size="18" />
          </span>
          <div class="feature-text">
            <span class="feature-name">
              Newsletter
            </span>
            <span class="feature-desc">
              Collect subscribers so people can stay in touch and hear about new
              updates.
            </span>
          </div>
        </div>
        <label class="feature-toggle">
          <input type="checkbox" v-model="newsletterEnabled" />
          <span class="feature-toggle-ui" />
        </label>
      </div>

      <!-- Bookings -->
      <div class="feature-card">
        <div class="feature-card-main">
          <span class="feature-icon" aria-hidden="true">
            <UiIcon name="Calendar" :size="18" />
          </span>
          <div class="feature-text">
            <span class="feature-name">
              Bookings
            </span>
            <span class="feature-desc">
              Let people book time with you and keep availability in sync with
              your calendar.
            </span>
          </div>
        </div>
        <label class="feature-toggle">
          <input type="checkbox" v-model="bookingsEnabled" />
          <span class="feature-toggle-ui" />
        </label>
      </div>

      <!-- Blog -->
      <div class="feature-card">
        <div class="feature-card-main">
          <span class="feature-icon" aria-hidden="true">
            <UiIcon name="Pencil" :size="18" />
          </span>
          <div class="feature-text">
            <span class="feature-name">Blog</span>
            <span class="feature-desc">
              Publish articles, notes, videos, or updates. Your main menu title
              also becomes the page URL.
            </span>
            <div v-if="blogEnabled" class="feature-field">
              <label class="feature-field-label" for="blog-menu-title">
                Main menu title
              </label>
              <input
                id="blog-menu-title"
                v-model="blogTitle"
                type="text"
                class="feature-field-input"
                placeholder="Blog"
                maxlength="40"
              />
              <p class="feature-field-hint">URL path: /{{ wizard.blogPath }}</p>
            </div>
          </div>
        </div>
        <label class="feature-toggle">
          <input type="checkbox" v-model="blogEnabled" />
          <span class="feature-toggle-ui" />
        </label>
      </div>

      <!-- Offerings -->
      <div class="feature-card">
        <div class="feature-card-main">
          <span class="feature-icon" aria-hidden="true">
            <UiIcon name="ShoppingCart" :size="18" />
          </span>
          <div class="feature-text">
            <span class="feature-name">
              Products
            </span>
            <span class="feature-desc">
              Add products or resources to your site. Payment collection belongs
              in a later plugin layer.
            </span>
            <div v-if="shopEnabled" class="feature-field">
              <label class="feature-field-label" for="shop-menu-title">
                Main menu title
              </label>
              <input
                id="shop-menu-title"
                v-model="shopTitle"
                type="text"
                class="feature-field-input"
                placeholder="Offerings"
                maxlength="40"
              />
              <p class="feature-field-hint">URL path: /{{ wizard.shopPath }}</p>
            </div>
          </div>
        </div>
        <label class="feature-toggle">
          <input type="checkbox" v-model="shopEnabled" />
          <span class="feature-toggle-ui" />
        </label>
      </div>

      <!-- Testimonials -->
      <div class="feature-card">
        <div class="feature-card-main">
          <span class="feature-icon" aria-hidden="true">
            <UiIcon name="Star" :size="18" />
          </span>
          <div class="feature-text">
            <span class="feature-name">Testimonials</span>
            <span class="feature-desc">
              Add quotes from clients or collaborators to build trust where it
              matters most.
            </span>
          </div>
        </div>
        <label class="feature-toggle">
          <input type="checkbox" v-model="testimonialsEnabled" />
          <span class="feature-toggle-ui" />
        </label>
      </div>
    </div>

  </div>
</template>

<style scoped>
.step-additional-features h2 {
  font-size: 28px;
  margin-bottom: 8px;
}

.section-desc {
  color: var(--color-text-muted);
  font-size: 14px;
  margin-bottom: 24px;
}

.feature-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.feature-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 2px solid var(--color-border);
  background: var(--color-bg);
  transition: border-color 0.2s;
}

.feature-card:hover {
  border-color: var(--color-text-muted);
}

.feature-card-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
}

.feature-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-border);
  color: var(--color-text);
  flex-shrink: 0;
}

.feature-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.feature-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  max-width: 240px;
}

.feature-field-label {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.feature-field-input {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font: inherit;
  padding: 10px 12px;
}

.feature-field-input:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.feature-name {
  font-weight: 600;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.feature-pill {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 700;
}

.feature-desc {
  font-size: 13px;
  color: var(--color-text-muted);
}

.feature-status {
  font-size: 12px;
  color: var(--color-text);
  font-weight: 500;
}

.feature-hint {
  font-size: 12px;
  color: var(--color-text-muted);
}

.feature-field-hint {
  font-size: 12px;
  color: var(--color-text-muted);
}

.feature-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.feature-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.feature-toggle-ui {
  width: 44px;
  height: 24px;
  background: var(--color-border);
  border-radius: 999px;
  position: relative;
  transition: background 0.2s ease;
}

.feature-toggle-ui.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.feature-toggle-ui::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--color-bg);
  transition: transform 0.2s ease;
}

.feature-toggle input:checked + .feature-toggle-ui {
  background: var(--color-text);
}

.feature-toggle input:checked + .feature-toggle-ui::after {
  transform: translateX(20px);
}

.upgrade-prompt {
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.upgrade-prompt p {
  flex: 1;
  margin: 0;
  font-size: 14px;
  color: var(--color-text);
}

.upgrade-btn {
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  padding: 10px 18px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.upgrade-btn:hover {
  opacity: 0.9;
}

.stripe-connect-card {
  padding: 16px;
  border-radius: 12px;
  border: 2px solid var(--color-border);
  background: var(--color-bg);
}

.connect-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 8px;
}

.status-icon {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #22c55e;
  color: white;
  font-size: 12px;
}

.stripe-restricted .status-icon {
  background: #f59e0b;
}

.connect-hint {
  margin: 0 0 12px;
  color: var(--color-text-muted);
  font-size: 13px;
}

.connect-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px 20px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}

.connect-btn:hover:not(:disabled) {
  border-color: var(--color-text);
}

.connect-btn.stripe {
  background: #635bff;
  color: white;
  border: none;
}

.connect-btn.stripe:hover:not(:disabled) {
  background: #4f49cc;
}

.connect-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.stripe-icon {
  display: inline-flex;
}

/* Match app theme: OS dark only applies when :root has no data-theme override */
:global(:root[data-theme="dark"]) .upgrade-prompt {
  background: linear-gradient(135deg, #1a1625 0%, #2d1f47 100%);
}

@media (prefers-color-scheme: dark) {
  :global(:root:not([data-theme])) .upgrade-prompt {
    background: linear-gradient(135deg, #1a1625 0%, #2d1f47 100%);
  }
}
</style>
