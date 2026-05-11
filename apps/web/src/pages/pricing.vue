<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useSitesStore } from "../stores/sites";
import SiteFooter from "../components/SiteFooter.vue";
import BrandLogo from "../components/BrandLogo.vue";
import ThemeToggle from "../components/ThemeToggle.vue";
import {
  PRICING_TIERS,
  getPrice,
  getYearlySavings,
  type BillingInterval,
  type PaidTier,
} from "../utils/pricing";
import { resolvePricingCheckoutIntent } from "../utils/pricing-checkout";
import { useAppToast } from "../composables/useAppToast";

definePage({
  meta: {
    title: "Pricing | ME3",
    description:
      "Start free with one ME3 site, upgrade to Starter for bookings and a custom domain, or choose Pro for email, agent help, and simple business workflows.",
  },
});

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const sites = useSitesStore();
const { toastError, toastFromUnknown } = useAppToast();
const billingStatus =
  ref<Awaited<ReturnType<typeof sites.getBillingStatus>>>(null);
const checkoutError = ref("");
const checkoutStarting = ref(false);
const openFaqIndex = ref<number | null>(0);
const billingInterval = ref<BillingInterval>(
  route.query.interval === "year" ? "year" : "month",
);

const freeFeatures = ["1 AI-ready site"];

const availableNow = [
  "Hosted ME3 site with custom domain support",
  "Bookings and newsletter signup",
  "Outbound email sending on Pro",
  "Agent inbox and core workflows",
];
const comingNext = [
  "Richer social media workflows",
  "More agent jobs to help with client outreach and audience building.",
  "Stronger admin and operations tools",
];

const tierMarketing: Record<
  PaidTier,
  {
    tagline: string;
    cta: string;
    featured: boolean;
    eyebrow?: string;
  }
> = {
  starter: {
    tagline: "Get your site live.",
    cta: "Choose Starter",
    featured: false,
  },
  pro: {
    tagline: "Add ME3 AI assistant and more",
    cta: "Choose Pro",
    featured: true,
    eyebrow: "Most complete",
  },
};

const displayedTierKeys = ["starter", "pro"] as const;

/** Shown struck-through on Pro during beta to communicate list vs beta price */
const PRO_BETA_LIST_MONTHLY = 49;
const PRO_BETA_LIST_YEARLY = PRO_BETA_LIST_MONTHLY * 12;

const faqItems = [
  {
    question: "What is the difference between Starter and Pro?",
    answer:
      "Starter gives you a professional site with bookings, newsletter signup, footer customization, and your own domain. Pro adds email sending, agent inbox workflows, a custom mailbox, and more room to run ME3 as part of your day-to-day business.",
  },
  {
    question: "Can I switch plans?",
    answer:
      "Yes, you can upgrade or downgrade at any time. Changes take effect immediately, and we'll prorate the difference.",
  },
  {
    question: "How does the Pro trial work?",
    answer:
      "New users can start a 7-day Pro trial. When it ends, you can subscribe to Pro, move to Starter, or stay on Free.",
  },
  {
    question: "What happens if I exceed my email quota?",
    answer:
      "Email sending is included on Pro only. Pro includes 5,000 emails per month, with overages billed at $2 per 1,000 emails.",
  },
  {
    question: "What is available now versus still in progress?",
    answer:
      "ME3 is ready today for hosted sites, custom domains, bookings, newsletter signup, outbound email, and core agent workflows. We are still expanding social media support, more agent jobs, and broader operations features.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes, cancel anytime from your dashboard. Your site keeps working until the end of your billing period.",
  },
  {
    question: "Do you offer refunds?",
    answer:
      "We offer a 14-day money-back guarantee. If you're not satisfied, we'll refund your payment.",
  },
];

function toggleFaq(index: number) {
  openFaqIndex.value = openFaqIndex.value === index ? null : index;
}

const canStartManagedTrial = computed(
  () =>
    auth.isAuthenticated &&
    !billingStatus.value?.is_paid &&
    !billingStatus.value?.trial_started_at,
);
const checkoutIntent = computed(() =>
  resolvePricingCheckoutIntent(route.query.checkout, route.query.interval),
);

