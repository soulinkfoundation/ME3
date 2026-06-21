<script setup lang="ts">
import { ref, computed } from "vue";
import JSZip from "jszip";
import TurndownService from "turndown";
import {
  useWizardStore,
  type WizardPage,
  type WizardPageImage,
  type WizardPost,
  type WizardProduct,
} from "../../stores/wizard";
import { useAuthStore } from "../../stores/auth";
import { usePublish } from "../../composables/usePublish";
import { useAppToast } from "../../composables/useAppToast";
import { useRouter } from "vue-router";
import ProfilePreview from "../ProfilePreview.vue";
import UiIcon from "../UiIcon.vue";
import {
  vibes,
  selectableVibeIds,
  getVibeCss,
  getVibeFontUrl,
  type VibeId,
} from "../../styles/vibes";
import { resolvePublicProfileUrl } from "../../utils/publicSiteUrl";

// Initialize turndown for HTML to Markdown conversion
const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
});
turndown.keep((node) => {
  if (!(node instanceof HTMLElement)) return false;
  return (
    node.hasAttribute("data-tiptap-youtube") ||
    node.hasAttribute("data-tiptap-faq") ||
    node.hasAttribute("data-tiptap-carousel")
  );
});
turndown.addRule("tiptapTaskItem", {
  filter(node) {
    return node.nodeType === 1 && node.getAttribute("data-type") === "taskItem";
  },
  replacement(content, node) {
    const input = node.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    const checked =
      node.getAttribute("data-checked") === "true" ||
      input?.checked === true ||
      input?.hasAttribute("checked") === true;
    const itemContent = content
      .trim()
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\n/g, "\n  ");

    return itemContent ? `- [${checked ? "x" : " "}] ${itemContent}\n` : "";
  },
});

type ExportedContentImage = {
  contentSlug: string;
  imageIndex: number;
  ext: string;
  blob: Blob;
  filename: string; // e.g. "about-1.webp"
};

function getImageExt(blob: Blob): string {
  return blob.type === "image/png"
    ? "png"
    : blob.type === "image/webp"
      ? "webp"
      : blob.type === "image/gif"
        ? "gif"
        : "jpg";
}

