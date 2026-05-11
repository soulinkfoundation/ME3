<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import SiteFooter from "../components/SiteFooter.vue";
import LandingGrids from "../components/LandingGrids.vue";
import BrandLogo from "../components/BrandLogo.vue";
import ThemeToggle from "../components/ThemeToggle.vue";

definePage({
  meta: {
    title: "Coaching Site in 48 Hours | ME3",
    description:
      "I'll build you a clean, credible coaching site in 48 hours. See mine in action, then let's build yours.",
    ogImage: "/me3.png",
  },
});
</script>

<template>
  <div class="offer-page">
    <LandingGrids />
    <header class="header">
      <router-link to="/" class="logo">
        <BrandLogo class="logo-img" alt="me3" />
      </router-link>
      <nav class="nav">
        <router-link to="/" class="nav-link"> Home </router-link>
        <ThemeToggle />
      </nav>
    </header>

    <main class="hero">
      <p class="eyebrow">Offer for people who work with people 1:1</p>
      <h1 class="title">
        I'm taking 8 coaches to build their site on ME3 in 7 days.
      </h1>
      <p class="subtitle">
        You'll get a simple site with booking, newsletter signup, and abillity
        to send newsletter emails. If it works, you stay and leave a
        testimonial. If not, you can export your site and host it anywhere
        (bookings and newsletter currently require me3 hosting).
      </p>
      <div class="cta-row">
        <a
          href="https://kieran.earth"
          target="_blank"
          rel="noopener"
          class="cta"
        >
          Book a call
        </a>
      </div>
    </main>

    <section class="creator">
      <div class="creator-card">
        <div class="creator-content">
          <h2>Built by a coach, for coaches</h2>
          <a
            href="https://kieran.earth"
            target="_blank"
            rel="noopener"
            class="hero-profile"
          >
            <img
              class="hero-avatar"
              src="https://kieran.example.com/files/avatar.jpg"
              alt="Kieran Butler"
            />
          </a>
          <p>
            Hey, I'm Kieran. I'm a certified co-active coach and software
            engineer. I've been helping people who work with people 1:1 with
            their websites. What I've noticed is that we usually need similar
            features and most DIY site builders are overkill and way too complex
            for most people, espcially those allergic to tech, which many
            coaches are.
          </p>
          <p>
            So I built me3. An extremely simple site builder that's perfect for
            people who work with people 1:1. It's built with the
            <a href="/protocol">future in mind</a>, but designed for the
            present. It's for people who want simple!
          </p>
          <a
            href="https://kieran.earth"
            target="_blank"
            rel="noopener"
            class="creator-link"
          >
            Visit my me3 site →
          </a>
        </div>
      </div>
    </section>

    <section class="offer">
      <div class="section-header">
        <p class="section-eyebrow">What you get</p>
        <h2 class="section-title">Everything you need. Nothing you don't.</h2>
      </div>
      <div class="offer-grid">
        <div class="offer-card">
          <h3>What's included</h3>
          <ul>
            <li>One-page site with clear call-to-action</li>
            <li>me.json profile (AI discovery-ready)</li>
            <li>Custom domain setup</li>
            <li>Full export—you own everything</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="steps">
      <div class="section-header">
        <p class="section-eyebrow">How it works</p>
        <h2 class="section-title">Three steps, one week</h2>
      </div>
      <div class="steps-grid">
        <div class="step-card">
          <span class="step-number">1</span>
          <h3>Quick call</h3>
          <p>
            We discuss what you need, confirm fit, and pick a vibe for your
            site.
          </p>
        </div>
        <div class="step-card">
          <span class="step-number">2</span>
          <h3>I build it</h3>
          <p>
            I set up your site on me3, draft the copy, add your details, and get
            your feedback.
          </p>
        </div>
        <div class="step-card">
          <span class="step-number">3</span>
          <h3>Go live</h3>
          <p>
            I publish your site, set up your custom domain, and you own
            everything.
          </p>
        </div>
      </div>
    </section>

    <section class="final-cta">
      <div class="final-cta-inner">
        <h2>Let's build your site</h2>
        <p class="cta-note">
          Book a call and I'll walk you through exactly how it works—on my own
          me3 site.
        </p>
        <a
          href="https://kieran.earth"
          target="_blank"
          rel="noopener"
          class="cta"
        >
          Book a call
        </a>
      </div>
    </section>

    <SiteFooter />
  </div>