const tiers = computed(() =>
  displayedTierKeys.map((key) => {
    const isPro = key === "pro";
    return {
      key,
      ...PRICING_TIERS[key],
      price: getPrice(key, billingInterval.value),
      savings: getYearlySavings(key),
      intervalLabel: billingInterval.value === "year" ? "/ year" : "/ month",
      cta:
        isPro && canStartManagedTrial.value
          ? "Start 7-day free trial"
          : tierMarketing[key].cta,
      tagline: tierMarketing[key].tagline,
      featured: tierMarketing[key].featured,
      eyebrow: tierMarketing[key].eyebrow,
    };
  }),
);

onMounted(async () => {
  await auth.ensureInitialized();
  if (checkoutIntent.value && !auth.isAuthenticated) {
    router.replace({ path: "/login", query: { redirect: route.fullPath } });
    return;
  }

  if (auth.isAuthenticated) {
    billingStatus.value = await sites.getBillingStatus();
    await maybeStartCheckoutFromQuery();
  }
});

function selectFreePlan() {
  router.push(auth.isAuthenticated ? "/home" : "/login");
}

async function selectPlan(tier: PaidTier) {
  checkoutError.value = "";

  if (!auth.isAuthenticated) {
    router.push("/login");
    return;
  }

  if (tier === "pro" && canStartManagedTrial.value) {
    const started = await sites.startTrial();
    if (started) {
      billingStatus.value = started;
      router.push("/home");
    }
    return;
  }

  try {
    const url = await sites.startCheckout(tier, billingInterval.value);
    if (url) {
      window.location.href = url;
      return;
    }
    const message =
      sites.error || "Failed to start checkout. Please try again.";
    toastError(message);
  } catch (error) {
    console.error("Checkout error:", error);
    toastFromUnknown(error, "Failed to start checkout. Please try again.");
  }
}

async function maybeStartCheckoutFromQuery() {
  const intent = checkoutIntent.value;
  if (!intent || !auth.isAuthenticated || checkoutStarting.value) {
    return;
  }

  if (billingStatus.value?.is_paid || canStartManagedTrial.value) {
    return;
  }

  billingInterval.value = intent.interval;
  checkoutStarting.value = true;
  checkoutError.value = "";

  try {
    const url = await sites.startCheckout(intent.tier, intent.interval);
    if (url) {
      window.location.href = url;
      return;
    }

    const message =
      sites.error || "Failed to start checkout. Please try again.";
    checkoutError.value = message;
    toastError(message);
  } catch (error) {
    console.error("Auto checkout error:", error);
    const message = "Failed to start checkout. Please try again.";
    checkoutError.value = message;
    toastFromUnknown(error, message);
  } finally {
    checkoutStarting.value = false;
  }
}
</script>

