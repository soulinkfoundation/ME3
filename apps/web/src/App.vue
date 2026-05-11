<script setup lang="ts">
const setupItems = [
  "Generated auth and encryption secrets",
  "Owner profile bootstrap",
  "AI provider selection",
  "Optional mail, payments, OAuth, and search providers",
];
</script>

<template>
  <main class="shell">
    <section class="hero" aria-labelledby="page-title">
      <p class="eyebrow">Private extraction scaffold</p>
      <h1 id="page-title">ME3 Core</h1>
      <p class="lede">
        The installable personal/business AI assistant core, stripped of ME3 Cloud production assumptions.
      </p>
    </section>

    <section class="panel" aria-labelledby="status-title">
      <div>
        <p class="eyebrow">First slice</p>
        <h2 id="status-title">Boot shell</h2>
      </div>

      <ul class="checklist">
        <li v-for="item in setupItems" :key="item">
          <span aria-hidden="true"></span>
          {{ item }}
        </li>
      </ul>
    </section>
  </main>
</template>