</template>

<style scoped>
.offer-page {
  min-height: 100vh;
  position: relative;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 40px;
  max-width: 1200px;
  margin: 0 auto;
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
  text-align: center;
  padding: 100px 20px 80px;
  max-width: 760px;
  margin: 0 auto;
}

.hero-avatar {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  margin-bottom: 16px;
  object-fit: cover;
  border: 2px solid var(--color-bg);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.hero-profile-text {
  text-align: left;
  display: flex;
  justify-content: center;
  flex-direction: column;
}

.hero-name {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  line-height: 1.2;
  color: var(--color-text);
}

.hero-handle {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
  line-height: 1.2;
  margin-top: 2px;
}

.eyebrow {
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-bottom: 12px;
  font-weight: 600;
}

.title {
  font-size: 52px;
  font-weight: 700;
  margin-bottom: 24px;
  line-height: 1.1;
}

.subtitle {
  font-size: 18px;
  color: var(--color-text-muted);
  margin-bottom: 20px;
  line-height: 1.6;
}

.cta-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.cta {
  display: inline-block;
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  padding: 14px 28px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.secondary-cta {
  color: var(--color-text);
  text-decoration: underline;
  font-weight: 500;
}

.hero-note {
  font-size: 14px;
  color: var(--color-text-muted);
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
  font-size: 32px;
  margin-bottom: 12px;
}

.section-subtitle {
  color: var(--color-text-muted);
  line-height: 1.6;
}

.creator {
  padding: 80px 40px;
  max-width: 1100px;
  margin: 0 auto;
}

.creator-card {
  padding: 40px;
  border-radius: 20px;
  background: var(--color-bg-subtle);
  max-width: 700px;
  margin: 0 auto;
}

.creator-content {
  text-align: center;
}

.creator-content h2 {
  font-size: 28px;
  margin-bottom: 20px;
  font-weight: 700;
}

.creator-content p {
  font-size: 16px;
  line-height: 1.7;
  color: var(--color-text-muted);
  margin-bottom: 16px;
}

.creator-link {
  display: inline-flex;
  align-items: center;
  font-weight: 600;
  color: var(--color-text);
  text-decoration: none;
  margin-top: 8px;
  transition: transform 0.2s;
}

.creator-link:hover {
  transform: translateX(4px);
  text-decoration: underline;
}

.offer,
.steps {
  padding: 80px 40px;
  max-width: 1100px;
  margin: 0 auto;
}

.offer-grid,
.steps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 24px;
}

.offer-card,
.step-card {
  padding: 24px;
  border-radius: 16px;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  background: var(--color-bg);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
}

.offer-card h3,
.step-card h3 {
  margin-bottom: 12px;
  font-size: 20px;
}

.offer-card ul {
  list-style: disc;
  padding-left: 18px;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.demo-tag {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
  margin-bottom: 12px;
  font-weight: 600;
}

.demo-card--tech .demo-tag {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.demo-link-text {
  display: inline-block;
  margin-top: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.step-number {
  display: inline-flex;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  background: var(--color-text);
  color: var(--color-bg);
  margin-bottom: 12px;
}

.final-cta {
  background: var(--color-bg-subtle);
}

.final-cta-inner {
  padding: 80px 20px;
  max-width: 700px;
  margin: 0 auto;
  text-align: center;
}

.cta-note {
  font-size: 14px;
  color: var(--color-text-muted);
  margin: 0 0 14px;
}

@media (max-width: 600px) {
  .title {
    font-size: 36px;
  }

  .hero {
    padding: 70px 20px 60px;
  }

  .section-title {
    font-size: 26px;
  }
}
</style>