function parsePageImagesFromHtml(html: string): string[] {
  if (!html || html.trim() === "") return [];
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const imgs = Array.from(doc.querySelectorAll("img[data-image-id]"));
    const ids: string[] = [];
    for (const img of imgs) {
      const id = img.getAttribute("data-image-id");
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

function rewriteHtmlImageSrcs(
  html: string,
  contentSlug: string,
  idToIndex: Map<string, { index: number; ext: string }>,
  basePath: string = "./",
): string {
  if (!html || html.trim() === "") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  const imgs = Array.from(
    doc.querySelectorAll("img[data-image-id]"),
  ) as HTMLImageElement[];

  for (const img of imgs) {
    const id = img.getAttribute("data-image-id") || "";
    const entry = idToIndex.get(id);
    if (!entry) continue;
    img.setAttribute(
      "src",
      `${basePath}files/${contentSlug}-${entry.index}.${entry.ext}`,
    );
  }

  return doc.body.innerHTML;
}

function exportContentToMarkdown(
  content: string,
  contentSlug: string,
  images: WizardPageImage[],
  basePath: string = "./",
): {
  markdown: string;
  images: ExportedContentImage[];
} {
  const html = content || "";
  if (!html.trim()) return { markdown: "", images: [] };

  const referencedIds = parsePageImagesFromHtml(html);
  const exportedImages: ExportedContentImage[] = [];

  const idToIndex = new Map<string, { index: number; ext: string }>();
  let nextIndex = 1;

  for (const id of referencedIds) {
    const match = (images || []).find((img: WizardPageImage) => img.id === id);
    if (!match) continue;

    const index = nextIndex++;
    const ext = getImageExt(match.blob);
    idToIndex.set(id, { index, ext });

    exportedImages.push({
      contentSlug,
      imageIndex: index,
      ext,
      blob: match.blob,
      filename: `${contentSlug}-${index}.${ext}`,
    });
  }

  const rewrittenHtml =
    referencedIds.length > 0
      ? rewriteHtmlImageSrcs(html, contentSlug, idToIndex, basePath)
      : html;

  const markdown = turndown.turndown(rewrittenHtml);
  return { markdown, images: exportedImages };
}

function exportPageToMarkdown(page: WizardPage) {
  return exportContentToMarkdown(
    page.content,
    page.slug,
    page.images || [],
    "./",
  );
}

function exportPostToMarkdown(post: WizardPost) {
  return exportContentToMarkdown(
    post.content,
    post.slug,
    post.images || [],
    "../",
  );
}

function exportProductToMarkdown(product: WizardProduct) {
  return exportContentToMarkdown(
    product.content,
    product.slug,
    product.images || [],
    "../",
  );
}

const wizard = useWizardStore();
const auth = useAuthStore();
const router = useRouter();
const { isPublishing, publishProgress, publishError, publish } = usePublish();
const { toastError } = useAppToast();

const isDownloading = ref(false);

const isLoggedIn = computed(() => auth.isAuthenticated);
const canCustomizeFooter = computed(() => true);

// Footer customization modal
const showFooterModal = ref(false);

// Get preview colors for a vibe
function getVibePreviewColors(vibeId: VibeId) {
  const vibe = vibes[vibeId];
  return {
    bg: vibe.colors.bg,
    text: vibe.colors.text,
    accent: vibe.colors.accent,
    fontFamily: vibe.fontFamily,
  };
}

// Handle accent color change
function setAccentOverride(color: string) {
  wizard.setAccentOverride(color);
}

function resetAccentOverride() {
  wizard.setAccentOverride(null);
}

async function downloadZip() {
  isDownloading.value = true;

  try {
    const zip = new JSZip();

    // Generate me.json
    const me3Json = wizard.generateMe3Json();
    zip.file("me.json", JSON.stringify(me3Json, null, 2));

    // Helper to fetch image from URL and determine extension
    async function fetchImageAsBlob(
      url: string,
    ): Promise<{ blob: Blob; ext: string } | null> {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const blob = await response.blob();
        // Determine extension from content-type
        const contentType = response.headers.get("content-type") || "";
        let ext = "jpg";
        if (contentType.includes("png")) ext = "png";
        else if (contentType.includes("webp")) ext = "webp";
        else if (contentType.includes("gif")) ext = "gif";
        return { blob, ext };
      } catch {
        return null;
      }
    }

    // Add avatar - use blob if available, otherwise fetch from URL
    if (wizard.profile.avatarBlob) {
      zip.file("files/avatar.jpg", wizard.profile.avatarBlob);
    } else if (wizard.profile.avatar) {
      const result = await fetchImageAsBlob(wizard.profile.avatar);
      if (result) {
        zip.file(`files/avatar.${result.ext}`, result.blob);
        // Update me.json with correct extension
        if (me3Json.avatar) {
          me3Json.avatar = `./files/avatar.${result.ext}`;
        }
      }
    }

    // Add banner - use blob if available, otherwise fetch from URL
    if (wizard.profile.bannerBlob) {
      zip.file("files/banner.jpg", wizard.profile.bannerBlob);
    } else if (wizard.profile.banner) {
      const result = await fetchImageAsBlob(wizard.profile.banner);
      if (result) {
        zip.file(`files/banner.${result.ext}`, result.blob);
        // Update me.json with correct extension
        if (me3Json.banner) {
          me3Json.banner = `./files/banner.${result.ext}`;
        }
      }
    }

    function testimonialBlobExt(blob: Blob): string {
      return blob.type === "image/png"
        ? "png"
        : blob.type === "image/webp"
          ? "webp"
          : blob.type === "image/gif"
            ? "gif"
            : "jpg";
    }

    const publishableT = wizard.publishableTestimonials();
    for (let i = 0; i < publishableT.length; i++) {
      const t = publishableT[i];
      const slot = i + 1;
      if (t.avatarBlob) {
        const ext = testimonialBlobExt(t.avatarBlob);
        zip.file(`files/testimonial-${slot}.${ext}`, t.avatarBlob);
      } else if (t.avatar?.trim()) {
        const raw = t.avatar.trim();
        if (raw.startsWith("data:") || raw.startsWith("blob:")) continue;
        if (/^\.\/files\/testimonial-\d+\./i.test(raw)) continue;
        const result = await fetchImageAsBlob(raw);
        if (result && Array.isArray(me3Json.testimonials)) {
          zip.file(`files/testimonial-${slot}.${result.ext}`, result.blob);
          const entry = me3Json.testimonials[i] as { avatar?: string };
          if (entry) entry.avatar = `./files/testimonial-${slot}.${result.ext}`;
        }
      }
    }

    // Update me.json in case avatar/banner paths changed
    if (me3Json.links && "_avatar_variants" in me3Json.links) {
      delete me3Json.links._avatar_variants;
      if (Object.keys(me3Json.links).length === 0) {
        delete me3Json.links;
      }
    }
    zip.file("me.json", JSON.stringify(me3Json, null, 2));

    // Add favicon if it exists (fetch from published site)
    if (wizard.profile.handle) {
      try {
        const baseUrl = await resolvePublicProfileUrl(wizard.profile.handle);
        const faviconUrl = `${baseUrl.replace(/\/$/, "")}/favicon.png`;
        const faviconResult = await fetchImageAsBlob(faviconUrl);
        if (faviconResult) {
          zip.file("favicon.png", faviconResult.blob);
        }
      } catch (e) {
        console.warn("Could not fetch favicon:", e);
      }
    }

    // Add pages (convert HTML to Markdown)
    for (const page of wizard.pages) {
      const exported = exportPageToMarkdown(page);
      zip.file(`${page.slug}.md`, exported.markdown);

      // Add any page images referenced in the editor content
      for (const img of exported.images) {
        zip.file(`files/${img.filename}`, img.blob);
      }
    }

    // Add blog posts (convert HTML to Markdown)
    if (wizard.blogEnabled) {
      for (const post of wizard.posts) {
        const exported = exportPostToMarkdown(post);
        zip.file(`blog/${post.slug}.md`, exported.markdown);

        // Add any post images referenced in the editor content
        for (const img of exported.images) {
          zip.file(`files/${img.filename}`, img.blob);
        }
      }
    }

    // Add products (convert HTML to Markdown)
    if (wizard.shopEnabled) {
      for (const product of wizard.products) {
        const exported = exportProductToMarkdown(product);
        zip.file(`shop/${product.slug}.md`, exported.markdown);

        // Add any product images referenced in the editor content
        for (const img of exported.images) {
          zip.file(`files/${img.filename}`, img.blob);
        }
      }
    }

    // Add portable index.html for self-hosting with vibe CSS injected
    try {
      let portableHtml = await fetch("/portable-index.html").then((r) =>
        r.text(),
      );

      // Inject the selected vibe CSS
      const vibeCss = getVibeCss(wizard.vibe);
      const vibeFontUrl = getVibeFontUrl(wizard.vibe);
      const vibeFontLink = vibeFontUrl
        ? `<!-- Google Fonts -->\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${vibeFontUrl}">`
        : "";

      // Add accent override if set
      let cssOverrides = "";
      if (wizard.accentOverride) {
        cssOverrides += `\n/* Accent Override */\n:root, [data-theme="light"], [data-theme="dark"] { --color-accent: ${wizard.accentOverride}; --color-primary: ${wizard.accentOverride}; }`;
      }

      portableHtml = portableHtml.replace(
        "/* VIBE_CSS_PLACEHOLDER */",
        `/* Vibe: ${wizard.vibe} */\n${vibeCss}${cssOverrides}`,
      );
      portableHtml = portableHtml.replace(
        "<!-- VIBE_FONT_PLACEHOLDER -->",
        vibeFontLink,
      );

      zip.file("index.html", portableHtml);
    } catch (e) {
      console.warn("Could not fetch portable-index.html:", e);
    }

    // Add a README
    const readme = `# ${wizard.profile.name}'s me3 site

This folder contains your portable me3 site.

## Files
- \`index.html\` - Self-contained site viewer
- \`me.json\` - Your profile data (me3 protocol)
- \`favicon.png\` - Your site favicon
- \`files/\` - Your images
${wizard.pages.length > 0 ? wizard.pages.map((p) => `- \`${p.slug}.md\` - ${p.title}`).join("\n") : ""}
${wizard.blogEnabled && wizard.posts.length > 0 ? wizard.posts.map((p) => `- \`blog/${p.slug}.md\` - ${p.title}`).join("\n") : ""}
${wizard.shopEnabled && wizard.products.length > 0 ? wizard.products.map((p) => `- \`shop/${p.slug}.md\` - ${p.title}`).join("\n") : ""}

## How to publish

### Option 1: ME3 Core
1. Open your ME3 Core app
2. Sign in and claim your username
3. Upload this zip or the extracted folder

### Option 2: Self-host anywhere
Upload these files to any static hosting:
- Netlify (drag & drop the folder)
- Vercel
- GitHub Pages
- Cloudflare Pages
- Any web server

Your site is fully portable - no lock-in!

## How to view locally

1. Extract this zip to a folder
2. Start a local server in that folder:
   \`\`\`
   npx serve .
   # or: python3 -m http.server 8000
   \`\`\`
3. Open http://localhost:3000 (or :8000) in your browser

Note: Opening index.html directly (file://) won't work due to browser security.
`;
    zip.file("README.md", readme);

    // Generate the zip
    const content = await zip.generateAsync({ type: "blob" });

    // Download it
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${wizard.profile.handle || "my-me3-site"}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Download error:", error);
    toastError("Failed to generate zip file");
  } finally {
    isDownloading.value = false;
  }
}

