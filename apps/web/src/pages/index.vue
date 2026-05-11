<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useAuthStore } from "../stores/auth";
import SiteFooter from "../components/SiteFooter.vue";
import TestimonialCard from "../components/TestimonialCard.vue";
import LandingDemoSitesCarousel from "../components/LandingDemoSitesCarousel.vue";
import Typed from "typed.js";
import LandingGrids from "../components/LandingGrids.vue";
import BrandLogo from "../components/BrandLogo.vue";
import ThemeToggle from "../components/ThemeToggle.vue";

definePage({
  meta: {
    title: "ME3: Your Personal AI Assistant",
    description:
      "ME3 is an AI assistant that helps you manage your digital life.",
    ogImage: "/me3.png",
  },
});

const auth = useAuthStore();

const isVideoModalOpen = ref(false);
const heroVideo = ref<HTMLVideoElement | null>(null);
const isHeroVideoPlaying = ref(false);
const heroPreviewVideoUrl = import.meta.env.VITE_HERO_PREVIEW_VIDEO_URL || "";
const heroVideoUrl =
  "https://www.youtube-nocookie.com/embed/fDM4QJnRsFQ?autoplay=1&rel=0";

const testimonialProfile = ref({
  name: "Erum Hayat",
  handle: "erumhayat",
  avatar: "/erum.jpg",
  profileUrl: "https://erumhayatatelier.com",
  meJsonUrl: "https://erumhayatatelier.com/me.json",
});
const testimonialQuote =
  "It's amazing, super easy to use and I love the minimalist style";

const typedTarget = ref<HTMLElement | null>(null);
let typedInstance: Typed | null = null;

