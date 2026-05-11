<script setup lang="ts">
import { ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useAuthStore } from "../stores/auth";
import SiteFooter from "../components/SiteFooter.vue";
import BrandLogo from "../components/BrandLogo.vue";
import ThemeToggle from "../components/ThemeToggle.vue";

definePage({
  meta: {
    title: "Support | ME3",
    description: "Get help connecting your custom domain and using me3.",
  },
});

const auth = useAuthStore();
const openFaqIndex = ref<number | null>(0);

const faqItems = [
  {
    question: "Do I need to add both CNAME and TXT records?",
    answer:
      "Yes. The CNAME points your www subdomain to me3, and the TXT record verifies SSL. Add every record shown in the DNS instructions.",
  },
  {
    question: "Why am I seeing an SSL or security error?",
    answer:
      "This usually means the TXT record is missing or still propagating. Double-check the TXT record, wait a bit, then use Check Status in the dashboard.",
  },
  {
    question: "How do I make DOMAIN.com work without www?",
    answer:
      "Set up a redirect from DOMAIN.com to https://www.DOMAIN.com at your registrar or DNS provider. DNS alone cannot perform redirects.",
  },
  {
    question: "How long does DNS setup take?",
    answer:
      "It often works within minutes but can take several hours depending on your DNS provider.",
  },
  {
    question: "Can I change my custom domain later?",
    answer:
      "Yes. Disconnect the current domain in your settings, then connect the new www domain.",
  },
  {
    question: "Optionally Manage your domain DNS with Cloudflare",
    answer:
      "Cloudflare can make DNS setup easier. Steps: 1) Create a Cloudflare account and add your domain. 2) Update your registrar nameservers to the ones Cloudflare provides. 3) In Cloudflare DNS, add a CNAME record: @ → sites.example.com. 4) Add the TXT record shown in your dashboard for SSL validation.",
  },
];

function toggleFaq(index: number) {
  openFaqIndex.value = openFaqIndex.value === index ? null : index;
}
</script>

<template>
  <div class="page support-page">
    <header class="header">
      <router-link to="/" class="logo-link" aria-label="me3 home">
        <div class="logo">
          <BrandLogo class="logo-img" alt="me3" />
        </div>
      </router-link>
      <nav class="nav">
        <router-link
          v-if="auth.isAuthenticated"
          to="/home"
          class="nav-link"
        >
          Home
        </router-link>
        <router-link v-else to="/login" class="nav-link"> Sign in </router-link>
        <ThemeToggle />
      </nav>
    </header>

    <main class="content">
      <section class="hero">
        <h1 class="title">Support</h1>
        <p class="subtitle">
          Need help connecting your domain? We’re here to help.
        </p>
        <div class="contact-card">
          <p class="contact-text">
            Email us anytime at
            <a href="mailto:support@example.com">support@example.com</a>.
          </p>
        </div>
      </section>

      <section class="faq">
        <h2 class="faq-title">Frequently asked questions</h2>
        <div class="faq-accordion">
          <div
            v-for="(item, index) in faqItems"
            :key="index"
            class="faq-item"
            :class="{ open: openFaqIndex === index }"
          >
            <button
              type="button"
              class="faq-trigger"
              :aria-expanded="openFaqIndex === index"
              :aria-controls="`faq-panel-${index}`"
              :id="`faq-trigger-${index}`"
              @click="toggleFaq(index)"
            >
              <span class="faq-question">{{ item.question }}</span>
              <span class="faq-icon" aria-hidden="true">▼</span>
            </button>
            <div
              :id="`faq-panel-${index}`"
              class="faq-panel"
              role="region"
              :aria-labelledby="`faq-trigger-${index}`"
              :hidden="openFaqIndex !== index"
            >
              <p class="faq-answer">{{ item.answer }}</p>
            </div>
          </div>
        </div>
      </section>
    </main>

    <SiteFooter />
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 40px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.logo-link {
  text-decoration: none;
  color: inherit;
}

.logo {
  display: inline-flex;
  align-items: center;
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

.content {
  flex: 1;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 40px 20px 80px;
}

.hero {
  text-align: center;
  margin-bottom: 56px;
}

.title {
  font-size: 40px;
  font-weight: 700;
  margin: 0 0 12px;
}

.subtitle {
  color: var(--color-text-muted);
  font-size: 18px;
  margin: 0;
}

.contact-card {
  margin: 24px auto 0;
  padding: 18px 22px;
  border-radius: 12px;
  background: var(--color-bg-subtle);
  max-width: 540px;
}

.contact-text {
  margin: 0;
  font-size: 15px;
}

.contact-text a {
  color: var(--color-text);
  text-decoration: underline;
}

.faq {
  margin-top: 40px;
}

.faq-title {
  font-size: 28px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 32px;
}

.faq-accordion {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
}

.faq-item {
  border-bottom: 1px solid var(--color-border);
}

.faq-item:last-child {
  border-bottom: none;
}

.faq-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  background: var(--color-bg);
  border: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--color-text);
  transition: background 0.2s;
}

.faq-trigger:hover {
  background: var(--color-bg-subtle);
}

.faq-question {
  font-size: 16px;
  font-weight: 600;
}

.faq-icon {
  flex-shrink: 0;
  font-size: 12px;
  opacity: 0.7;
  transition: transform 0.25s ease;
}

.faq-item.open .faq-icon {
  transform: rotate(180deg);
}

.faq-panel {
  overflow: hidden;
  transition: grid-template-rows 0.25s ease;
}

.faq-item.open .faq-panel {
  display: block;
}

.faq-item:not(.open) .faq-panel {
  display: none;
}

.faq-answer {
  margin: 0;
  padding: 4px 22px 18px;
  color: var(--color-text-muted);
  line-height: 1.6;
  font-size: 15px;
}

@media (max-width: 768px) {
  .header {
    padding: 18px 20px;
  }

  .title {
    font-size: 32px;
  }
}
</style>