async function publishToMe3() {
  if (!isLoggedIn.value) {
    // Save state and redirect to login
    wizard.saveToStorage();
    router.push("/login?redirect=/create");
    return;
  }

  // Use the composable's publish function with celebration and site opening
  const success = await publish({ openSite: true });
  if (success) {
    const siteName =
      wizard.username?.trim() || wizard.profile.handle?.trim() || "";
    if (siteName) {
      router.push(`/sites/${encodeURIComponent(siteName)}`);
    } else {
      router.push("/calendar");
    }
  }
}

function openFooterModal() {
  showFooterModal.value = true;
}

function closeFooterModal() {
  showFooterModal.value = false;
}
</script>

<template>
  <div class="step-publish">
    <h2>Your site is ready!</h2>
    <p class="step-desc">Choose a vibe, then publish or download.</p>

    <!-- Vibe Selector -->
    <div class="vibe-section">
      <div class="vibe-grid">
        <div
          v-for="vibeId in selectableVibeIds"
          :key="vibeId"
          class="vibe-card"
          :class="{ selected: wizard.vibe === vibeId }"
        >
          <button class="vibe-card-btn" @click="wizard.setVibe(vibeId)">
            <div
              class="vibe-preview"
              :style="{
                background: getVibePreviewColors(vibeId).bg,
                color: getVibePreviewColors(vibeId).text,
                fontFamily: getVibePreviewColors(vibeId).fontFamily,
              }"
            >
              <div class="vibe-preview-name">Aa</div>
            </div>
            <div class="vibe-info">
              <span class="vibe-name">{{ vibes[vibeId].name }}</span>
              <span class="vibe-check" v-if="wizard.vibe === vibeId">
                <UiIcon name="Check" :size="16" />
              </span>
            </div>
          </button>
          <!-- Clickable accent dot with color picker -->
          <label
            class="vibe-preview-accent"
            :class="{ 'is-selected': wizard.vibe === vibeId }"
            :style="{
              background:
                wizard.accentOverride && wizard.vibe === vibeId
                  ? wizard.accentOverride
                  : getVibePreviewColors(vibeId).accent,
            }"
            :title="
              wizard.vibe === vibeId
                ? 'Click to customize accent color'
                : 'Select this vibe first'
            "
            @click.stop="wizard.vibe !== vibeId && wizard.setVibe(vibeId)"
          >
            <input
              v-if="wizard.vibe === vibeId"
              type="color"
              :value="
                wizard.accentOverride || getVibePreviewColors(vibeId).accent
              "
              @input="
                setAccentOverride(($event.target as HTMLInputElement).value)
              "
              @click.stop
              class="accent-color-input"
            />
          </label>
        </div>
      </div>

      <!-- Accent reset button (shown when overridden) -->
      <div v-if="wizard.accentOverride" class="accent-reset-row">
        <button class="reset-btn" @click="resetAccentOverride">
          Reset accent color
        </button>
      </div>
    </div>

    <!-- Preview -->
    <div class="publish-preview">
      <ProfilePreview
        :profile="wizard.profile"
        :pages="wizard.pages"
        :posts="wizard.posts"
        :blogEnabled="wizard.blogEnabled"
        :blogTitle="wizard.blogTitle"
        :products="wizard.products"
        :shopEnabled="wizard.shopEnabled"
        :shopTitle="wizard.shopTitle"
        :testimonials="wizard.testimonials"
        :testimonialsEnabled="wizard.testimonialsEnabled"
        :testimonialsPlacement="wizard.testimonialsPlacement"
        :testimonialsTitle="wizard.testimonialsTitle"
        :vibe="wizard.vibe"
        :isPro="canCustomizeFooter"
        :accentOverride="wizard.accentOverride"
        @edit-footer="openFooterModal"
      />
    </div>

    <div class="publish-actions">
      <div class="publish-action">
        <button
          class="btn primary"
          :disabled="isPublishing"
          @click="publishToMe3"
        >
          {{
            isPublishing
              ? "Publishing..."
              : isLoggedIn
                ? "Publish now"
                : "Sign in to publish"
          }}
        </button>
        <p v-if="publishProgress" class="progress">
          {{ publishProgress }}
        </p>
        <p v-if="publishError" class="error">
          {{ publishError }}
        </p>
      </div>

      <div class="publish-action">
        <button
          class="btn secondary"
          :disabled="isDownloading"
          @click="downloadZip"
        >
          {{ isDownloading ? "Preparing..." : "Download .zip" }}
        </button>
      </div>
    </div>

    <!-- Footer Customization Modal -->
    <div
      v-if="showFooterModal"
      class="modal-overlay"
      @click.self="closeFooterModal"
    >
      <div class="modal">
        <div class="modal-header">
          <h3>Footer Settings</h3>
          <button class="modal-close" type="button" @click="closeFooterModal">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="modal-content">
          <p class="modal-desc">
            Customize or remove the footer for this Core-published site.
          </p>

          <div class="footer-controls" :class="{ disabled: !canCustomizeFooter }">
            <label class="footer-option">
              <input
                type="radio"
                name="footerMode"
                value="default"
                :checked="wizard.profile.footer.mode === 'default'"
                :disabled="!canCustomizeFooter"
                @change="wizard.setFooter({ mode: 'default' })"
              />
              Keep "Powered by me3"
            </label>

            <label class="footer-option">
              <input
                type="radio"
                name="footerMode"
                value="custom"
                :checked="wizard.profile.footer.mode === 'custom'"
                :disabled="!canCustomizeFooter"
                @change="wizard.setFooter({ mode: 'custom' })"
              />
              Custom text / link
            </label>

            <div
              v-if="wizard.profile.footer.mode === 'custom'"
              class="footer-custom"
            >
              <label class="footer-field">
                <span>Text</span>
                <input
                  type="text"
                  :disabled="!canCustomizeFooter"
                  :value="wizard.profile.footer.text"
                  placeholder="e.g. Built by Jane"
                  @input="
                    wizard.setFooter({
                      text: ($event.target as HTMLInputElement).value,
                    })
                  "
                />
              </label>

              <div class="footer-field-row">
                <label class="footer-field">
                  <span>Link text</span>
                  <input
                    type="text"
                    :disabled="!canCustomizeFooter"
                    :value="wizard.profile.footer.linkText"
                    placeholder="e.g. janedoe.com"
                    @input="
                      wizard.setFooter({
                        linkText: ($event.target as HTMLInputElement).value,
                      })
                    "
                  />
                </label>

                <label class="footer-field">
                  <span>Link URL</span>
                  <input
                    type="url"
                    :disabled="!canCustomizeFooter"
                    :value="wizard.profile.footer.linkUrl"
                    placeholder="https://janedoe.com"
                    @input="
                      wizard.setFooter({
                        linkUrl: ($event.target as HTMLInputElement).value,
                      })
                    "
                  />
                </label>
              </div>
            </div>

            <label class="footer-option">
              <input
                type="radio"
                name="footerMode"
                value="none"
                :checked="wizard.profile.footer.mode === 'none'"
                :disabled="!canCustomizeFooter"
                @change="wizard.setFooter({ mode: 'none' })"
              />
              No footer
            </label>
          </div>

        </div>

        <div class="modal-footer">
          <button class="btn secondary" type="button" @click="closeFooterModal">
            Done
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step-publish {
  margin: 0 auto;
  max-width: 600px;
  width: 100%;
}