<template>
  <div class="pricing-page">
    <header class="header">
      <router-link to="/" class="logo">
        <BrandLogo class="logo-img" alt="me3" />
      </router-link>
      <nav class="nav">
        <router-link v-if="auth.isAuthenticated" to="/home" class="nav-link">
          Home
        </router-link>
        <router-link v-else to="/login" class="nav-link">Sign in</router-link>
        <ThemeToggle />
      </nav>
    </header>

    <main class="main">
      <div v-if="checkoutError" class="checkout-notice">
        {{ checkoutError }}
      </div>

      <section class="hero">
        <h1 class="title">Pricing</h1>

        <div
          class="billing-toggle"
          role="radiogroup"
          aria-label="Billing interval"
        >
          <label
            class="toggle-option"
            :class="{ active: billingInterval === 'month' }"
          >
            <input v-model="billingInterval" type="radio" value="month" />
            Monthly
          </label>
          <label
            class="toggle-option"
            :class="{ active: billingInterval === 'year' }"
          >
            <input v-model="billingInterval" type="radio" value="year" />
            Yearly
            <span class="savings-badge">Save up to 18%</span>
          </label>
        </div>
      </section>

      <section class="tiers">
        <article class="tier-card">
          <div class="tier-top">
            <div>
              <h2 class="tier-name">Free</h2>
            </div>
          </div>
          <p class="tier-tagline">Start with a profile.</p>
          <div class="tier-price">
            <span class="price-amount">$0</span>
            <span class="price-interval">/ forever</span>
          </div>
          <button class="tier-cta tier-cta--secondary" @click="selectFreePlan">
            Get started free
          </button>
          <ul class="tier-features">
            <li v-for="feature in freeFeatures" :key="feature">
              <span class="check">✓</span>
              <span>{{ feature }}</span>
            </li>
          </ul>
        </article>

        <article
          v-for="tier in tiers"
          :key="tier.key"
          class="tier-card"
          :class="{ featured: tier.featured }"
        >
          <div class="tier-top">
            <div>
              <h2 class="tier-name">
                {{ tier.key === "starter" ? "Starter" : "Pro" }}
              </h2>
            </div>
            <span v-if="tier.eyebrow" class="tier-badge">{{
              tier.eyebrow
            }}</span>
          </div>
          <p class="tier-tagline">{{ tier.tagline }}</p>
          <div
            class="tier-price"
            :class="{ 'tier-price--pro': tier.key === 'pro' }"
          >
            <span
              v-if="tier.key === 'pro'"
              class="price-was"
              title="Regular price before beta"
            >
              <span class="price-was-amount">{{
                billingInterval === "year"
                  ? `$${PRO_BETA_LIST_YEARLY}`
                  : `$${PRO_BETA_LIST_MONTHLY}`
              }}</span>
            </span>
            <span class="price-amount">${{ tier.price }}</span>
            <span class="price-interval">{{ tier.intervalLabel }}</span>
          </div>
          <p v-if="billingInterval === 'year'" class="tier-savings">
            Save {{ tier.savings }}% with annual billing
          </p>
          <button class="tier-cta" @click="selectPlan(tier.key)">
            {{ tier.cta }}
          </button>
          <ul class="tier-features">
            <li v-for="feature in tier.features" :key="feature">
              <span class="check">✓</span>
              <span>{{ feature }}</span>
            </li>
          </ul>
        </article>
      </section>

      <section class="state-section" aria-labelledby="state-section-title">
        <div class="state-heading">
          <h2 id="state-section-title" class="state-title">
            What is live now, and what is coming next
          </h2>
        </div>
        <div class="state-grid">
          <article class="state-card">
            <h3 class="state-card-title">Available now</h3>
            <ul class="state-list">
              <li v-for="item in availableNow" :key="item">
                <span class="check">✓</span>
                <span>{{ item }}</span>
              </li>
            </ul>
          </article>
          <article class="state-card">
            <h3 class="state-card-title">Coming next</h3>
            <ul class="state-list">
              <li v-for="item in comingNext" :key="item">
                <span class="check">→</span>
                <span>{{ item }}</span>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <p class="plans-note">
        Need something custom? Email
        <a href="mailto:support@example.com">support@example.com</a>.
      </p>

      <section class="faq">
        <h2 class="faq-title">Frequently asked questions</h2>
        <div class="faq-accordion">
          <div
            v-for="(item, index) in faqItems"
            :key="item.question"
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
.pricing-page {
  min-height: 100vh;
  background: var(--color-bg);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 40px;
  max-width: 1240px;
  margin: 0 auto;
}

.logo {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
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
  max-width: 1240px;
  margin: 0 auto;
  padding: 20px 40px 72px;
}

.checkout-notice {
  max-width: 760px;
  margin: 0 auto 20px;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg);
}

.hero {
  max-width: 760px;
  margin: 0 auto;
  padding: 44px 0 52px;
  text-align: center;
}

.title {
  margin: 0 0 26px;
  font-size: clamp(2.5rem, 5vw, 4rem);
  line-height: 1;
  letter-spacing: -0.05em;
}

.hero-copy {
  max-width: 620px;
  margin: 0 auto 24px;
  color: var(--color-text-muted);
  line-height: 1.7;
}

.billing-toggle {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-bg-subtle);
}

.toggle-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  user-select: none;
}

.toggle-option input {
  display: none;
}

.toggle-option.active {
  background: var(--color-accent);
  color: var(--color-bg);
}

.toggle-option.active .savings-badge {
  background: color-mix(in oklab, var(--color-bg), transparent 78%);
  color: inherit;
}

.savings-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
  color: inherit;
  font-size: 11px;
  font-weight: 700;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) .savings-badge {
    background: rgba(255, 255, 255, 0.12);
  }
}