function canFetchMeJsonFromBrowser(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (parsed.origin === window.location.origin) return true;
    if (host === "example.com" || host.endsWith(".example.com")) return true;
    if (import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(host)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const GET_STARTED_URL = "/login";

function getStarted() {
  window.open(GET_STARTED_URL, "_blank", "noopener,noreferrer");
}

function closeVideoModal() {
  isVideoModalOpen.value = false;
}

async function playHeroVideo() {
  const video = heroVideo.value;
  if (!video) return;

  video.muted = false;
  video.volume = 1;

  try {
    await video.play();
  } catch {
    isHeroVideoPlaying.value = false;
  }
}

function pauseHeroVideo() {
  const video = heroVideo.value;
  if (!video || video.paused) return;

  video.pause();
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && isVideoModalOpen.value) {
    closeVideoModal();
  }
}

/*
 * Newsletter (uncomment with homepage newsletter section):
 * import { api } from "../api";
 * const newsletterEmail = ref("");
 * const newsletterWebsite = ref("");
 * const newsletterStatus = ref<"idle" | "loading" | "success" | "error">("idle");
 * const newsletterMessage = ref("");
 * const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
 * async function submitNewsletter() { ... api.upload("/marketing/subscribe", ...) }
 */

onMounted(async () => {
  window.addEventListener("keydown", handleWindowKeydown);

  const target = typedTarget.value;
  if (target) {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (prefersReducedMotion) {
      target.textContent = "save time.";
    } else {
      target.textContent = "";
      typedInstance = new Typed(target, {
        strings: ["email.", "calendar.", "social media.", "your digital life."],
        typeSpeed: 78,
        backSpeed: 32,
        backDelay: 1500,
        startDelay: 200,
        loop: true,
        smartBackspace: true,
        showCursor: true,
        cursorChar: "▍",
      });
    }
  }

  const meJsonUrl = testimonialProfile.value.meJsonUrl;
  if (!canFetchMeJsonFromBrowser(meJsonUrl)) return;

  try {
    const response = await fetch(meJsonUrl, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return;
    const data = await response.json();
    testimonialProfile.value = {
      ...testimonialProfile.value,
      name:
        typeof data?.name === "string" && data.name.trim()
          ? data.name.trim()
          : testimonialProfile.value.name,
      handle:
        typeof data?.handle === "string" && data.handle.trim()
          ? data.handle.trim()
          : testimonialProfile.value.handle,
    };
  } catch {
    // Keep fallback testimonial details if me.json is unavailable.
  }
});

watch(isVideoModalOpen, (isOpen) => {
  document.body.style.overflow = isOpen ? "hidden" : "";
});

onBeforeUnmount(() => {
  typedInstance?.destroy();
  window.removeEventListener("keydown", handleWindowKeydown);
  document.body.style.overflow = "";
});
</script>

<template>
  <div class="home">
    <LandingGrids />
    <section class="alert-banner">
      <h3>
        ME3 is in beta with limited spots.
        <a
          href="https://www.kieranbutler.com/work-with-me"
          target="_blank"
          rel="noopener"
          >Get early access.</a
        >
      </h3>
    </section>
    <div class="home-top">
      <div class="logo">
        <BrandLogo class="logo-img" alt="me3" />
      </div>
      <nav class="nav">
        <router-link v-if="auth.isAuthenticated" to="/home" class="nav-link">
          Home
        </router-link>
        <router-link v-else to="/login" class="nav-link"> Sign in </router-link>
        <ThemeToggle />
      </nav>
    </div>

    <main class="hero">
      <div class="hero-inner">
        <div class="hero-copy">
          <h1 class="title">
            Your Personal AI Assistant that helps you manage your<br />
            <span class="typed-text" ref="typedTarget">digital life.</span>
          </h1>
          <div class="cta-row">
            <button class="cta cta-label" type="button" @click="getStarted">
              Special offer for early users →
            </button>
            <!-- <button
              class="cta cta-secondary cta-label cta-watch-demo"
              type="button"
              @click="openVideoModal"
            >
              Watch demo
            </button> -->
          </div>
          <p class="hero-micro">Guided setup · limited spots</p>
          <!-- <div class="cta-row">
            <button class="cta cta-label" type="button" @click="getStarted">
              Try for free
            </button>
          </div>
          <p class="hero-micro">
            No credit card · Cancel anytime
          </p> -->
        </div>
        <div class="hero-visual">
          <!-- <img
            class="hero-image"
            src="/me3protocol.jpg"
            alt=""
            width="1024"
            height="1024"
            loading="eager"
            decoding="async"
          /> -->
          <video
            v-if="heroPreviewVideoUrl"
            ref="heroVideo"
            class="hero-image"
            :src="heroPreviewVideoUrl"
            width="1024"
            height="1024"
            :controls="isHeroVideoPlaying"
            loop
            playsinline
            poster="/me3protocol.jpg"
            preload="metadata"
            aria-label="ME3 product preview"
            @click="pauseHeroVideo"
            @play="isHeroVideoPlaying = true"
            @pause="isHeroVideoPlaying = false"
          />
          <img
            v-else
            class="hero-image"
            src="/me3protocol.jpg"
            alt=""
            width="1024"
            height="1024"
            loading="eager"
            decoding="async"
          />
          <button
            v-if="heroPreviewVideoUrl && !isHeroVideoPlaying"
            class="hero-video-play"
            type="button"
            aria-label="Play ME3 product preview"
            @click="playHeroVideo"
          >
            <img
              class="hero-video-cover"
              src="/me3protocol.jpg"
              alt=""
              aria-hidden="true"
              width="1024"
              height="1024"
              loading="eager"
              decoding="async"
            />
            <span aria-hidden="true">▶</span>
          </button>
        </div>
      </div>
    </main>

    <div
      v-if="isVideoModalOpen"
      class="video-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="ME3 demo video"
      @click.self="closeVideoModal"
    >
      <div class="video-modal">
        <button
          class="video-modal-close"
          type="button"
          aria-label="Close video"
          @click="closeVideoModal"
        >
          ×
        </button>
        <div class="video-frame">
          <iframe
            :src="heroVideoUrl"
            title="ME3 demo video"
            allow="
              accelerometer;
              autoplay;
              clipboard-write;
              encrypted-media;
              gyroscope;
              picture-in-picture;
              web-share;
            "
            allowfullscreen
          ></iframe>
        </div>
      </div>
    </div>

    <!-- <section class="nonprofit-banner">
      <h3>
        ME3's mission is to use the artificial to return to what's natural; so
        we can be more human, not less.
      </h3>
    </section> -->

    <section class="what-makes-me3-different">
      <div class="section-header">
        <!-- <p class="section-eyebrow">What makes ME3 different?</p> -->
        <h2 class="section-title">Testimonials</h2>
        <!-- <p class="section-subtitle">
          Those who will thrive with AI are the ones who go deep and know what
          makes them unique. This is the
          <em><strong>gold</strong></em> AI can help amplify
          <strong>when you provide it with the right context.</strong>
        </p> -->
      </div>
      <TestimonialCard
        :name="testimonialProfile.name"
        :handle="testimonialProfile.handle"
        :avatar="testimonialProfile.avatar"
        :quote="testimonialQuote"
        :profile-url="testimonialProfile.profileUrl"
        :me-json-url="testimonialProfile.meJsonUrl"
      />
    </section>

    <section class="founder-story" aria-labelledby="founder-story-title">
      <div class="founder-story-card">
        <img
          class="founder-avatar"
          src="/kieran.jpeg"
          alt="Kieran Butler"
          width="112"
          height="112"
          loading="lazy"
          decoding="async"
        />
        <div class="founder-story-copy">
          <p class="section-eyebrow">Why I built ME3</p>
          <h2 id="founder-story-title" class="founder-story-title">Why ME3</h2>
          <p class="founder-story-text">
            Let me guess, you don't want to spend your days doing admin, or
            juggling 10 different tools for calendars, bookings, email lists and
            so on.
            <strong>ME Too! That's why I built ME3.</strong>
            It started as a simple website builder for some friends allergic to
            tech (and updating WordPress). Then I added AI to see if it could
            free me up to do more of what I enjoy (and because it's 2026). It's
            a work in progress but it's getting there. Check it out or send me a
            message if you want to be an early user.
          </p>
          <p class="founder-story-text">
            Kieran Butler, co-active coach, solo-founder
          </p>
          <a
            class="founder-story-link"
            href="https://www.kieranbutler.com/work-with-me"
            target="_blank"
            rel="noopener"
          >
            kieranbutler.com
          </a>
        </div>
      </div>
    </section>

    <section class="demo-sites" aria-labelledby="demo-sites-title">
      <div class="section-header">
        <!-- <p class="section-eyebrow">SAMPLE SITES</p> -->
        <h2 id="demo-sites-title" class="section-title">Sample Sites</h2>
        <p class="section-subtitle">Click to view live demos.</p>
      </div>
      <LandingDemoSitesCarousel />
    </section>

    <section class="features">
      <div class="section-header features-header">
        <p class="section-eyebrow">How It Works</p>
        <h2 class="section-title">Your Site + AI = ME3</h2>
        <p class="section-subtitle">
          Your site is the blueprint AI can use to help you grow your business.
        </p>
      </div>
      <div class="feature">
        <div class="feature-icon" aria-hidden="true">
          <img src="/illustrations/build3.gif" alt="ME3 building your site" />
        </div>
        <h3>1. Create</h3>
        <p>
          Create a simple site in minutes that can take bookings, collect
          emails, and sell products.
        </p>
      </div>
      <div class="feature">
        <div class="feature-icon" aria-hidden="true">
          <img src="/illustrations/paid2.gif" alt="ME3 on Telegram" />
        </div>
        <h3>2. Configure</h3>
        <p>
          Configure jobs for your ME3 AI agent e.g. reminders, email triage and
          more coming soon.
        </p>
      </div>
      <div class="feature">
        <div class="feature-icon" aria-hidden="true">
          <img src="/illustrations/serve.gif" alt="ME3 managing your time" />
        </div>
        <h3>2. Chat</h3>
        <p>
          Chat with ME3 AI agent on Telegram to update your site, draft emails
          and social posts.
        </p>
      </div>
    </section>

    <!-- <section class="features">
      <div class="section-header features-header">
        <p class="section-eyebrow">How It Works</p>
        <h2 class="section-title">Tools are useful, but...</h2>
        <p class="section-subtitle">
          They're no match for a human with the right process.
        </p>
      </div>
      <div class="feature">
        <div class="feature-icon" aria-hidden="true">
          <img src="/illustrations/build3.gif" alt="ME3 building your site" />
        </div>
        <h3>1. Get Clear</h3>
        <p>
          Define what you offer, who you help (and how) so your assistant can
          work for you.
        </p>
      </div>
      <div class="feature">
        <div class="feature-icon" aria-hidden="true">
          <img src="/illustrations/serve.gif" alt="ME3 managing your time" />
        </div>
        <h3>2. Serve people</h3>
        <p>
          ME3 helps you find and follow up with your people. You do the human
          bit.
        </p>
      </div>
      <div class="feature">
        <div class="feature-icon" aria-hidden="true">
          <img src="/illustrations/paid2.gif" alt="ME3 on Telegram" />
        </div>
        <h3>3. Get Paid</h3>
        <p>
          Sell your wares and accept paid bookings. ME3 helps with the admin.
        </p>
      </div>
    </section> -->

    <section class="nonprofit-banner">
      <h3>
        <a :href="GET_STARTED_URL" target="_blank" rel="noopener noreferrer">
          Special offer for early users →
        </a>
      </h3>
    </section>

    <!-- <section class="newsletter">
      <div class="section-header">
        <p class="section-eyebrow">Newsletter</p>
        <h2 class="section-title">Stay in the loop</h2>
      </div>
      <form class="newsletter-form" @submit.prevent="submitNewsletter">
        <input
          v-model="newsletterEmail"
          type="email"
          name="email"
          autocomplete="email"
          placeholder="you@domain.com"
          class="newsletter-input"
          :disabled="newsletterStatus === 'loading'"
          required
        />
        <input
          v-model="newsletterWebsite"
          type="text"
          name="website"
          class="newsletter-honey"
          tabindex="-1"
          autocomplete="off"
          aria-hidden="true"
        />
        <button
          type="submit"
          class="cta newsletter-cta"
          :disabled="newsletterStatus === 'loading'"
        >
          {{ newsletterStatus === "loading" ? "Joining..." : "Get updates" }}
        </button>
      </form>
      <p v-if="newsletterStatus === 'success'" class="newsletter-success">
        {{ newsletterMessage }}
      </p>
      <p v-else-if="newsletterStatus === 'error'" class="newsletter-error">
        {{ newsletterMessage }}
      </p>
    </section> -->

    <SiteFooter />
  </div>
</template>

<style scoped>
.home {
  min-height: 100dvh;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}

.home-top {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
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

.nav-link:hover {
  text-decoration: underline;
}

.hero {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100dvh - 95px);
  min-height: calc(100dvh - 95px);
  width: 100%;
  box-sizing: border-box;
}

.hero-inner {
  display: grid;
  gap: 28px;
  align-items: center;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}

@media (min-width: 1024px) {
  .hero-inner {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(20px, 3dvw, 40px);
    padding: 0 40px;
  }
}

.hero-copy {
  text-align: center;
  padding: 0 24px;
}

@media (min-width: 1024px) {
  .hero-copy {
    text-align: left;
    padding: 0;
  }
}

.title {
  font-size: clamp(28px, 4.2dvw, 48px);
  font-weight: 700;
  margin-bottom: clamp(8px, 1.2dvh, 16px);
  line-height: 1.2;
}

.typed-text {
  display: inline;
  white-space: nowrap;
  color: var(--color-accent);
}

.typed-text:empty {
  min-width: 14ch;
}

:deep(.typed-cursor) {
  display: inline-block;
  margin-left: 4px;
  color: var(--color-text);
  animation: typedCursorBlink 0.8s infinite;
}

@keyframes typedCursorBlink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

.subtitle {
  font-size: clamp(15px, 1.6dvw, 17px);
  color: var(--color-text-muted);
  margin-bottom: clamp(10px, 1.5dvh, 18px);
  line-height: 1.5;
  max-width: 36ch;
  margin-left: auto;
  margin-right: auto;
}

@media (min-width: 1024px) {
  .subtitle {
    margin-left: 0;
    margin-right: auto;
  }
}

.cta-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin: 15px 0 5px;
}

@media (min-width: 1024px) {
  .cta-row {
    justify-content: flex-start;
  }
}

.hero-subtitle {
  font-size: 15px;
  font-weight: 400;
  color: var(--color-text-muted);
}

.hero-micro {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
  letter-spacing: 0.02em;
}

@media (min-width: 1024px) {
  .hero-micro {
    justify-content: flex-start;
  }
}

.hero-pricing-link {
  font-size: 13px;
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  font-weight: 600;
}

.hero-pricing-link:hover {
  color: inherit;
}
.alert-banner {
  background: color-mix(in oklab, var(--color-accent), white 18%);
  color: #fff;
  padding: 6px;
  text-align: center;
}
.alert-banner h3 {
  margin: 0 auto;
  font-size: 12px;
  font-weight: 500;
  color: #fff;
}
.nonprofit-banner,
.home-survey-banner {
  background: color-mix(in oklab, var(--color-accent), white 18%);
  color: #fff;
  padding: 16px;
  text-align: center;
}

.nonprofit-banner h3,
.home-survey-banner h3 {
  max-width: 800px;
  margin: 0 auto;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.5;
  color: #fff;
}

.nonprofit-banner a,
.home-survey-banner a {
  color: #fff;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.nonprofit-banner a:hover,
.home-survey-banner a:hover {
  color: rgba(255, 255, 255, 0.88);
}

.founder-story {
  max-width: 1200px;
  margin: 0 auto;
  padding: 80px 40px;
}

.founder-story-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  max-width: 760px;
  margin: 0 auto;
  padding: 24px;
  border-radius: 24px;
  background: var(--color-bg);
  text-align: center;
}

.founder-avatar {
  display: block;
  width: 112px;
  height: 112px;
  border-radius: 9999px;
  object-fit: cover;
}

.founder-story-copy {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.founder-story-title {
  font-size: clamp(24px, 3vw, 34px);
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.founder-story-text {
  max-width: 64ch;
  color: var(--color-text-muted);
  line-height: 1.7;
}

.founder-story-link {
  width: fit-content;
  margin-left: auto;
  margin-right: auto;
  margin-top: 4px;
  color: var(--color-text);
  text-decoration: underline;
  font-weight: 600;
}

.cta {
  background: var(--color-accent);
  color: var(--color-bg);
  border: none;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 22px;
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.cta-label {
  letter-spacing: 0.06em;
}

.cta-secondary {
  background: transparent;
  color: var(--color-text);
  border: 2px solid var(--color-border);
  box-shadow: none;
}

.cta-secondary:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

@media (max-width: 767px) {
  .cta-watch-demo {
    display: none;
  }
}

.hero-visual {
  position: relative;
  display: block;
  min-height: 600px;
  width: calc(100% - 40px);
  max-width: 380px;
  margin-left: auto;
  margin-right: auto;
  border-radius: 30px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.12);
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  transition:
    transform 0.35s ease,
    box-shadow 0.35s ease;
}

@media (min-width: 1024px) {
  .hero-visual {
    border-radius: 30px;
    margin-bottom: 40px;
  }
}

.hero-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}

.hero-video-play {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: #fff;
  cursor: pointer;
}

.hero-video-play::after {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.18);
}

.hero-video-cover {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.hero-video-play span {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  padding-left: 4px;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.72);
  font-size: 30px;
  line-height: 1;
}

.hero-video-play:hover span {
  background: rgba(0, 0, 0, 0.9);
}

.hero-video-play:focus-visible {
  outline: 2px solid var(--color-text);
  outline-offset: -6px;
}

.hero-visual:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.16);
}

