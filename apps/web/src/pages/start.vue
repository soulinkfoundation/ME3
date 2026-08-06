<script setup lang="ts">
import { onMounted } from "vue";
import { definePage } from "unplugin-vue-router/runtime";
import { useRouter } from "vue-router";
import PageLoading from "../components/PageLoading.vue";
import { useSitesStore } from "../stores/sites";
import { useWizardStore } from "../stores/wizard";

definePage({
  meta: {
    requiresAuth: true,
    title: "Create Your ME3 Profile | ME3",
    description: "Continue setup in the ME3 profile wizard.",
    robots: "noindex,follow",
  },
});

const router = useRouter();
const sites = useSitesStore();
const wizard = useWizardStore();

onMounted(async () => {
  try {
    await sites.ensureSites();
    const profileSite = sites.sites.find(
      (site) => (site.site_type || "profile") === "profile",
    );
    if (profileSite?.username) {
      const localHandle = (wizard.username || wizard.profile.handle)
        .trim()
        .toLowerCase();
      const preserveLocalDraft =
        wizard.needsPublish &&
        localHandle === profileSite.username.trim().toLowerCase() &&
        Boolean(wizard.profile.name.trim());
      if (!preserveLocalDraft) {
        const content = await sites.getSiteContent(profileSite.username);
        if (content?.ok && content.profile) {
          wizard.loadFromSiteContent(
            content.profile,
            content.pages,
            content.posts,
            content.products || [],
            profileSite.username,
            profileSite.published_at || null,
          );
        }
      }
    }
  } finally {
    await router.replace({ path: "/create", query: { step: "basics" } });
  }
});
</script>

<template>
  <PageLoading label="Opening your ME3 profile..." />
</template>
