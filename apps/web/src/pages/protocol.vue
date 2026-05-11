<script setup lang="ts">
import { definePage } from "unplugin-vue-router/runtime";
import { useAuthStore } from "../stores/auth";
import SiteFooter from "../components/SiteFooter.vue";
import BrandLogo from "../components/BrandLogo.vue";
import ThemeToggle from "../components/ThemeToggle.vue";

definePage({
  meta: {
    title: "me3 Protocol | A contract between you and AI",
    description:
      "me.json, /.well-known/me.json, and me3 discovery endpoints give agents a deterministic way to find identity, offers, and actions.",
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
      <div class="hero">
        <h1 class="title">A contract between you and AI.</h1>
        <p class="subtitle">
          <strong>me.json</strong> tells machines who you are, what you offer,
          and how to work with you. No crawling. No guessing. Just facts.
        </p>
        <div class="protocol-figure">
          <img
            class="protocol-image"
            src="/me3protocol.jpg"
            alt="The ME3 Protocol diagram"
            loading="lazy"
          />
        </div>
        <div class="links">
          <router-link
            :to="auth.isAuthenticated ? '/home' : '/login'"
            class="cta primary"
          >
            Create your site
          </router-link>
          <a
            href="https://www.npmjs.com/package/me3-protocol"
            target="_blank"
            rel="noopener noreferrer"
            class="cta secondary"
          >
            NPM Package
          </a>
          <a
            href="https://github.com/Soulink-Foundation/me3"
            target="_blank"
            rel="noopener noreferrer"
            class="cta secondary"
          >
            GitHub
          </a>
        </div>
      </div>

      <div class="prose">
        <h2>Example</h2>
        <p>
          Here's a complete <code>me.json</code> file. It lives at the root of
          your site (e.g.
          <a
            href="https://kieran.earth/me.json"
            target="_blank"
            rel="noopener noreferrer"
            >kieran.earth/me.json</a
          >).
        </p>

        <div class="code-block">
          <pre><code>{
  "version": "0.1",
  "name": "Kieran Butler",
  "handle": "kieran",
  "location": "Limerick, Ireland",
  "bio": "Software Engineer | Product Builder | Co-active Coach",
  "avatar": "./files/avatar.jpg",
  "links": {
    "twitter": "kieranofearth",
    "linkedin": "kieranbutler",
    "email": "hey@kieran.earth"
  },
  "services": [
    {
      "id": "discovery-call",
      "title": "Discovery Call",
      "description": "A first conversation to explore fit.",
      "sessionType": "1:1",
      "duration": 45,
      "price": 150,
      "currency": "EUR",
      "availabilityMode": "native",
      "status": "active"
    }
  ],
  "intents": {
    "subscribe": {
      "enabled": true,
      "title": "Technology And Paganism",
      "description": "Musings on using the artificial to return to the natural."
    },
    "book": {
      "enabled": true,
      "title": "Book a call",
      "description": "Let's discuss your project.",
      "duration": 45,
      "availability": {
        "timezone": "Europe/London",
        "windows": {
          "monday": ["09:00-17:00"],
          "tuesday": ["09:00-17:00"],
          "wednesday": ["09:00-17:00"],
          "thursday": ["09:00-17:00"],
          "friday": ["09:00-17:00"]
        }
      }
    }
  },
  "actions": {
    "checkAvailability": {
      "method": "GET",
      "url": "/api/book/kieran/slots{?date}",
      "requires": ["date"]
    },
    "createBooking": {
      "method": "POST",
      "url": "/api/book/kieran/confirm",
      "requires": ["slotStart", "slotEnd", "guestName", "guestEmail", "paymentIntentId"]
    },
    "subscribe": {
      "method": "POST",
      "url": "/api/sites/kieran/subscribe",
      "requires": ["email"]
    }
  }
}</code></pre>
        </div>

        <h2>How it works</h2>
        <p>
          AI reads <code>me.json</code> to understand who you are and what
          actions are available. ME3 can also publish structured
          <code>services</code> and explicit <code>actions</code> so an agent
          can discover offers, check availability, and trigger the right API
          without reverse-engineering your site.
        </p>

        <h2>Discovery contract</h2>
        <p>
          The reliable contract is simple: every public ME3 site should expose
          <code>/me.json</code>. For agents that look for standard locations,
          the same document should also be available at
          <code>/.well-known/me.json</code>.
        </p>
        <div class="code-block">
          <pre><code>https://yourdomain.com/me.json
https://yourdomain.com/.well-known/me.json
/api/discovery/resolve?url=https://yourdomain.com
/api/discovery/search?q=your%20name
/api/discovery/search?social=instagram:yourhandle</code></pre>
        </div>

        <h2>How agents should look</h2>
        <p>
          First use memory if a trusted <code>me_json_url</code> is already
          known. If the user gives a domain, try <code>/me.json</code>, then
          <code>/.well-known/me.json</code>, then call
          <code>resolve</code> to confirm the canonical site. If the user only
          gives a name or social handle, use <code>search</code> first, confirm
          the right match, then save the resolved <code>me_json_url</code> for
          future use.
        </p>

        <h2>What agents get</h2>
        <p>
          The combination matters: identity for trust, services for fit, and
          actions for execution. That turns a personal site into something an
          assistant can actually work with, not just read.
        </p>

        <h2>Implementation notes</h2>
        <p>
          ME3 sites can also advertise <code>me.json</code> in HTML and HTTP
          headers so crawlers and agents do not have to guess. Once an agent
          has <code>me.json</code>, it should prefer declared
          <code>intents</code> and <code>actions</code> over scraping the
          rendered page.
        </p>

        <h2>Get started</h2>
        <p>
          Create a site with me3 and your <code>me.json</code> is generated
          automatically. Or add one manually to any site:
        </p>
        <div class="code-block">
          <pre><code>npm install me3-protocol</code></pre>
        </div>
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

.hero {
  text-align: center;
  margin-bottom: 80px;
}

.protocol-figure {
  margin: 32px auto;
  max-width: 680px;
}

.protocol-image {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 18px;
  border: 1px solid var(--color-border);
  box-shadow: 0 18px 32px rgba(0, 0, 0, 0.12);
}

.title {
  font-size: 42px;
  font-weight: 700;
  margin-bottom: 24px;
  line-height: 1.2;
}

.subtitle {
  font-size: 20px;
  color: var(--color-text-muted);
  margin-bottom: 32px;
  line-height: 1.6;
}

.links {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.cta {
  display: inline-block;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.cta.secondary {
  background: var(--color-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.cta.primary {
  background: var(--color-text);
  color: var(--color-bg);
}

.cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.prose {
  line-height: 1.6;
  color: var(--color-text);
}

.prose h2 {
  font-size: 24px;
  margin-top: 48px;
  margin-bottom: 24px;
  font-weight: 600;
}

.prose p {
  margin-bottom: 24px;
  color: var(--color-text-muted);
  font-size: 18px;
}

.code-block {
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 24px;
  margin: 32px 0;
  overflow-x: auto;
}

pre {
  margin: 0;
}

code {
  font-family: var(--font-mono);
  font-size: 14px;
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