.hero-visual:focus-visible {
  outline: 2px solid var(--color-text);
  outline-offset: 3px;
  transform: translateY(-1px);
}

.video-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.video-modal {
  position: relative;
  width: min(960px, 100%);
  border-radius: 24px;
  overflow: hidden;
  background: var(--color-bg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
}

.video-modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.12));
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.video-frame {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%;
  background: #000;
}

.video-frame iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
}

.section-header {
  text-align: center;
  max-width: 640px;
  margin: 0 auto 32px;
}

.section-eyebrow {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  font-weight: 600;
  margin-bottom: 12px;
}

.section-title {
  margin-bottom: 12px;
  font-size: clamp(24px, 3vw, 34px);
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.section-subtitle {
  color: var(--color-text-muted);
  line-height: 1.6;
}

.demo-sites {
  padding: 80px 24px;
  margin: 0 auto;
  width: 100%;
  background: var(--color-bg, #fff);
  box-sizing: border-box;
}

@media (min-width: 640px) {
  .demo-sites {
    padding: 80px 40px;
  }
}

.testimonials {
  padding: 80px 40px;
  margin: 0 auto;
  width: 100%;
  background: var(--color-bg-subtle);
}

.what-makes-me3-different {
  padding: 80px 40px;
  background: var(--color-bg-subtle);
}

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 32px;
  padding: 80px 40px;
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
}

.features-header {
  grid-column: 1 / -1;
  margin-bottom: 8px;
}

.feature {
  text-align: center;
  padding: 24px;
}

.feature-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  overflow: hidden;
  width: 100%;
  max-width: none;
  margin-left: 0;
  margin-right: 0;
  border-radius: 99999px;
}