:root[data-theme="dark"] .savings-badge {
  background: rgba(255, 255, 255, 0.12);
}

.tiers {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  align-items: stretch;
}

.tier-card {
  display: flex;
  flex-direction: column;
  padding: 28px 24px;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-bg);
}

.tier-card.featured {
  border-color: var(--color-text);
}

.tier-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.tier-name {
  margin: 0;
  font-size: 28px;
  line-height: 1.05;
  letter-spacing: -0.04em;
}

.tier-badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--color-text);
  color: var(--color-bg);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.tier-tagline {
  color: var(--color-text-muted);
}

.tier-price {
  margin-bottom: 8px;
}

.tier-price--pro {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 10px;
  row-gap: 4px;
}

.price-was {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  color: var(--color-text-muted);
  text-decoration: line-through;
  font-weight: 600;
  opacity: 0.9;
}

.price-was-amount {
  font-size: 46px;
  font-weight: 400;
  letter-spacing: -0.03em;
}

.price-amount {
  font-size: 52px;
  font-weight: 700;
  letter-spacing: -0.05em;
}

.price-interval {
  margin-left: 6px;
  font-size: 17px;
  color: var(--color-text-muted);
}

.tier-savings {
  margin: 0 0 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.tier-cta {
  width: 100%;
  margin: 0 0 28px;
  padding: 14px 18px;
  border: 1px solid var(--color-accent);
  border-radius: 12px;
  background: var(--color-accent);
  color: var(--color-bg);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s,
    background-color 0.2s,
    border-color 0.2s,
    color 0.2s;
}

.tier-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.tier-cta--secondary {
  background: transparent;
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.tier-cta--secondary:hover {
  transform: none;
  box-shadow: none;
  background: color-mix(in oklab, var(--color-accent), transparent 92%);
}

.tier-features {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tier-features li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  padding: 12px 0;
  border-top: 1px solid var(--color-border);
  line-height: 1.5;
}

.check {
  font-weight: 700;
}

.plans-note {
  margin: 28px auto 0;
  text-align: center;
  color: var(--color-text-muted);
}

.plans-note a {
  color: var(--color-text);
}

.state-section {
  margin: 48px 0 0;
}

.state-heading {
  max-width: 760px;
  margin: 0 auto 24px;
  text-align: center;
}

.state-title {
  margin: 0 0 10px;
  font-size: 34px;
  letter-spacing: -0.04em;
}

.state-copy {
  margin: 0;
  color: var(--color-text-muted);
  line-height: 1.7;
}

.state-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.state-card {
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-bg);
}

.state-card-title {
  margin: 0 0 14px;
  font-size: 22px;
  letter-spacing: -0.03em;
}

.state-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.state-list li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--color-border);
  line-height: 1.5;
}

.state-list li:first-child {
  border-top: none;
  padding-top: 0;
}

.faq {
  max-width: 920px;
  margin: 56px auto 0;
}

.faq-title {
  margin: 0 0 28px;
  text-align: center;
  font-size: 34px;
  letter-spacing: -0.04em;
}

.faq-accordion {
  border: 1px solid var(--color-border);
  border-radius: 18px;
  overflow: hidden;
}

.faq-item + .faq-item {
  border-top: 1px solid var(--color-border);
}

.faq-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px;
  border: none;
  background: var(--color-bg);
  color: var(--color-text);
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.faq-question {
  font-size: 17px;
  font-weight: 600;
}

.faq-icon {
  font-size: 12px;
  transition: transform 0.2s ease;
}

.faq-item.open .faq-icon {
  transform: rotate(180deg);
}

.faq-answer {
  margin: 0;
  padding: 0 22px 22px;
  color: var(--color-text-muted);
  line-height: 1.7;
}

@media (max-width: 980px) {
  .tiers {
    grid-template-columns: 1fr;
  }

  .tier-tagline {
    min-height: 0;
  }
}

@media (max-width: 768px) {
  .header,
  .main {
    padding-left: 20px;
    padding-right: 20px;
  }

  .billing-toggle {
    flex-direction: column;
    width: min(100%, 320px);
  }

  .toggle-option {
    justify-content: center;
  }
}
</style>