.step-publish h2 {
  font-size: 28px;
  margin-bottom: 8px;
  text-align: center;
}

/* Vibe Selector */
.vibe-section {
  margin-bottom: 32px;
}

.vibe-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-muted);
  margin-bottom: 12px;
  text-align: center;
}

.vibe-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

@media (min-width: 600px) {
  .vibe-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* Footer */
.footer-section {
  margin: 28px 0 32px;
}

.footer-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-muted);
  margin-bottom: 6px;
  text-align: center;
}

.footer-desc {
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
  margin-bottom: 12px;
}

.footer-controls {
  background: var(--color-border);
  border-radius: 12px;
  padding: 14px;
  display: grid;
  gap: 10px;
}

.footer-controls.disabled {
  opacity: 0.6;
}

.footer-option {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 14px;
}

.footer-custom {
  padding-left: 26px;
  display: grid;
  gap: 10px;
}

.footer-field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.footer-field input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 14px;
}

.footer-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.footer-upgrade {
  margin-top: 10px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
}

.footer-upgrade .btn {
  margin-top: 10px;
}

@media (max-width: 500px) {
  .footer-field-row {
    grid-template-columns: 1fr;
  }
}

.vibe-card {
  display: flex;
  flex-direction: column;
  border: 2px solid var(--color-border);
  border-radius: 12px;
  overflow: hidden;
  transition:
    border-color 0.2s,
    transform 0.2s;
  background: var(--color-bg);
  position: relative;
}