.feature-icon img {
  width: 100%;
  height: auto;
  max-height: 230px;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}

.feature h3 {
  font-size: 20px;
  margin-bottom: 8px;
}

.feature p {
  color: var(--color-text-muted);
  line-height: 1.5;
}

.newsletter {
  padding: 80px 40px;
  max-width: 600px;
  margin: 0 auto;
  text-align: center;
}

.newsletter-form {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.newsletter-input {
  flex: 1 1 280px;
  min-width: min(360px, 100%);
  padding: 14px 16px;
  border-radius: 10px;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.12));
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 16px;
}

.newsletter-input:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1);
}

.newsletter-cta {
  padding: 14px 26px;
  font-size: 16px;
}

.newsletter-cta:disabled {
  cursor: not-allowed;
  opacity: 0.7;
  transform: none;
  box-shadow: none;
}

.newsletter-input:disabled {
  opacity: 0.8;
}

.newsletter-privacy {
  font-size: 13px;
  color: var(--color-text-muted);
  margin: 0;
}

.newsletter-success {
  margin-top: 8px;
  font-weight: 600;
  color: #0b6b3a;
}

.newsletter-error {
  margin-top: 8px;
  font-weight: 600;
  color: #b42318;
}

.newsletter-honey {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

@media (max-width: 768px) {
  .features {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .hero {
    padding: 40px 0;
  }

  .founder-story-card {
    padding: 40px 20px;
  }

  .founder-avatar {
    width: 88px;
    height: 88px;
  }

  .cta {
    justify-content: center;
  }

  .section-title {
    font-size: 26px;
  }

  .video-modal-overlay {
    padding: 12px;
  }

  .video-modal {
    border-radius: 18px;
  }
}
</style>
