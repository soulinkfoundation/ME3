<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import { useAuthStore } from "../stores/auth";
import SiteFooter from "../components/SiteFooter.vue";
import BrandLogo from "../components/BrandLogo.vue";
import ThemeToggle from "../components/ThemeToggle.vue";

definePage({
  meta: {
    title: "Terms of Service | ME3",
    description: "Review the terms of service for using example.com.",
  },
});

const auth = useAuthStore();
</script>

<template>
  <div class="page">
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
      <h1 class="title">Terms of Service</h1>
      <div class="prose">
        <p>Last updated: January 2026</p>

        <h2>1. Agreement to Terms</h2>
        <p>
          By accessing our website at example.com, you agree to be bound by these
          terms of service, all applicable laws and regulations, and agree that
          you are responsible for compliance with any applicable local laws.
        </p>

        <h2>2. Use License</h2>
        <p>
          Permission is granted to temporarily download one copy of the
          materials (information or software) on me3's website for personal,
          non-commercial transitory viewing only.
        </p>
        <p>
          This is the grant of a license, not a transfer of title, and under
          this license you may not:
        </p>
        <ul>
          <li>modify or copy the materials;</li>
          <li>
            use the materials for any commercial purpose, or for any public
            display (commercial or non-commercial);
          </li>
          <li>
            attempt to decompile or reverse engineer any software contained on
            me3's website;
          </li>
          <li>
            remove any copyright or other proprietary notations from the
            materials; or
          </li>
          <li>
            transfer the materials to another person or "mirror" the materials
            on any other server.
          </li>
        </ul>

        <h2>3. Disclaimer</h2>
        <p>
          The materials on me3's website are provided on an 'as is' basis. me3
          makes no warranties, expressed or implied, and hereby disclaims and
          negates all other warranties including, without limitation, implied
          warranties or conditions of merchantability, fitness for a particular
          purpose, or non-infringement of intellectual property or other
          violation of rights.
        </p>

        <h2>4. Limitations</h2>
        <p>
          In no event shall me3 or its suppliers be liable for any damages
          (including, without limitation, damages for loss of data or profit, or
          due to business interruption) arising out of the use or inability to
          use the materials on me3's website.
        </p>

        <h2>5. Accuracy of Materials</h2>
        <p>
          The materials appearing on me3's website could include technical,
          typographical, or photographic errors. me3 does not warrant that any
          of the materials on its website are accurate, complete or current.
        </p>

        <h2>6. Links</h2>
        <p>
          me3 has not reviewed all of the sites linked to its website and is not
          responsible for the contents of any such linked site. The inclusion of
          any link does not imply endorsement by me3 of the site. Use of any
          such linked website is at the user's own risk.
        </p>

        <h2>7. Modifications</h2>
        <p>
          me3 may revise these terms of service for its website at any time
          without notice. By using this website you are agreeing to be bound by
          the then current version of these terms of service.
        </p>

        <h2>8. Governing Law</h2>
        <p>
          These terms and conditions are governed by and construed in accordance
          with the laws and you irrevocably submit to the exclusive jurisdiction
          of the courts in that location.
        </p>

        <h2>9. Credits</h2>
        <p>
          <a
            href="https://storyset.com/money"
            target="_blank"
            rel="noopener noreferrer"
            >Money illustrations by Storyset</a
          >.
        </p>
      </div>
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

.nav-link:hover {
  text-decoration: underline;
}

.content {
  flex: 1;
  padding: 60px 20px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

.title {
  font-size: 42px;
  font-weight: 700;
  margin-bottom: 40px;
}

.prose {
  line-height: 1.6;
  color: var(--color-text);
}

.prose h2 {
  font-size: 24px;
  margin-top: 32px;
  margin-bottom: 16px;
  font-weight: 600;
}

.prose p {
  margin-bottom: 16px;
  color: var(--color-text-muted);
}

.prose ul {
  margin-bottom: 16px;
  padding-left: 24px;
  color: var(--color-text-muted);
}

.prose li {
  margin-bottom: 8px;
}

.prose a {
  color: var(--color-text);
  text-decoration: underline;
  text-underline-offset: 2px;
}

@media (max-width: 600px) {
  .title {
    font-size: 32px;
  }

  .content {
    padding: 40px 20px;
  }
}
</style>