.vibe-card:hover {
  border-color: var(--color-text-muted);
}

.vibe-card.selected {
  border-color: var(--color-text);
}

.vibe-card-btn {
  display: flex;
  flex-direction: column;
  width: 100%;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
}

.vibe-preview {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.vibe-preview-name {
  font-size: 24px;
  font-weight: 600;
}

.vibe-preview-accent {
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  cursor: pointer;
  transition:
    transform 0.15s,
    box-shadow 0.15s;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.vibe-preview-accent:hover {
  transform: scale(1.2);
}

.vibe-preview-accent.is-selected {
  cursor: pointer;
  box-shadow:
    0 0 0 2px var(--color-bg),
    0 0 0 3px currentColor;
}

.vibe-preview-accent.is-selected:hover {
  transform: scale(1.3);
}

.accent-color-input {
  position: absolute;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.vibe-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-top: 1px solid var(--color-border);
}

.vibe-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.vibe-check {
  font-size: 14px;
  color: var(--color-text);
}

.accent-reset-row {
  margin-top: 12px;
  text-align: center;
}

/* Theme Mode Selector */
.theme-mode-section {
  margin-top: 20px;
  text-align: center;
}

.customize-subtitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
  margin-bottom: 10px;
}

.theme-mode-buttons {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--color-border);
  border-radius: 10px;
}

