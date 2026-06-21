import { ref } from "vue";
import TurndownService from "turndown";
import { useWizardStore, type WizardPageImage } from "../stores/wizard";
import { productSendsPurchaseConfirmation } from "../../../../shared/product-purchase-confirmation";
import { useSitesStore, type PublishManifest } from "../stores/sites";
import { resolvePublicProfileUrl } from "../utils/publicSiteUrl";

type ExportedContentImage = {
  contentSlug: string;
  imageIndex: number;
  ext: string;
  blob: Blob;
  filename: string;
};

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

function createEmptyPublishManifest(): PublishManifest {
  return {
    version: 1,
    sourceFiles: {},
    assetFiles: {},
    updatedAt: "",
  };
}

async function sha256Blob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Text(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

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

function validateShopConfirmationEmails(
  wizard: ReturnType<typeof useWizardStore>,
): string | null {
  if (!wizard.shopEnabled) return null;
  for (const p of wizard.products) {
    const ce = p.confirmationEmail;
    if (ce?.enabled === true && !productSendsPurchaseConfirmation(ce)) {
      return `Offerings — "${p.title}": add both a subject and message for the purchase confirmation email, or turn the option off.`;
    }
  }
  return null;
}

export function usePublish() {
  const wizard = useWizardStore();
  const sites = useSitesStore();

  const isPublishing = ref(false);
  const publishProgress = ref<string | null>(null);
  const publishError = ref<string | null>(null);

  function triggerCelebration() {
    const emojis = ["🎉", "🎊", "✨", "🌟", "💫", "🎈"];
    const container = document.createElement("div");
    container.className = "celebration-container";
    document.body.appendChild(container);

    // Create 50 emoji elements
    for (let i = 0; i < 50; i++) {
      const emoji = document.createElement("div");
      emoji.className = "celebration-emoji";
      emoji.textContent = emojis[Math.floor(Math.random() * emojis.length)];

      // Random starting position near center
      const startX = window.innerWidth / 2 + (Math.random() - 0.5) * 100;
      const startY = window.innerHeight / 2;

      // Random end position
      const endX = Math.random() * window.innerWidth;
      const endY = Math.random() * window.innerHeight;

      // Random animation duration and delay
      const duration = 1.5 + Math.random() * 1;
      const delay = Math.random() * 0.3;

      emoji.style.left = `${startX}px`;
      emoji.style.top = `${startY}px`;
      emoji.style.setProperty("--end-x", `${endX - startX}px`);
      emoji.style.setProperty("--end-y", `${endY - startY}px`);
      emoji.style.animationDuration = `${duration}s`;
      emoji.style.animationDelay = `${delay}s`;

      container.appendChild(emoji);
    }

    // Remove container after animation completes
    setTimeout(() => {
      container.remove();
    }, 3000);
  }

  async function publish(
    options: { celebrate?: boolean; openSite?: boolean } = {},
  ): Promise<boolean> {
    const { celebrate = true, openSite = false } = options;

    isPublishing.value = true;
    publishError.value = null;
    publishProgress.value = null;

    try {
      const username = wizard.username;

      const shopConfirmationError = validateShopConfirmationEmails(wizard);
      if (shopConfirmationError) {
        throw new Error(shopConfirmationError);
      }

      // First, check if site exists or needs to be claimed
      await sites.fetchSites();
      const existingSite = sites.sites.find((s) => s.username === username);

      if (!existingSite) {
        publishProgress.value = "Claiming username...";
        const existingProfileSite = sites.sites.find(
          (site) => (site.site_type || "profile") === "profile",
        );
        const claimed = await sites.claimUsername(username, {
          ...(existingProfileSite &&
          existingProfileSite.username !== username
            ? {
                siteType: "profile",
                renameFromUsername: existingProfileSite.username,
              }
            : {}),
        });
        if (!claimed) {
          throw new Error(sites.error || "Failed to claim username");
        }
      }

      const publishManifest =
        (await sites.fetchPublishManifest(username)) || createEmptyPublishManifest();

      if (wizard.profile.avatarBlob) {
        const avatarFilename = `avatar.${getImageExt(wizard.profile.avatarBlob)}`;
        const avatarHash = await sha256Blob(wizard.profile.avatarBlob);
        if (publishManifest.assetFiles[avatarFilename] !== avatarHash) {
          publishProgress.value = "Uploading avatar...";
          await sites.uploadImage(username, wizard.profile.avatarBlob, "avatar");
        }
      }

      // Upload banner if exists
      if (wizard.profile.bannerBlob) {
        const bannerFilename = `banner.${getImageExt(wizard.profile.bannerBlob)}`;
        const bannerHash = await sha256Blob(wizard.profile.bannerBlob);
        if (publishManifest.assetFiles[bannerFilename] !== bannerHash) {
          publishProgress.value = "Uploading banner...";
          await sites.uploadImage(username, wizard.profile.bannerBlob, "banner");
        }
      }

      const publishableT = wizard.publishableTestimonials();
      for (let i = 0; i < publishableT.length; i++) {
        const t = publishableT[i];
        if (!t.avatarBlob) continue;
        const slot = i + 1;
        const ext = getImageExt(t.avatarBlob);
        const filename = `testimonial-${slot}.${ext}`;
        const hash = await sha256Blob(t.avatarBlob);
        if (publishManifest.assetFiles[filename] !== hash) {
          publishProgress.value = `Uploading testimonial photo ${slot}/${publishableT.length}…`;
          const result = await sites.uploadImage(
            username,
            t.avatarBlob,
            "testimonial",
            { testimonialIndex: slot },
          );
          if (!result?.ok) {
            throw new Error(sites.error || "Failed to upload testimonial image");
          }
        }
      }

      // Convert pages/posts/products to markdown and gather referenced images
      const exportedPages = wizard.pages.map((p) => ({
        page: p,
        exported: exportContentToMarkdown(
          p.content,
          p.slug,
          p.images || [],
          "./",
        ),
      }));

      const exportedPosts = wizard.blogEnabled
        ? wizard.posts
            .map((p) => ({
            post: p,
            exported: exportContentToMarkdown(
              p.content,
              p.slug,
              p.images || [],
              "../",
            ),
            }))
        : [];

      const exportedProducts = wizard.shopEnabled
        ? wizard.products.map((p) => ({
            product: p,
            exported: exportContentToMarkdown(
              p.content,
              p.slug,
              p.images || [],
              "../",
            ),
          }))
        : [];

      const allPageImages = exportedPages.flatMap((p) => p.exported.images);
      const allPostImages = exportedPosts.flatMap((p) => p.exported.images);
      const allProductImages = exportedProducts.flatMap(
        (p) => p.exported.images,
      );
      const allContentImages = [
        ...allPageImages,
        ...allPostImages,
        ...allProductImages,
      ];

      const changedContentImages: typeof allContentImages = [];
      for (const img of allContentImages) {
        const hash = await sha256Blob(img.blob);
        if (publishManifest.assetFiles[img.filename] !== hash) {
          changedContentImages.push(img);
        }
      }

      if (changedContentImages.length > 0) {
        let done = 0;
        for (const img of changedContentImages) {
          done += 1;
          publishProgress.value = `Uploading images: ${done}/${changedContentImages.length}`;

          const result = await sites.uploadPageImage(
            username,
            img.blob,
            img.contentSlug,
            img.imageIndex,
          );

          if (!result?.ok) {
            throw new Error(sites.error || "Failed to upload page image");
          }
        }
      }

      // Upload video posts to Cloudflare Stream (if any)
      const videoPosts = wizard.posts
        .map((post, index) => ({ post, index }))
        .filter(({ post }) => post.type === "video" && post.mediaFile);

      if (videoPosts.length > 0) {
        let done = 0;
        for (const { post, index } of videoPosts) {
          done += 1;
          publishProgress.value = `Uploading videos: ${done}/${videoPosts.length}`;

          const upload = await sites.createStreamUpload(username, 3600);
          if (!upload?.uploadURL || !upload.uid) {
            throw new Error("Failed to create Stream upload");
          }

          const formData = new FormData();
          const fileName = post.mediaFile?.name || `${post.slug}.mp4`;
          formData.append("file", post.mediaFile as File, fileName);

          const uploadResponse = await fetch(upload.uploadURL, {
            method: "POST",
            body: formData,
          });

          if (!uploadResponse.ok) {
            throw new Error("Failed to upload video to Stream");
          }

          const details = await sites.finalizeStreamUpload(username, upload.uid);

          wizard.updatePost(index, {
            media: {
              url: details?.playerUrl ?? undefined,
              thumbnail: details?.thumbnail ?? undefined,
              duration: details?.duration ?? undefined,
              provider: "stream",
              id: upload.uid,
            },
            mediaFile: null,
          });
        }
      }

      // Generate me.json and create File objects for upload
      publishProgress.value = "Uploading files...";
      const me3Json = wizard.generateMe3Json();
      if (me3Json.links && "_avatar_variants" in me3Json.links) {
        me3Json.links = {
          ...(me3Json.links || {}),
          _avatar_variants: undefined,
        };
        delete me3Json.links._avatar_variants;
        if (Object.keys(me3Json.links).length === 0) delete me3Json.links;
      }
      const me3File = new File([JSON.stringify(me3Json, null, 2)], "me.json", {
        type: "application/json",
      });

      const files: File[] = [me3File];

      // Add pages (convert HTML to Markdown)
      for (const { page, exported } of exportedPages) {
        const markdown = exported.markdown;
        files.push(
          new File([markdown], `${page.slug}.md`, { type: "text/markdown" }),
        );
      }

      // Add blog posts (convert HTML to Markdown)
      for (const { post, exported } of exportedPosts) {
        const markdown = exported.markdown;
        files.push(
          new File([markdown], `blog/${post.slug}.md`, {
            type: "text/markdown",
          }),
        );
      }

      // Add products (convert HTML to Markdown)
      for (const { product, exported } of exportedProducts) {
        const markdown = exported.markdown;
        files.push(
          new File([markdown], `shop/${product.slug}.md`, {
            type: "text/markdown",
          }),
        );
      }

      const changedFiles: File[] = [];
      for (const file of files) {
        const content = await file.text();
        const hash = await sha256Text(content);
        if (publishManifest.sourceFiles[file.name] !== hash) {
          changedFiles.push(
            new File([content], file.name, {
              type: file.type || "text/plain",
            }),
          );
        }
      }

      if (changedFiles.length > 0) {
        const success = await sites.uploadSite(username, changedFiles);

        if (!success) {
          throw new Error(sites.error || "Failed to upload site");
        }
      }

      // Mark as published in wizard store
      wizard.markAsPublished();

      const siteUrl = await resolvePublicProfileUrl(username);

      // Trigger celebration animation if enabled
      if (celebrate) {
        triggerCelebration();
      }

      // Open the published site in a new tab if enabled
      if (openSite) {
        setTimeout(() => {
          window.open(siteUrl, "_blank");
        }, 900);
      }

      return true;
    } catch (error: any) {
      publishError.value = error.message || "Failed to publish";
      return false;
    } finally {
      isPublishing.value = false;
      publishProgress.value = null;
    }
  }

  return {
    isPublishing,
    publishProgress,
    publishError,
    publish,
    triggerCelebration,
  };
}