.theme-mode-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.theme-mode-btn:hover {
  color: var(--color-text);
}

.theme-mode-btn.active {
  background: var(--color-bg);
  color: var(--color-text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.reset-btn {
  padding: 6px 12px;
  border: 1px solid var(--color-text-muted);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn:hover {
  border-color: var(--color-text);
  color: var(--color-text);
}

.step-desc {
  color: var(--color-text-muted);
  margin-bottom: 24px;
  text-align: center;
}

.publish-preview {
  max-width: 400px;
  margin: 0 auto 32px;
}

.publish-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 400px;
  margin: 0 auto;
}

.publish-action {
  width: 100%;
}

.btn {
  width: 100%;
  padding: 14px 20px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--color-text);
  color: var(--color-bg);
}

.btn.secondary {
  background: var(--color-border);
  color: var(--color-text);
}

.progress {
  margin-top: 10px;
  color: var(--color-text-muted);
  font-size: 13px;
}

.error {
  margin-top: 12px;
  color: #e53935;
  font-size: 13px;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal {
  background: var(--color-bg);
  border-radius: 16px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h3 {
  font-size: 18px;
  font-weight: 600;
}

.modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--color-text-muted);
  transition:
    background 0.2s,
    color 0.2s;
}

.modal-close:hover {
  background: var(--color-border);
  color: var(--color-text);
}

.modal-close svg {
  width: 18px;
  height: 18px;
}

.modal-content {
  padding: 24px;
  overflow-y: auto;
}

.modal-desc {
  color: var(--color-text-muted);
  font-size: 14px;
  margin-bottom: 20px;
  line-height: 1.5;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.modal-footer .btn {
  width: auto;
  padding: 10px 20px;
  font-size: 14px;
}
</style>
