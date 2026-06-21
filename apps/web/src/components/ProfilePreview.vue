<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import type {
  WizardProfile,
  WizardPage,
  WizardPost,
  WizardProduct,
  WizardTestimonial,
} from "../stores/wizard";
import EmblaCarousel, { type EmblaCarouselType } from "embla-carousel";
import {
  getVibeColorScheme,
  getVibeCss,
  vibes,
  getVibeFontUrl,
  type VibeId,
} from "../styles/vibes";
import {
  buildPlatformUrl,
  getPlatformConfig,
  PLATFORM_ICONS,
} from "../utils/link-validation";
import {
  getStoredTestimonialPlacement,
  normalizeTestimonialPlacement,
  resolveSiteSectionPaths,
  type TestimonialPlacement,
} from "../utils/site-sections";
import UiIcon from "./UiIcon.vue";
import TestimonialCard from "./TestimonialCard.vue";
import { isUiIconName, type UiIconName } from "../utils/icons";
import { formatPublicLocation } from "../utils/location-display";

const props = defineProps<{
  profile: WizardProfile;
  pages?: WizardPage[];
  posts?: WizardPost[];
  products?: WizardProduct[];
  testimonials?: WizardTestimonial[];
  blogEnabled?: boolean;
  blogTitle?: string;
  shopEnabled?: boolean;
  shopTitle?: string;
  testimonialsEnabled?: boolean;
  testimonialsPlacement?: TestimonialPlacement;
  testimonialsTitle?: string;
  compact?: boolean;
  vibe?: VibeId;
  isPro?: boolean;
  accentOverride?: string | null;
  activeView?: string | null;
}>();

// Current view: 'home' or a page slug
const currentView = ref<string>("home");
const giftModalOpen = ref(false);

function openGiftModal() {
  giftModalOpen.value = true;
}

function closeGiftModal() {
  giftModalOpen.value = false;
}

const displayLocation = computed(() => formatPublicLocation(props.profile));

function getCurrencySymbol(currency: "USD" | "GBP" | "EUR" | "CAD" | "AUD" | "CHF" | "SGD" | "INR" | "PKR"): string {
  switch (currency) {
    case "GBP":
      return "£";
    case "EUR":
      return "€";
    case "CAD":
      return "C$";
    case "AUD":
      return "A$";
    case "CHF":
      return "Fr.";
    case "SGD":
      return "S$";
    case "INR":
      return "₹";
    case "PKR":
      return "Rs";
    default:
      return "$";
  }
}

watch(
  () => props.activeView,
  (value) => {
    if (typeof value === "string" && value.trim()) {
      currentView.value = value;
    }
  },
  { immediate: true },
);

// Get platform icon (SVG path or UiIcon name)
function getPlatformIcon(platform: string, label = ""): string {
  const config = getPlatformConfig(platform);
  const labelConfig = getPlatformConfig(label.toLowerCase());
  if (config && config.key !== "website") return config.icon;
  return labelConfig?.icon || config?.icon || PLATFORM_ICONS.link;
}

function formatLinkHref(platform: string, value: string): string {
  if (platform.startsWith("custom_")) {
    return value.startsWith("http") ? value : `https://${value}`;
  }
  if (getPlatformConfig(platform)) {
    return buildPlatformUrl(platform, value);
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return value;
}

function formatLinkLabel(platform: string, value: string): string {
  const customLabel = props.profile.links?.[`${platform}_label`];
  if (customLabel) return customLabel;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      return new URL(value).hostname.replace("www.", "");
    } catch {
      return value;
    }
  }

  const labels: Record<string, string> = {
    twitter: `@${value}`,
    instagram: `@${value}`,
    tiktok: `@${value}`,
  };

  return labels[platform] || value;
}

// Parse simple inline markdown (links only) for bio text
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseInlineMarkdown(str: string): string {
  if (!str) return "";
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let result = "";
  let lastIndex = 0;
  let match;
  while ((match = linkRegex.exec(str)) !== null) {
    result += escapeHtml(str.slice(lastIndex, match.index));
    const linkText = escapeHtml(match[1]);
    const linkUrl = match[2];
    result += `<a href="${linkUrl}" target="_blank" rel="noopener">${linkText}</a>`;
    lastIndex = match.index + match[0].length;
  }
  result += escapeHtml(str.slice(lastIndex));
  return result;
}

const parsedBio = computed(() => parseInlineMarkdown(props.profile.bio || ""));

const visibleLinks = computed(() =>
  Object.entries(props.profile.links || {}).filter(
    ([key, value]) =>
      !key.startsWith("_") && !key.endsWith("_label") && value && value.trim(),
  ),
);

const resolvedTestimonials = computed(
  () =>
    props.testimonials ||
    (props.profile as WizardProfile & { testimonials?: WizardTestimonial[] })
      .testimonials ||
    [],
);
const testimonialsPlacement = computed(
  () =>
    normalizeTestimonialPlacement(
      props.testimonialsPlacement ||
        getStoredTestimonialPlacement(props.profile as {
          testimonialDisplay?: unknown;
          links?: Record<string, unknown>;
        }),
      {
        blogEnabled: props.blogEnabled !== false,
        shopEnabled: props.shopEnabled !== false,
        pages: props.pages || [],
      },
    ),
);
const testimonialsTitle = computed(() => {
  const raw =
    props.testimonialsTitle ||
    (props.profile as WizardProfile & { testimonialsTitle?: string })
      .testimonialsTitle;
  return typeof raw === "string" && raw.trim().length > 0
    ? raw.trim()
    : "Testimonials";
});
const testimonialsEnabled = computed(() => props.testimonialsEnabled !== false);
const hasTestimonials = computed(
  () => testimonialsEnabled.value && resolvedTestimonials.value.length > 0,
);
const blogTitle = computed(() => {
  const raw =
    props.blogTitle ||
    (props.profile as WizardProfile & { blogTitle?: string }).blogTitle;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "Blog";
});
const shopTitle = computed(() => {
  const raw =
    props.shopTitle ||
    (props.profile as WizardProfile & { shopTitle?: string }).shopTitle;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "Shop";
});
const sectionPaths = computed(() =>
  resolveSiteSectionPaths({
    pages: props.pages || [],
    blogTitle: blogTitle.value,
    shopTitle: shopTitle.value,
    testimonialsTitle: testimonialsTitle.value,
  }),
);
const blogPath = computed(() => sectionPaths.value.blog);
const shopPath = computed(() => sectionPaths.value.shop);
const testimonialsPath = computed(() => sectionPaths.value.testimonials);
watch(
  [blogPath, shopPath, testimonialsPath],
  ([nextBlogPath, nextShopPath, nextTestimonialsPath], previousPaths) => {
    if (!previousPaths) return;

    const [previousBlogPath, previousShopPath, previousTestimonialsPath] =
      previousPaths;
    if (!previousBlogPath || !previousShopPath || !previousTestimonialsPath) {
      return;
    }

    if (currentView.value === previousBlogPath) {
      currentView.value = nextBlogPath;
      return;
    }
    if (currentView.value.startsWith(`${previousBlogPath}:`)) {
      currentView.value = currentView.value.replace(
        `${previousBlogPath}:`,
        `${nextBlogPath}:`,
      );
      return;
    }
    if (currentView.value === previousShopPath) {
      currentView.value = nextShopPath;
      return;
    }
    if (currentView.value.startsWith(`${previousShopPath}:`)) {
      currentView.value = currentView.value.replace(
        `${previousShopPath}:`,
        `${nextShopPath}:`,
      );
      return;
    }
    if (currentView.value === previousTestimonialsPath) {
      currentView.value = nextTestimonialsPath;
    }
  },
);
const testimonialsStandalone = computed(
  () => hasTestimonials.value && testimonialsPlacement.value === "standalone",
);
const showTestimonialsOnHomepage = computed(
  () => hasTestimonials.value && testimonialsPlacement.value === "homepage",
);

// Check if newsletter is enabled
const hasNewsletter = computed(() => props.profile.newsletter?.enabled);

// Check if booking is enabled
// Support both WizardProfile format (booking.enabled) and Me3Profile format (intents.book.enabled)
const hasBooking = computed(() => {
  const booking = (props.profile as any).booking;
  const intents = (props.profile as any).intents;
  return booking?.enabled || intents?.book?.enabled;
});

type PreviewBookingOffer = {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  pricing?: {
    enabled?: boolean;
    suggestedAmount?: number;
    currency?: "USD" | "GBP" | "EUR" | "CAD" | "AUD" | "CHF" | "SGD" | "INR" | "PKR";
    allowFlexiblePricing?: boolean;
  };
};

type PreviewBookingClass = PreviewBookingOffer & {
  recurrence?: {
    frequency?: "weekly" | "biweekly";
    weekday?: string;
    startTime?: string;
  };
  capacity?: number | null;
};

type PreviewBookingRetreat = PreviewBookingOffer & {
  durationDays?: number;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  timezone?: string;
  capacity?: number | null;
};

type PreviewBookingType = {
  id: "one_to_one" | "class" | "retreat";
  label: string;
  title?: string;
  description?: string;
  offers?: PreviewBookingOffer[];
  classes?: PreviewBookingClass[];
  retreats?: PreviewBookingRetreat[];
};

function parseRetreatWallDateTime(
  date: string | undefined,
  time: string | undefined,
): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;

  const timestamp = Date.parse(`${date}T${time}:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function derivePreviewRetreatDurationDays(
  retreat: PreviewBookingRetreat,
): number {
  const startMs = parseRetreatWallDateTime(retreat.startDate, retreat.startTime);
  const endMs = parseRetreatWallDateTime(retreat.endDate, retreat.endTime);

  if (startMs !== null && endMs !== null && endMs > startMs) {
    return Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)));
  }

  if (
    typeof retreat.durationDays === "number" &&
    Number.isFinite(retreat.durationDays) &&
    retreat.durationDays >= 1
  ) {
    return Math.round(retreat.durationDays);
  }

  return 1;
}

function normalizePreviewRetreats(input: unknown): PreviewBookingRetreat[] {
  if (!Array.isArray(input)) return [];

  return input.map((item) => {
    const retreat = (item || {}) as PreviewBookingRetreat;
    return {
      ...retreat,
      durationDays: derivePreviewRetreatDurationDays(retreat),
    };
  });
}

const activeBookingTypeId = ref<PreviewBookingType["id"] | null>(null);

const bookingConfig = computed(() => {
  const booking = (props.profile as any).booking;
  if (booking?.enabled) {
    const bookingTypes: PreviewBookingType[] = [];

    if (booking.oneToOneEnabled) {
      const offers = Array.isArray(booking.offers) && booking.offers.length > 0
        ? booking.offers
        : [
            {
              id: "book-session",
              title: booking.title || "Book a call",
              description: booking.description || "",
              duration: booking.duration || 30,
              pricing: booking.pricing,
            },
          ];
      bookingTypes.push({
        id: "one_to_one",
        label: "1:1",
        title: (booking.title && String(booking.title).trim()) || "1:1",
        description:
          (booking.description && String(booking.description).trim()) || "",
        offers,
      });
    }

    if (booking.classEnabled) {
      bookingTypes.push({
        id: "class",
        label: "Classes",
        title: "Classes",
        classes: Array.isArray(booking.classOffers) ? booking.classOffers : [],
      });
    }

    if (booking.retreatEnabled) {
      bookingTypes.push({
        id: "retreat",
        label: "Retreats",
        title: "Retreats",
        retreats: normalizePreviewRetreats(booking.retreatOffers),
      });
    }

    return bookingTypes.length > 0
      ? {
          bookingTypes,
          hasExternalUrl: false,
          hasAvailability: bookingTypes.some((item) => item.id === "one_to_one"),
          url: null,
        }
      : null;
  }

  const intents = (props.profile as any).intents;
  if (intents?.book?.enabled) {
    const explicitTypes = Array.isArray(intents.book.bookingTypes)
      ? intents.book.bookingTypes
      : [];
    const bookingTypes: PreviewBookingType[] = [];

    for (const item of explicitTypes) {
      if (item?.type === "one_to_one") {
        bookingTypes.push({
          id: "one_to_one",
          label: item.label || "1:1",
          title: item.title || intents.book.title || "1:1",
          description: item.description || intents.book.description || "",
          offers: Array.isArray(item.offers) ? item.offers : [],
        });
      }
      if (item?.type === "class") {
        bookingTypes.push({
          id: "class",
          label: item.label || "Classes",
          title: item.title || "Classes",
          description: item.description || "",
          classes: Array.isArray(item.classes) ? item.classes : [],
        });
      }
      if (item?.type === "retreat") {
        bookingTypes.push({
          id: "retreat",
          label: item.label || "Retreats",
          title: item.title || "Retreats",
          description: item.description || "",
          retreats: normalizePreviewRetreats(item.retreats),
        });
      }
    }

    if (
      bookingTypes.length === 0 &&
      (Array.isArray(intents.book.offers) || intents.book.availability?.windows)
    ) {
      const offers =
        Array.isArray(intents.book.offers) && intents.book.offers.length > 0
          ? intents.book.offers
          : [
              {
                id: "book-session",
                title: intents.book.title || "Book a call",
                description: intents.book.description || "",
                duration: intents.book.duration || 30,
                pricing: intents.book.pricing,
              },
            ];
      bookingTypes.push({
        id: "one_to_one",
        label: "1:1",
        title: intents.book.title || "1:1",
        description: intents.book.description || "",
        offers,
      });
    }

    if (
      bookingTypes.length === 0 &&
      Array.isArray(intents.book.classes) &&
      intents.book.classes.length > 0
    ) {
      bookingTypes.push({
        id: "class",
        label: "Classes",
        title: "Classes",
        classes: intents.book.classes,
      });
    }

    if (
      bookingTypes.length === 0 &&
      Array.isArray(intents.book.retreats) &&
      intents.book.retreats.length > 0
    ) {
      bookingTypes.push({
        id: "retreat",
        label: "Retreats",
        title: "Retreats",
        retreats: normalizePreviewRetreats(intents.book.retreats),
      });
    }

    return bookingTypes.length > 0
      ? {
          bookingTypes,
          hasAvailability: !!intents.book.availability?.windows,
          hasExternalUrl: !!intents.book.url,
          url: intents.book.url || null,
        }
      : null;
  }

  return null;
});

watch(
  bookingConfig,
  (value) => {
    const typeIds = value?.bookingTypes.map((item) => item.id) || [];
    if (!typeIds.length) {
      activeBookingTypeId.value = null;
      return;
    }
    if (!activeBookingTypeId.value || !typeIds.includes(activeBookingTypeId.value)) {
      activeBookingTypeId.value = typeIds[0] || null;
    }
  },
  { immediate: true },
);

const activeBookingType = computed(() =>
  bookingConfig.value?.bookingTypes.find((item) => item.id === activeBookingTypeId.value) ||
  bookingConfig.value?.bookingTypes[0] ||
  null,
);

const giftConfig = computed(() => {
  const profileAny = props.profile as any;
  const gift = profileAny.gift;
  if (gift?.enabled) {
    return {
      title: gift.title || "Send a gift",
      description: gift.description || "",
      suggestedAmount: gift.suggestedAmount || 10,
      currency: gift.currency || "USD",
      icon: gift.icon || "",
    };
  }

  const intentGift = profileAny.intents?.gift;
  if (intentGift?.enabled) {
    return {
      title: intentGift.title || "Send a gift",
      description: intentGift.description || "",
      suggestedAmount: intentGift.suggestedAmount || 10,
      currency: intentGift.currency || "USD",
      icon: intentGift.icon || "",
    };
  }

  return null;
});

const ctaButtons = computed(() => {
  const base = props.profile.buttons || [];
  if (!giftConfig.value) return base;

  const giftButton = {
    text: giftConfig.value.title || "Send a gift",
    url: "#gift",
    style: "primary",
    icon: giftConfig.value.icon || "Gift",
  };

  return [giftButton, ...base];
});

const giftButtonIcon = computed(() => {
  if (!giftConfig.value) return "";
  return giftConfig.value.icon || "Gift";
});

// Check if we have any pages or posts
const visiblePages = computed(() =>
  (props.pages || []).filter((page) => page.visible !== false),
);
const hasPages = computed(() => visiblePages.value.length > 0);
const pages = computed(() => visiblePages.value);
const allowBlog = computed(() => props.blogEnabled !== false);

function isBlogListedPost(post: WizardPost): boolean {
  return !post.draft;
}

const hasPosts = computed(
  () =>
    allowBlog.value &&
    !!props.posts?.some((p) => isBlogListedPost(p)),
);

// Sort posts newest to oldest for display.
const sortedPosts = computed(() => {
  if (!props.posts) return [];
  const publishedPosts = props.posts.filter((p) => isBlogListedPost(p));
  return [...publishedPosts].sort((a, b) => {
    const aDate = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bDate = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return bDate - aDate; // Newest first
  });
});

const allowShop = computed(() => props.shopEnabled !== false);
const hasProducts = computed(
  () => allowShop.value && props.products && props.products.length > 0,
);
const hasNav = computed(
  () =>
    hasPages.value ||
    hasPosts.value ||
    hasProducts.value ||
    testimonialsStandalone.value,
);
const blogViewKey = computed(() => blogPath.value);
const blogPostViewPrefix = computed(() => `${blogPath.value}:`);
const shopViewKey = computed(() => shopPath.value);
const shopProductViewPrefix = computed(() => `${shopPath.value}:`);
const testimonialsViewKey = computed(() => testimonialsPath.value);

// Get current page content
const currentPage = computed(() => {
  if (
    currentView.value === "home" ||
    currentView.value === testimonialsViewKey.value ||
    (allowBlog.value &&
      (currentView.value === blogViewKey.value ||
        currentView.value.startsWith(blogPostViewPrefix.value))) ||
    (allowShop.value &&
      (currentView.value === shopViewKey.value ||
        currentView.value.startsWith(shopProductViewPrefix.value)))
  ) {
    return null;
  }
  if (!props.pages) return null;
  return props.pages.find((p) => p.slug === currentView.value) || null;
});

const currentPost = computed(() => {
  if (
    !allowBlog.value ||
    !props.posts ||
    !currentView.value.startsWith(blogPostViewPrefix.value)
  ) {
    return null;
  }
  const slug = currentView.value.slice(blogPostViewPrefix.value.length);
  return props.posts.find((p) => p.slug === slug) || null;
});

const isBlogView = computed(() => {
  if (!allowBlog.value) return false;
  if (currentView.value === blogViewKey.value) return true;
  // Unknown slug: show blog index, not home
  if (
    currentView.value.startsWith(blogPostViewPrefix.value) &&
    !currentPost.value
  ) {
    return true;
  }
  return false;
});

const isShopView = computed(
  () => allowShop.value && currentView.value === shopViewKey.value,
);

const isTestimonialsView = computed(
  () =>
    testimonialsStandalone.value && currentView.value === testimonialsViewKey.value,
);

const currentProduct = computed(() => {
  if (
    !allowShop.value ||
    !props.products ||
    !currentView.value.startsWith(shopProductViewPrefix.value)
  ) {
    return null;
  }
  const slug = currentView.value.slice(shopProductViewPrefix.value.length);
  return props.products.find((p) => p.slug === slug) || null;
});
const showTestimonialsOnBlogPage = computed(
  () => hasTestimonials.value && testimonialsPlacement.value === "blog",
);
const showTestimonialsOnShopPage = computed(
  () => hasTestimonials.value && testimonialsPlacement.value === "shop",
);
const showTestimonialsOnCurrentPage = computed(
  () =>
    hasTestimonials.value &&
    Boolean(currentPage.value) &&
    testimonialsPlacement.value === `page:${currentPage.value?.slug}`,
);

const testimonialsCarousel = ref<HTMLElement | null>(null);
const emblaApi = ref<EmblaCarouselType | null>(null);
const emblaIndex = ref(0);
const contentCarouselApis = ref<EmblaCarouselType[]>([]);
const showTestimonialsCarousel = computed(
  () => hasTestimonials.value && resolvedTestimonials.value.length > 1,
);

type LightboxImage = {
  src: string;
  alt?: string;
  caption?: string;
};

const lightboxOpen = ref(false);
const lightboxImages = ref<LightboxImage[]>([]);
const lightboxIndex = ref(0);
const lightboxCanPrev = ref(false);
const lightboxCanNext = ref(false);
const lightboxViewport = ref<HTMLElement | null>(null);
const lightboxEmbla = ref<EmblaCarouselType | null>(null);
const hasLightboxMultiple = computed(() => lightboxImages.value.length > 1);
const previousBodyOverflow = ref<string | null>(null);

function destroyEmbla() {
  if (emblaApi.value) {
    emblaApi.value.destroy();
    emblaApi.value = null;
  }
}

function initEmbla() {
  destroyEmbla();
  if (!showTestimonialsCarousel.value || !testimonialsCarousel.value) return;
  emblaApi.value = EmblaCarousel(testimonialsCarousel.value, {
    loop: true,
    align: "center",
    dragFree: false,
  });
  emblaIndex.value = emblaApi.value.selectedScrollSnap();
  emblaApi.value.on("select", () => {
    if (!emblaApi.value) return;
    emblaIndex.value = emblaApi.value.selectedScrollSnap();
  });
}

function scrollToTestimonial(index: number) {
  emblaApi.value?.scrollTo(index);
}

function destroyContentCarousels() {
  contentCarouselApis.value.forEach((api) => api.destroy());
  contentCarouselApis.value = [];
}

function initContentCarousels() {
  destroyContentCarousels();
  const carousels = Array.from(
    document.querySelectorAll(".preview .page-body .tiptap-carousel"),
  ) as HTMLElement[];
  carousels.forEach((carousel) => {
    if (!carousel.isConnected || carousel.offsetParent === null) return;
    const viewport = carousel.querySelector(
      ".tiptap-carousel-viewport",
    ) as HTMLElement | null;
    if (!viewport) return;
    const embla = EmblaCarousel(viewport, {
      loop: false,
      align: "center",
      dragFree: false,
    });
    contentCarouselApis.value.push(embla);
    const dots = Array.from(
      carousel.querySelectorAll<HTMLButtonElement>(".carousel-dot"),
    );
    const updateDots = () => {
      const index = embla.selectedScrollSnap();
      dots.forEach((dot, i) => {
        dot.classList.toggle("active", i === index);
      });
    };
    if (dots.length > 0) {
      dots.forEach((dot, i) => {
        dot.onclick = () => embla.scrollTo(i);
      });
      embla.on("select", updateDots);
      updateDots();
    }
  });
}

function destroyLightboxEmbla() {
  if (lightboxEmbla.value) {
    lightboxEmbla.value.destroy();
    lightboxEmbla.value = null;
  }
}

function updateLightboxNav() {
  if (!lightboxEmbla.value) {
    lightboxCanPrev.value = false;
    lightboxCanNext.value = false;
    return;
  }
  lightboxCanPrev.value = lightboxEmbla.value.canScrollPrev();
  lightboxCanNext.value = lightboxEmbla.value.canScrollNext();
}

function initLightboxEmbla() {
  destroyLightboxEmbla();
  if (!lightboxOpen.value || !lightboxViewport.value) return;
  lightboxEmbla.value = EmblaCarousel(lightboxViewport.value, {
    loop: false,
    align: "center",
    dragFree: false,
    startIndex: lightboxIndex.value,
  });
  lightboxIndex.value = lightboxEmbla.value.selectedScrollSnap();
  updateLightboxNav();
  lightboxEmbla.value.on("select", () => {
    if (!lightboxEmbla.value) return;
    lightboxIndex.value = lightboxEmbla.value.selectedScrollSnap();
    updateLightboxNav();
  });
}

function lockBodyScroll() {
  if (previousBodyOverflow.value === null) {
    previousBodyOverflow.value = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";
  }
}

function unlockBodyScroll() {
  if (previousBodyOverflow.value !== null) {
    document.body.style.overflow = previousBodyOverflow.value;
    previousBodyOverflow.value = null;
  }
}

function extractCaption(img: HTMLImageElement): string {
  const figure = img.closest("figure");
  if (!figure) return "";
  const caption = figure.querySelector("figcaption");
  return caption?.textContent?.trim() || "";
}

function buildLightboxImages(imgElements: HTMLImageElement[]): LightboxImage[] {
  return imgElements
    .map((img) => ({
      src: img.currentSrc || img.src || "",
      alt: img.getAttribute("alt") || "",
      caption: extractCaption(img),
    }))
    .filter((img) => img.src);
}

function openLightbox(images: LightboxImage[], index: number) {
  if (!images.length) return;
  lightboxImages.value = images;
  lightboxIndex.value = Math.min(Math.max(index, 0), images.length - 1);
  lightboxOpen.value = true;
  lockBodyScroll();
  nextTick(() => initLightboxEmbla());
}

function closeLightbox() {
  lightboxOpen.value = false;
  destroyLightboxEmbla();
  unlockBodyScroll();
}

function handlePageBodyClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target || target.tagName !== "IMG") return;
  if (target.closest("a")) return;

  const img = target as HTMLImageElement;
  const gallery = img.closest(".tiptap-gallery");
  const imgElements = gallery
    ? Array.from(gallery.querySelectorAll("img"))
    : [img];
  if (imgElements.length === 0) return;

  const images = buildLightboxImages(imgElements);
  if (images.length === 0) return;

  const index = Math.max(0, imgElements.indexOf(img));
  openLightbox(images, index);
  event.preventDefault();
}

onMounted(() => {
  initEmbla();
  initContentCarousels();
});

watch(
  [showTestimonialsCarousel, () => resolvedTestimonials.value.length],
  () => {
    nextTick(() => initEmbla());
  },
  { flush: "post" },
);

watch(
  () => currentView.value,
  () => {
    nextTick(() => {
      initEmbla();
      initContentCarousels();
    });
  },
);

watch(testimonialsPlacement, () => {
  nextTick(() => initEmbla());
});

watch(
  () => [
    currentPage.value?.content,
    currentPost.value?.content,
    currentProduct.value?.content,
  ],
  () => {
    nextTick(() => initContentCarousels());
  },
);

onBeforeUnmount(() => {
  destroyEmbla();
  destroyContentCarousels();
  destroyLightboxEmbla();
  unlockBodyScroll();
});

function getPostExcerpt(post: WizardPost): string {
  if (post.excerpt && post.excerpt.trim()) return post.excerpt.trim();
  if (!post.content) return "";
  try {
    const doc = new DOMParser().parseFromString(post.content, "text/html");
    const text = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length <= 160) return text;
    return `${text.slice(0, 157)}…`;
  } catch {
    return "";
  }
}

function getProductExcerpt(product: WizardProduct): string {
  if (product.excerpt && product.excerpt.trim()) return product.excerpt.trim();
  if (!product.content) return "";
  try {
    const doc = new DOMParser().parseFromString(product.content, "text/html");
    const text = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length <= 140) return text;
    return `${text.slice(0, 137)}…`;
  } catch {
    return "";
  }
}

function selectView(view: string) {
  currentView.value = view;
}

const footerView = computed(() => {
  const isPro = props.isPro === true;
  const footer = (props.profile as any).footer as
    | {
        mode: "default" | "custom" | "none";
        text: string;
        linkText: string;
        linkUrl: string;
      }
    | undefined;

  if (!isPro) return { kind: "default" as const };

  if (!footer || footer.mode === "default") return { kind: "default" as const };
  if (footer.mode === "none") return { kind: "none" as const };

  const text = (footer.text || "").trim();
  const linkText = (footer.linkText || "").trim();
  const linkUrl = (footer.linkUrl || "").trim();

  if (!text && !(linkText && linkUrl)) return { kind: "none" as const };

  return {
    kind: "custom" as const,
    text,
    linkText: linkText && linkUrl ? linkText : "",
    linkUrl: linkText && linkUrl ? linkUrl : "",
  };
});

const showFooter = computed(() => footerView.value.kind !== "none");

// Get the vibe font URL if the vibe requires an external font
const vibeFontUrl = computed(() => {
  if (!props.vibe) return null;
  return getVibeFontUrl(props.vibe);
});

// Determine color-scheme based on vibe (for native input icons)
const colorScheme = computed(() => {
  if (!props.vibe) return "light";
  return getVibeColorScheme(props.vibe);
});

// Get the vibe CSS for dynamic injection
const vibeCss = computed(() => {
  if (!props.vibe) return "";
  const rawCss = getVibeCss(props.vibe);

  // Scope ALL CSS to only apply within .preview-vibe-container
  // This prevents CSS from leaking to the whole page
  let scopedCss = rawCss
    // Handle forced-mode vibes: :root, [data-theme="light"], [data-theme="dark"] { -> .preview-vibe-container {
    .replace(
      /^:root,\s*\n?\s*\[data-theme="light"\],\s*\n?\s*\[data-theme="dark"\]\s*{/gm,
      ".preview-vibe-container {",
    )
    // Handle :root { -> .preview-vibe-container {
    .replace(/:root\s*{/g, ".preview-vibe-container {")
    // Handle :root:not([data-theme]) { -> .preview-vibe-container:not([data-theme]) {
    .replace(
      /:root:not\(\[data-theme\]\)\s*{/g,
      ".preview-vibe-container:not([data-theme]) {",
    )
    // Handle [data-theme="dark"] { -> .preview-vibe-container[data-theme="dark"] {
    .replace(
      /\[data-theme="(\w+)"\]\s*{/g,
      '.preview-vibe-container[data-theme="$1"] {',
    )
    // Handle standalone :root { -> .preview-vibe-container {
    .replace(/^:root\s*{/gm, ".preview-vibe-container {")
    // Handle @media (...) { :root { -> @media (...) { .preview-vibe-container {
    .replace(/(@media[^{]+{\s*):root\s*{/g, "$1.preview-vibe-container {")
    .replace(
      /(@media[^{]+{\s*):root:not\(\[data-theme\]\)\s*{/g,
      "$1.preview-vibe-container:not([data-theme]) {",
    )
    // Scope body and class selectors: body { -> .preview-vibe-container {
    .replace(/^body\s*{/gm, ".preview-vibe-container {")
    // Scope body::after (scanline effect) -> .preview-vibe-container::after
    .replace(/^body::after\s*{/gm, ".preview-vibe-container::after {")
    // Scope class selectors: .name { -> .preview-vibe-container .name {
    .replace(/^(\.[\w-]+(?:::[\w-]+)?)\s*{/gm, ".preview-vibe-container $1 {")
    // Scope compound selectors: .cta-button.primary { -> .preview-vibe-container .cta-button.primary {
    .replace(/^(\.[\w-]+\.[\w-]+)\s*{/gm, ".preview-vibe-container $1 {")
    // Handle @media (min-width: ...) { .name { -> @media (...) { .preview-vibe-container .name {
    .replace(
      /(@media[^{]+{\s*)(\.[\w-]+)\s*{/g,
      "$1.preview-vibe-container $2 {",
    );

  // Add vibe variable overrides with higher specificity to ensure they override scoped defaults
  const currentVibe = vibes[props.vibe];
  const colors = currentVibe.colors;

  // Extract font family from vibe CSS
  const fontFamilyMatch = rawCss.match(/--font-heading:\s*([^;]+);/);
  const fontHeading = fontFamilyMatch ? fontFamilyMatch[1].trim() : "inherit";

  const fontBodyMatch = rawCss.match(/--font-body:\s*([^;]+);/);
  const fontBody = fontBodyMatch ? fontBodyMatch[1].trim() : "inherit";

  // Extract radii from vibe CSS
  const radiusSmMatch = rawCss.match(/--radius-sm:\s*([^;]+);/);
  const radiusSm = radiusSmMatch ? radiusSmMatch[1].trim() : "8px";

  const radiusMdMatch = rawCss.match(/--radius-md:\s*([^;]+);/);
  const radiusMd = radiusMdMatch ? radiusMdMatch[1].trim() : "12px";

  const radiusLgMatch = rawCss.match(/--radius-lg:\s*([^;]+);/);
  const radiusLg = radiusLgMatch ? radiusLgMatch[1].trim() : "16px";

  const radiusFullMatch = rawCss.match(/--radius-full:\s*([^;]+);/);
  const radiusFull = radiusFullMatch ? radiusFullMatch[1].trim() : "9999px";

  scopedCss += `\n/* Vibe variable overrides - higher specificity to override defaults */
.preview.preview-vibe-container {
  --color-bg: ${colors.bg} !important;
  --color-text: ${colors.text} !important;
  --color-text-muted: ${colors.textMuted} !important;
  --color-border: ${colors.border} !important;
  --color-primary: ${colors.accent} !important;
  --color-accent: ${colors.accent} !important;
  --font-heading: ${fontHeading} !important;
  --font-body: ${fontBody} !important;
  --radius-sm: ${radiusSm} !important;
  --radius-md: ${radiusMd} !important;
  --radius-lg: ${radiusLg} !important;
  --radius-full: ${radiusFull} !important;
  background-color: ${colors.bg} !important;
}`;

  // Add accent override if provided
  if (props.accentOverride) {
    scopedCss += `\n/* Accent Override */\n.preview.preview-vibe-container { --color-accent: ${props.accentOverride} !important; --color-primary: ${props.accentOverride} !important; }`;
  }

  return scopedCss;
});
</script>

<template>
  <div class="preview-wrapper">
    <!-- Load external font if needed -->
    <component
      :is="'link'"
      v-if="vibeFontUrl"
      rel="stylesheet"
      :href="vibeFontUrl"
    />
    <!-- Dynamically inject vibe CSS scoped to this preview -->
    <component :is="'style'" v-if="vibe">
      {{ vibeCss }}
    </component>
    <div class="preview preview-vibe-container" :class="{ compact }">
      <!-- Banner -->
      <div
        v-if="profile.banner"
        class="banner"
        :style="{ backgroundImage: `url('${profile.banner}')` }"
      ></div>
      <div v-else class="banner placeholder-banner">
        <span>Banner</span>
      </div>

      <!-- Profile Header -->
      <header class="profile-header">
        <div v-if="profile.avatar" class="avatar-wrapper">
          <img :src="profile.avatar" alt="" class="avatar" />
        </div>
        <div v-else class="avatar-wrapper placeholder-avatar">
          <span class="placeholder" aria-hidden="true">
            <UiIcon name="User" :size="48" />
          </span>
        </div>

        <h1 class="name">{{ profile.name || "Your Name" }}</h1>
        <p v-if="displayLocation" class="location">{{ displayLocation }}</p>
        <p v-if="profile.bio" class="bio" v-html="parsedBio"></p>
      </header>

      <div v-if="lightboxOpen" class="lightbox" @click.self="closeLightbox">
        <div class="lightbox-card" role="dialog" aria-modal="true" @click.stop>
          <button class="lightbox-close" type="button" @click="closeLightbox">
            Close
          </button>
          <div class="lightbox-viewport" ref="lightboxViewport">
            <div class="lightbox-track">
              <div
                v-for="(image, index) in lightboxImages"
                :key="`${image.src}-${index}`"
                class="lightbox-slide"
              >
                <img
                  class="lightbox-image"
                  :src="image.src"
                  :alt="image.alt || ''"
                  loading="lazy"
                  decoding="async"
                />
                <p v-if="image.caption" class="lightbox-caption">
                  {{ image.caption }}
                </p>
              </div>
            </div>
          </div>
          <button
            v-if="hasLightboxMultiple"
            class="lightbox-arrow prev"
            type="button"
            :disabled="!lightboxCanPrev"
            @click.stop="lightboxEmbla?.scrollPrev()"
          >
            <UiIcon name="ChevronLeft" :size="18" aria-hidden="true" />
          </button>
          <button
            v-if="hasLightboxMultiple"
            class="lightbox-arrow next"
            type="button"
            :disabled="!lightboxCanNext"
            @click.stop="lightboxEmbla?.scrollNext()"
          >
            <UiIcon name="ChevronRight" :size="18" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- Navigation tabs (when pages exist) -->
      <nav v-if="hasNav" class="page-nav">
        <button
          class="nav-tab"
          :class="{ active: currentView === 'home' }"
          @click="selectView('home')"
        >
          Home
        </button>
        <button
          v-for="page in pages"
          :key="page.slug"
          class="nav-tab"
          :class="{ active: currentView === page.slug }"
          @click="selectView(page.slug)"
        >
          {{ page.title }}
        </button>
        <button
          v-if="hasPosts"
          class="nav-tab"
          :class="{
            active:
              currentView === blogViewKey ||
              currentView.startsWith(blogPostViewPrefix),
          }"
          @click="selectView(blogViewKey)"
        >
          {{ blogTitle }}
        </button>
        <button
          v-if="hasProducts"
          class="nav-tab"
          :class="{
            active:
              currentView === shopViewKey ||
              currentView.startsWith(shopProductViewPrefix),
          }"
          @click="selectView(shopViewKey)"
        >
          {{ shopTitle }}
        </button>
        <button
          v-if="testimonialsStandalone"
          class="nav-tab"
          :class="{ active: currentView === testimonialsViewKey }"
          @click="selectView(testimonialsViewKey)"
        >
          {{ testimonialsTitle }}
        </button>
      </nav>

      <!-- Shop product content -->
      <div v-if="currentProduct" class="page-content shop-product">
        <div class="shop-product-header">
          <button class="back-link" @click="selectView(shopViewKey)">
            ← Back to {{ shopTitle }}
          </button>
          <p class="shop-price">
            {{ (currentProduct.price / 100).toFixed(2) }}
            {{ currentProduct.currency }}
          </p>
        </div>
        <h2 class="page-title">{{ currentProduct.title }}</h2>
        <div
          class="page-body"
          v-html="
            currentProduct.content ||
            '<p class=\'empty\'>No description yet</p>'
          "
          @click="handlePageBodyClick"
        ></div>
      </div>

      <!-- Shop index -->
      <div v-else-if="isShopView" class="page-content shop-list">
        <h2 class="page-title">{{ shopTitle }}</h2>
        <div v-if="!products || products.length === 0" class="empty">
          No products yet
        </div>
        <div v-else class="shop-items">
          <button
            v-for="product in products"
            :key="product.slug"
            class="shop-item"
            @click="selectView(`${shopViewKey}:${product.slug}`)"
          >
            <div class="shop-item-title">{{ product.title }}</div>
            <div class="shop-item-price">
              {{ (product.price / 100).toFixed(2) }}
              {{ product.currency }}
            </div>
            <div v-if="getProductExcerpt(product)" class="shop-item-excerpt">
              {{ getProductExcerpt(product) }}
            </div>
          </button>
        </div>
        <div v-if="showTestimonialsOnShopPage" class="testimonials-section">
          <h3 class="section-title">{{ testimonialsTitle }}</h3>
          <div
            v-if="showTestimonialsCarousel"
            class="testimonials-carousel"
            ref="testimonialsCarousel"
          >
            <div class="testimonials-track">
              <div
                v-for="(testimonial, index) in resolvedTestimonials"
                :key="index"
                class="testimonials-slide"
              >
                <TestimonialCard
                  :name="testimonial.name"
                  :handle="testimonial.handle"
                  :avatar="testimonial.avatar"
                  :quote="testimonial.quote"
                  :profile-url="testimonial.profileUrl"
                />
              </div>
            </div>
          </div>
          <div v-else class="testimonials-single">
            <TestimonialCard
              v-if="resolvedTestimonials[0]"
              :name="resolvedTestimonials[0].name"
              :handle="resolvedTestimonials[0].handle"
              :avatar="resolvedTestimonials[0].avatar"
              :quote="resolvedTestimonials[0].quote"
              :profile-url="resolvedTestimonials[0].profileUrl"
            />
          </div>
          <div v-if="showTestimonialsCarousel" class="carousel-dots">
            <button
              v-for="(_, index) in resolvedTestimonials"
              :key="index"
              class="carousel-dot"
              :class="{ active: emblaIndex === index }"
              type="button"
              @click="scrollToTestimonial(index)"
            />
          </div>
        </div>
      </div>

      <!-- Blog post content -->
      <div v-else-if="currentPost" class="page-content blog-post">
        <div class="blog-post-header">
          <button class="back-link" @click="selectView(blogViewKey)">
            ← Back to {{ blogTitle }}
          </button>
          <p v-if="currentPost.publishedAt" class="blog-date">
            {{ new Date(currentPost.publishedAt).toLocaleDateString() }}
          </p>
        </div>
        <h2 class="page-title">{{ currentPost.title }}</h2>
        <div v-if="currentPost.type === 'video'" class="video-embed">
          <iframe
            v-if="currentPost.media?.url"
            :src="currentPost.media.url"
            title="Video"
            allow="
              accelerometer;
              gyroscope;
              autoplay;
              encrypted-media;
              picture-in-picture;
            "
            allowfullscreen
          ></iframe>
          <div v-else class="video-placeholder">
            Video will appear after publish.
          </div>
        </div>
        <div
          class="page-body"
          v-html="
            currentPost.content || '<p class=\'empty\'>No content yet</p>'
          "
          @click="handlePageBodyClick"
        ></div>
      </div>

      <!-- Blog index -->
      <div v-else-if="isBlogView" class="page-content blog-list">
        <h2 class="page-title">{{ blogTitle }}</h2>
        <div v-if="sortedPosts.length === 0" class="empty">
          No posts yet
        </div>
        <div v-else class="blog-items">
          <button
            v-for="post in sortedPosts"
            :key="post.slug"
            class="blog-item"
            @click="selectView(`${blogViewKey}:${post.slug}`)"
          >
            <div class="blog-item-title">
              {{ post.title }}
              <span v-if="post.type === 'video'" class="post-type">Video</span>
            </div>
            <div v-if="post.publishedAt" class="blog-item-date">
              {{ new Date(post.publishedAt).toLocaleDateString() }}
            </div>
            <div v-if="getPostExcerpt(post)" class="blog-item-excerpt">
              {{ getPostExcerpt(post) }}
            </div>
          </button>
        </div>
        <div v-if="showTestimonialsOnBlogPage" class="testimonials-section">
          <h3 class="section-title">{{ testimonialsTitle }}</h3>
          <div
            v-if="showTestimonialsCarousel"
            class="testimonials-carousel"
            ref="testimonialsCarousel"
          >
            <div class="testimonials-track">
              <div
                v-for="(testimonial, index) in resolvedTestimonials"
                :key="index"
                class="testimonials-slide"
              >
                <TestimonialCard
                  :name="testimonial.name"
                  :handle="testimonial.handle"
                  :avatar="testimonial.avatar"
                  :quote="testimonial.quote"
                  :profile-url="testimonial.profileUrl"
                />
              </div>
            </div>
          </div>
          <div v-else class="testimonials-single">
            <TestimonialCard
              v-if="resolvedTestimonials[0]"
              :name="resolvedTestimonials[0].name"
              :handle="resolvedTestimonials[0].handle"
              :avatar="resolvedTestimonials[0].avatar"
              :quote="resolvedTestimonials[0].quote"
              :profile-url="resolvedTestimonials[0].profileUrl"
            />
          </div>
          <div v-if="showTestimonialsCarousel" class="carousel-dots">
            <button
              v-for="(_, index) in resolvedTestimonials"
              :key="index"
              class="carousel-dot"
              :class="{ active: emblaIndex === index }"
              type="button"
              @click="scrollToTestimonial(index)"
            />
          </div>
        </div>
      </div>

      <!-- Testimonials view -->
      <div
        v-else-if="isTestimonialsView"
        class="page-content testimonials-view"
      >
        <h2 class="page-title">{{ testimonialsTitle }}</h2>
        <div v-if="hasTestimonials" class="testimonials-section standalone">
          <div
            v-if="showTestimonialsCarousel"
            class="testimonials-carousel"
            ref="testimonialsCarousel"
          >
            <div class="testimonials-track">
              <div
                v-for="(testimonial, index) in resolvedTestimonials"
                :key="index"
                class="testimonials-slide"
              >
                <TestimonialCard
                  :name="testimonial.name"
                  :handle="testimonial.handle"
                  :avatar="testimonial.avatar"
                  :quote="testimonial.quote"
                  :profile-url="testimonial.profileUrl"
                />
              </div>
            </div>
          </div>
          <div v-else class="testimonials-single">
            <TestimonialCard
              v-if="resolvedTestimonials[0]"
              :name="resolvedTestimonials[0].name"
              :handle="resolvedTestimonials[0].handle"
              :avatar="resolvedTestimonials[0].avatar"
              :quote="resolvedTestimonials[0].quote"
              :profile-url="resolvedTestimonials[0].profileUrl"
            />
          </div>
          <div v-if="showTestimonialsCarousel" class="carousel-dots">
            <button
              v-for="(_, index) in resolvedTestimonials"
              :key="index"
              class="carousel-dot"
              :class="{ active: emblaIndex === index }"
              type="button"
              @click="scrollToTestimonial(index)"
            />
          </div>
        </div>
        <div v-else class="empty">No testimonials yet</div>
      </div>

      <!-- Page content (when viewing a page) -->
      <div v-else-if="currentPage" class="page-content">
        <h2 class="page-title">{{ currentPage.title }}</h2>
        <div
          class="page-body"
          v-html="
            currentPage.content || '<p class=\'empty\'>No content yet</p>'
          "
          @click="handlePageBodyClick"
        ></div>
        <div v-if="showTestimonialsOnCurrentPage" class="testimonials-section">
          <h3 class="section-title">{{ testimonialsTitle }}</h3>
          <div
            v-if="showTestimonialsCarousel"
            class="testimonials-carousel"
            ref="testimonialsCarousel"
          >
            <div class="testimonials-track">
              <div
                v-for="(testimonial, index) in resolvedTestimonials"
                :key="index"
                class="testimonials-slide"
              >
                <TestimonialCard
                  :name="testimonial.name"
                  :handle="testimonial.handle"
                  :avatar="testimonial.avatar"
                  :quote="testimonial.quote"
                  :profile-url="testimonial.profileUrl"
                />
              </div>
            </div>
          </div>
          <div v-else class="testimonials-single">
            <TestimonialCard
              v-if="resolvedTestimonials[0]"
              :name="resolvedTestimonials[0].name"
              :handle="resolvedTestimonials[0].handle"
              :avatar="resolvedTestimonials[0].avatar"
              :quote="resolvedTestimonials[0].quote"
              :profile-url="resolvedTestimonials[0].profileUrl"
            />
          </div>
          <div v-if="showTestimonialsCarousel" class="carousel-dots">
            <button
              v-for="(_, index) in resolvedTestimonials"
              :key="index"
              class="carousel-dot"
              :class="{ active: emblaIndex === index }"
              type="button"
              @click="scrollToTestimonial(index)"
            />
          </div>
        </div>
      </div>

      <!-- Home content (buttons + links) -->
      <template v-else>
        <!-- Buttons -->
        <div v-if="ctaButtons.length > 0" class="buttons">
          <a
            v-for="(button, i) in ctaButtons"
            :key="i"
            :href="button.url"
            class="cta-button"
            :class="button.style || 'primary'"
            target="_blank"
          >
            <span v-if="button.icon" class="btn-icon">
              <UiIcon
                v-if="isUiIconName(button.icon)"
                :name="button.icon"
                :size="16"
              />
              <span v-else class="btn-emoji">{{ button.icon }}</span>
            </span>
            {{ button.text }}
          </a>
        </div>

        <!-- Links -->
        <div v-if="visibleLinks.length > 0" class="links">
          <a
            v-for="[platform, value] in visibleLinks"
            :key="platform"
            :href="formatLinkHref(platform, value)"
            class="link-item"
            target="_blank"
          >
            <span class="link-icon">
              <UiIcon
                v-if="isUiIconName(getPlatformIcon(platform, formatLinkLabel(platform, value)))"
                :name="getPlatformIcon(platform, formatLinkLabel(platform, value)) as UiIconName"
                :size="20"
              />
              <svg
                v-else
                viewBox="0 0 24 24"
                fill="currentColor"
                width="20"
                height="20"
              >
                <path :d="getPlatformIcon(platform, formatLinkLabel(platform, value))" />
              </svg>
            </span>
            <span class="link-label">{{
              formatLinkLabel(platform, value)
            }}</span>
          </a>
        </div>

        <!-- Gift Preview -->
        <div v-if="giftConfig" class="gift-preview">
          <h3 class="gift-title">{{ giftConfig.title }}</h3>
          <p v-if="giftConfig.description" class="gift-desc">
            {{ giftConfig.description }}
          </p>
          <button type="button" class="gift-open-btn" @click="openGiftModal">
            <span v-if="giftButtonIcon" class="btn-icon">
              <UiIcon
                v-if="isUiIconName(giftButtonIcon)"
                :name="giftButtonIcon"
                :size="14"
              />
              <span v-else class="btn-emoji">{{ giftButtonIcon }}</span>
            </span>
            {{ giftConfig.title || "Send a gift" }}
          </button>
          <div
            v-if="giftModalOpen"
            class="gift-modal"
            @click.self="closeGiftModal"
          >
            <div class="gift-card" role="dialog" aria-modal="true">
              <button class="gift-close" type="button" @click="closeGiftModal">
                Close
              </button>
              <div class="gift-modal-header">
                <h4 class="gift-modal-title">{{ giftConfig.title }}</h4>
                <p v-if="giftConfig.description" class="gift-desc">
                  {{ giftConfig.description }}
                </p>
              </div>
              <div class="gift-form-preview">
                <div class="gift-amount-row">
                  <label> Amount ({{ giftConfig.currency }}) </label>
                  <input
                    type="number"
                    :value="giftConfig.suggestedAmount"
                    disabled
                  />
                </div>
                <input type="text" placeholder="Your name" disabled />
                <input type="email" placeholder="Your email" disabled />
                <textarea
                  placeholder="Gift note (optional)"
                  rows="2"
                  disabled
                />
                <button type="button" disabled class="gift-btn">
                  Send gift
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Booking Preview -->
        <div v-if="hasBooking && bookingConfig" class="booking-preview">
          <!-- Simple button version (external URL only) -->
          <a
            v-if="
              bookingConfig.hasExternalUrl && !bookingConfig.hasAvailability
            "
            href="#"
            class="cta-button primary booking-button"
            @click.prevent
          >
            <span class="btn-icon">
              <UiIcon name="Calendar" :size="16" />
            </span>
            {{ activeBookingType?.title || activeBookingType?.label || "Book" }}
          </a>

          <!-- Full booking widget version (native availability or enabled but not configured) -->
          <template v-else>
            <div class="booking-type-tablist">
              <button
                v-for="type in bookingConfig.bookingTypes"
                :key="type.id"
                type="button"
                class="booking-type-tab"
                :class="{ active: type.id === activeBookingType?.id }"
                @click="activeBookingTypeId = type.id"
              >
                {{ type.label }}
              </button>
            </div>
            <div v-if="activeBookingType" class="booking-widget-preview">
              <h3 class="booking-title">{{ activeBookingType.title || activeBookingType.label }}</h3>
              <p v-if="activeBookingType.description" class="booking-desc">
                {{ activeBookingType.description }}
              </p>

              <template v-if="activeBookingType.id === 'one_to_one'">
                <div class="booking-session-preview">
                  <div
                    v-for="(offer, index) in activeBookingType.offers || []"
                    :key="offer.id || index"
                    class="booking-session-card"
                    :class="{ active: index === 0 }"
                  >
                    <span class="booking-session-title">
                      {{ offer.title || "Book a call" }}
                    </span>
                    <span class="booking-session-meta">
                      {{ offer.duration || 30 }} min
                      <template v-if="offer.pricing?.enabled">
                        ·
                        {{
                          `${offer.pricing.allowFlexiblePricing === false ? "" : "From "}${getCurrencySymbol(offer.pricing.currency || "USD")}${offer.pricing.suggestedAmount || 50}`
                        }}
                      </template>
                      <template v-else> · Free</template>
                    </span>
                  </div>
                </div>
                <div class="booking-date-picker">
                  <label for="preview-booking-date">Select a date:</label>
                  <input
                    type="date"
                    id="preview-booking-date"
                    disabled
                    class="booking-date-input"
                    :style="{ colorScheme }"
                  />
                </div>
                <p class="booking-preview-note">
                  Interactive booking calendar will appear here
                </p>
              </template>

              <template v-else-if="activeBookingType.id === 'class'">
                <div class="booking-session-preview">
                  <div
                    v-for="(offer, index) in activeBookingType.classes || []"
                    :key="offer.id || index"
                    class="booking-session-card"
                    :class="{ active: index === 0 }"
                  >
                    <span class="booking-session-title">
                      {{ offer.title || "Class" }}
                    </span>
                    <span class="booking-session-meta">
                      {{ offer.recurrence?.weekday || "Weekly" }}
                      ·
                      {{ offer.recurrence?.startTime || "--:--" }}
                      ·
                      {{ offer.duration || 60 }} min
                    </span>
                    <span class="booking-session-submeta">
                      <template v-if="offer.capacity">
                        {{ offer.capacity }} seats
                      </template>
                      <template v-else>
                        Unlimited seats
                      </template>
                    </span>
                  </div>
                </div>
                <div class="booking-date-picker">
                  <label>Upcoming sessions</label>
                  <div class="booking-occurrence-preview">
                    <div class="booking-occurrence-row">Tue, May 5 · 6:00 PM</div>
                    <div class="booking-occurrence-row">Tue, May 12 · 6:00 PM</div>
                    <div class="booking-occurrence-row">Tue, May 19 · 6:00 PM</div>
                  </div>
                </div>
                <p class="booking-preview-note">
                  Visitors will choose a class, then an upcoming session.
                </p>
              </template>

              <template v-else-if="activeBookingType.id === 'retreat'">
                <div class="booking-session-preview">
                  <div
                    v-for="(offer, index) in activeBookingType.retreats || []"
                    :key="offer.id || index"
                    class="booking-session-card"
                    :class="{ active: index === 0 }"
                  >
                    <span class="booking-session-title">
                      {{ offer.title || "Retreat" }}
                    </span>
                    <span class="booking-session-meta">
                      {{ offer.durationDays ?? "—" }} days
                      <template v-if="offer.startDate && offer.endDate">
                        · {{ offer.startDate }} → {{ offer.endDate }}
                      </template>
                    </span>
                    <span class="booking-session-submeta">
                      <template v-if="offer.capacity">
                        {{ offer.capacity }} spaces
                      </template>
                      <template v-else> Unlimited spaces </template>
                    </span>
                  </div>
                </div>
                <p class="booking-preview-note">
                  Visitors book the fixed retreat dates shown on your live site.
                </p>
              </template>
            </div>
          </template>
        </div>

        <!-- Testimonials -->
        <div v-if="showTestimonialsOnHomepage" class="testimonials-section">
          <h3 class="section-title">{{ testimonialsTitle }}</h3>
          <div
            v-if="showTestimonialsCarousel"
            class="testimonials-carousel"
            ref="testimonialsCarousel"
          >
            <div class="testimonials-track">
              <div
                v-for="(testimonial, index) in resolvedTestimonials"
                :key="index"
                class="testimonials-slide"
              >
                <TestimonialCard
                  :name="testimonial.name"
                  :handle="testimonial.handle"
                  :avatar="testimonial.avatar"
                  :quote="testimonial.quote"
                  :profile-url="testimonial.profileUrl"
                />
              </div>
            </div>
          </div>
          <div v-else class="testimonials-single">
            <TestimonialCard
              v-if="resolvedTestimonials[0]"
              :name="resolvedTestimonials[0].name"
              :handle="resolvedTestimonials[0].handle"
              :avatar="resolvedTestimonials[0].avatar"
              :quote="resolvedTestimonials[0].quote"
              :profile-url="resolvedTestimonials[0].profileUrl"
            />
          </div>
          <div v-if="showTestimonialsCarousel" class="carousel-dots">
            <button
              v-for="(_, index) in resolvedTestimonials"
              :key="index"
              class="carousel-dot"
              :class="{ active: emblaIndex === index }"
              type="button"
              @click="scrollToTestimonial(index)"
            />
          </div>
        </div>

        <!-- Newsletter Signup Preview -->
        <div v-if="hasNewsletter" class="newsletter-preview">
          <h3 class="newsletter-title">
            {{ profile.newsletter?.title || "Join my newsletter" }}
          </h3>
          <p v-if="profile.newsletter?.description" class="newsletter-desc">
            {{ profile.newsletter.description }}
          </p>
          <div class="newsletter-form-preview">
            <input
              type="email"
              placeholder="Enter your email"
              disabled
              class="newsletter-input"
            />
            <button type="button" disabled class="newsletter-btn">
              Subscribe
            </button>
          </div>
          <p class="newsletter-privacy">No spam. Unsubscribe anytime.</p>
        </div>
      </template>

      <!-- Footer -->
      <footer v-if="showFooter" class="footer">
        <div v-if="footerView.kind === 'default'" class="footer-default">
          <p>Powered by <a href="https://example.com">me3</a></p>
          <button
            class="footer-edit-btn"
            @click="$emit('edit-footer')"
            title="Edit footer"
            type="button"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
              />
              <path
                d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
              />
            </svg>
          </button>
        </div>
        <div v-else class="footer-custom">
          <p>
            <span v-if="footerView.text">{{ footerView.text }}</span>
            <a
              v-if="footerView.linkText && footerView.linkUrl"
              :href="footerView.linkUrl"
              target="_blank"
              rel="noopener"
            >
              {{ footerView.linkText }}
            </a>
          </p>
          <button
            class="footer-edit-btn"
            @click="$emit('edit-footer')"
            title="Edit footer"
            type="button"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
              />
              <path
                d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
              />
            </svg>
          </button>
        </div>
      </footer>
      <button
        v-else
        class="footer-edit-floating"
        @click="$emit('edit-footer')"
        title="Edit footer"
        type="button"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
          />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.preview-wrapper {
  display: contents;
}

.preview {
  background: var(--color-bg, #fafafa);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.1);
  margin: 0 auto;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  /* Ensure the background from CSS variables is used */
  isolation: isolate;

  /* Default CSS variables (warm theme) - can be overridden by vibe CSS */
  --color-bg: #faf8f5;
  --color-text: #2d2a26;
  --color-text-muted: #6b6560;
  --color-border: #e8e4df;
  --color-primary: #2d2a26;
  --color-accent: #2d2a26;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 9999px;
}

.preview.compact {
  transform: scale(0.85);
  transform-origin: top center;
}

.banner {
  height: 120px;
  position: relative;
  background-size: cover;
  background-position: center;
  background-color: var(--color-border, #e5e5e5);
}

.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(8, 8, 8, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 1000;
}

.lightbox-card {
  position: relative;
  width: min(96vw, 720px);
  max-height: 90vh;
  background: var(--color-bg, #fff);
  color: var(--color-text, #111);
  border-radius: 18px;
  padding: 20px 20px 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lightbox-close {
  position: absolute;
  top: 12px;
  right: 12px;
  border: none;
  background: transparent;
  color: var(--color-text-muted, #666);
  font-size: 12px;
  cursor: pointer;
}

.lightbox-viewport {
  overflow: hidden;
  width: 100%;
}

.lightbox-track {
  display: flex;
}

.lightbox-slide {
  flex: 0 0 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.lightbox-image {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 12px;
  background: var(--color-border, #e5e5e5);
}

.lightbox-caption {
  font-size: 12px;
  color: var(--color-text-muted, #666);
  text-align: center;
  max-width: min(90%, 520px);
}

.lightbox-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.lightbox-arrow.prev {
  left: 10px;
}

.lightbox-arrow.next {
  right: 10px;
}

.lightbox-arrow:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.lightbox-arrow:not(:disabled):hover {
  transform: translateY(-50%) scale(1.05);
}

@media (max-width: 520px) {
  .lightbox-card {
    width: 94vw;
    padding: 16px;
  }

  .lightbox-arrow {
    width: 32px;
    height: 32px;
  }
}

.placeholder-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted, #666);
  font-size: 14px;
}

.profile-header {
  text-align: center;
  padding: 0 20px 20px;
  margin-top: -40px;
  position: relative;
  z-index: 1;
}

.avatar-wrapper {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  margin: 0 auto 12px;
  border: 3px solid var(--color-bg, #fafafa);
  overflow: hidden;
  background: var(--color-border, #e5e5e5);
}

.avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.placeholder-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
}

.name {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 2px;
  color: var(--color-text, #111);
}

.bio {
  font-size: 14px;
  color: var(--color-text-muted, #666);
  line-height: 1.4;
}

.bio :deep(a) {
  color: var(--color-text);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.bio :deep(a:hover) {
  opacity: 0.8;
}

.location {
  font-size: 14px;
  color: var(--color-text-muted, #666);
  margin-bottom: 8px;
}

/* Page navigation */
.page-nav {
  display: flex;
  gap: 4px;
  padding: 0 20px 16px;
  overflow-x: auto;
  flex-wrap: wrap;
  justify-content: center;
}

.nav-tab {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  background: transparent;
  border: none;
  border-radius: var(--radius-full, 9999px);
  cursor: pointer;
  color: var(--color-text-muted, #666);
  transition: all 0.2s;
  white-space: nowrap;
}

.nav-tab:hover {
  background: var(--color-border, #e5e5e5);
  color: var(--color-text, #111);
}

.nav-tab.active {
  background: var(--color-text, #111);
  color: var(--color-bg, #fafafa);
}

/* Page content */
.page-content {
  padding: 0 20px 20px;
}

.page-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--color-text-muted, #666);
}

.blog-post-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.back-link {
  border: none;
  background: transparent;
  color: var(--color-text-muted, #666);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

.blog-date {
  font-size: 12px;
  color: var(--color-text-muted, #666);
}

.blog-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.blog-item {
  text-align: left;
  background: transparent;
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: var(--radius-md, 12px);
  padding: 10px 12px;
  cursor: pointer;
}

.blog-item-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--color-accent, #111);
}

.post-type {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: rgba(0, 0, 0, 0.08);
}

.blog-item-date {
  font-size: 12px;
  color: var(--color-text-muted, #666);
  margin-bottom: 6px;
}

.blog-item-excerpt {
  font-size: 12px;
  color: var(--color-text-muted, #666);
  line-height: 1.4;
}

.video-embed {
  margin: 12px 0 18px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--color-border, #e5e5e5);
  background: var(--color-bg, #fff);
}

.video-embed iframe {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: none;
  display: block;
}

.video-placeholder {
  padding: 18px;
  font-size: 13px;
  color: var(--color-text-muted, #666);
}

.shop-product-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.shop-price {
  margin: 0;
  font-size: var(--shop-price-font-size, 12px);
  font-weight: var(--shop-price-font-weight, 400);
  color: var(--shop-price-color, var(--color-text-muted, #666));
}

.shop-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shop-item {
  text-align: left;
  background: transparent;
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: var(--radius-md, 12px);
  padding: 10px 12px;
  cursor: pointer;
}

.shop-item-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--color-accent, --color-text);
}

.shop-item-price {
  font-size: var(--shop-price-font-size, 12px);
  font-weight: var(--shop-price-font-weight, 400);
  color: var(--shop-price-color, var(--color-text-muted, #666));
  margin-bottom: 6px;
}

.shop-item-excerpt {
  font-size: 12px;
  color: var(--color-text-muted, #666);
  line-height: 1.4;
}

.empty {
  color: var(--color-text-muted, #666);
  font-style: italic;
}

.page-body {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-muted, #666);
}

.page-body :deep(h2) {
  font-size: 14px;
  font-weight: 600;
  margin: 16px 0 8px;
  color: var(--color-text, #111);
}

.page-body :deep(h3) {
  font-size: 13px;
  font-weight: 600;
  margin: 12px 0 6px;
  color: var(--color-text, #111);
}

.page-body :deep(p) {
  margin-bottom: 8px;
}

.page-body :deep(img) {
  max-width: 100%;
  height: auto;
}

.page-body :deep(figure.tiptap-image-figure) {
  margin: 12px 0;
}

.page-body :deep(figure.tiptap-image-figure img) {
  display: block;
  max-width: 100%;
  height: auto;
}

.page-body :deep(figure.tiptap-image-figure figcaption) {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-muted, #666);
}

.page-body :deep(.tiptap-gallery) {
  display: block;
  column-count: 2;
  column-gap: 12px;
}

.page-body :deep(.tiptap-gallery > figure),
.page-body :deep(.tiptap-gallery > img) {
  break-inside: avoid;
  margin-bottom: 12px;
}

.page-body :deep(.tiptap-gallery img) {
  width: 100%;
  height: auto;
  display: block;
}

.page-body :deep(.tiptap-gallery figcaption) {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-muted, #666);
}

@media (max-width: 720px) {
  .page-body :deep(.tiptap-gallery) {
    column-count: 2;
  }
}

@media (max-width: 520px) {
  .page-body :deep(.tiptap-gallery) {
    column-count: 1;
  }
}

.page-body :deep(.tiptap-faq) {
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: 12px;
  overflow: hidden;
  margin: 12px 0;
}

.page-body :deep(.tiptap-faq details) {
  border-bottom: 1px solid var(--color-border, #e5e5e5);
  background: var(--color-bg, #fff);
}

.page-body :deep(.tiptap-faq details:last-child) {
  border-bottom: none;
}

.page-body :deep(.tiptap-faq summary) {
  list-style: none;
  cursor: pointer;
  padding: 14px 16px;
  font-weight: 600;
  color: var(--color-text, #111);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.page-body :deep(.tiptap-faq summary::-webkit-details-marker) {
  display: none;
}

.page-body :deep(.tiptap-faq summary::after) {
  content: "▼";
  font-size: 10px;
  opacity: 0.7;
  transition: transform 0.2s ease;
}

.page-body :deep(.tiptap-faq details[open] summary::after) {
  transform: rotate(180deg);
}

.page-body :deep(.tiptap-faq .tiptap-faq-answer) {
  padding: 8px 16px 16px;
  color: var(--color-text-muted, #666);
}

.page-body :deep(.tiptap-carousel) {
  margin: 12px 0;
}

.page-body :deep(.tiptap-carousel-viewport) {
  overflow: hidden;
}

.page-body :deep(.tiptap-carousel-track) {
  display: flex;
  gap: 12px;
}

.page-body :deep(.tiptap-carousel-slide) {
  flex: 0 0 85%;
}

.page-body :deep(.tiptap-carousel-card) {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: 16px;
  background: var(--color-bg, #fff);
  color: var(--color-text, #111);
  padding: 14px;
  text-decoration: none;
  min-height: 100%;
}

.page-body :deep(.tiptap-carousel-image) {
  width: 100%;
  height: auto;
  border-radius: 12px;
  object-fit: cover;
}

.page-body :deep(.tiptap-carousel-title) {
  font-weight: 600;
  font-size: 14px;
}

.page-body :deep(.tiptap-carousel-body) {
  font-size: 13px;
  color: var(--color-text-muted, #666);
  line-height: 1.5;
}

.page-body :deep(.tiptap-carousel-dots) {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 10px;
}

.page-body :deep(.tiptap-carousel-dots .carousel-dot) {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  border: none;
  background: var(--color-border, #e5e5e5);
  cursor: pointer;
}

.page-body :deep(.tiptap-carousel-dots .carousel-dot.active) {
  background: var(--color-text, #111);
}

.page-body :deep(.tiptap-youtube) {
  margin: 20px 0;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--color-border, #e5e5e5);
  background: var(--color-bg, #fff);
}

.page-body :deep(.tiptap-youtube iframe) {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: none;
  display: block;
}

.page-body :deep(ul[data-type="taskList"]) {
  list-style: none;
  padding-left: 0;
  margin-bottom: 8px;
}

.page-body :deep(ul[data-type="taskList"] ul[data-type="taskList"]) {
  margin: 4px 0 4px 20px;
}

.page-body :deep(li[data-type="taskItem"]) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding-left: 0;
}

.page-body :deep(li[data-type="taskItem"] > label) {
  flex: 0 0 auto;
  margin-top: 2px;
  user-select: none;
}

.page-body :deep(li[data-type="taskItem"] > div) {
  flex: 1 1 auto;
  min-width: 0;
}

.page-body :deep(li[data-type="taskItem"] p) {
  margin-bottom: 0;
}

.page-body :deep(li[data-type="taskItem"] input[type="checkbox"]) {
  width: 15px;
  height: 15px;
  accent-color: var(--ui-accent, var(--color-primary, #007bff));
}

.page-body :deep(ul),
.page-body :deep(ol) {
  padding-left: 20px;
  margin-bottom: 8px;
}

.page-body :deep(blockquote) {
  border-left: 2px solid var(--color-border, #e5e5e5);
  padding-left: 12px;
  margin: 8px 0;
  font-style: italic;
}

.page-body :deep(.empty) {
  color: var(--color-text-muted, #666);
  font-style: italic;
}

.buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 20px 16px;
}

.cta-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: var(--radius-md);
  text-align: center;
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
  transition: transform 0.2s;
}

.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
}

.btn-emoji {
  font-size: 16px;
  line-height: 1;
}

.cta-button:hover {
  transform: translateY(-1px);
}

.cta-button.primary {
  background: var(--color-text, #111);
  color: var(--color-bg, #fafafa);
}

.cta-button.secondary {
  background: var(--color-border, #e5e5e5);
  color: var(--color-text, #111);
}

.cta-button.outline {
  background: transparent;
  border: 2px solid var(--color-text, #111);
  color: var(--color-text, #111);
}

.links {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 20px 20px;
}

.testimonials-section {
  padding: 0 20px 20px;
}

.testimonials-section.standalone {
  padding: 0 0 20px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--color-text, #111);
  text-align: center;
}

.testimonials-carousel {
  overflow: hidden;
}

.testimonials-track {
  display: flex;
  gap: 12px;
  padding: 15px;
}

.testimonials-slide {
  flex: 0 0 85%;
}

.testimonials-single {
  display: flex;
  justify-content: center;
}

.carousel-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 12px;
}

.carousel-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  background: var(--color-border, #e5e5e5);
  cursor: pointer;
}

.carousel-dot.active {
  background: var(--color-text, #111);
}

.link-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--color-border, #e5e5e5);
  border-radius: var(--radius-sm, 8px);
  text-decoration: none;
  color: var(--color-text, #111);
  font-size: 14px;
  font-weight: 500;
  transition: transform 0.2s;
}

.link-item:hover {
  transform: translateY(-1px);
}

.link-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: inherit;
}

.link-icon svg {
  width: 20px;
  height: 20px;
  color: inherit;
}

.link-label {
  flex: 1;
}

.footer {
  text-align: center;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border, #e5e5e5);
  font-size: 12px;
  color: var(--color-text-muted, #666);
  margin-top: auto;
}

.footer a {
  color: var(--color-text-muted, #666);
}

.footer-default {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.footer-custom {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.footer-edit-btn {
  opacity: 0;
  padding: 4px;
  border: none;
  background: var(--color-bg, #fafafa);
  color: var(--color-text-muted, #666);
  cursor: pointer;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    opacity 0.2s,
    background 0.2s,
    color 0.2s;
  margin-left: 4px;
}

.footer:hover {
  cursor: pointer;
}

.footer:hover .footer-edit-btn {
  opacity: 1;
  cursor: pointer;
}

.footer-edit-btn:hover {
  background: var(--color-border, #e5e5e5);
  color: var(--color-text, #111);
}

.footer-edit-floating {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 6px;
  border: 1px solid var(--color-border, #e5e5e5);
  background: var(--color-bg, #fafafa);
  color: var(--color-text-muted, #666);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.7;
  transition:
    opacity 0.2s,
    transform 0.2s,
    background 0.2s,
    color 0.2s;
}

.preview:hover .footer-edit-floating {
  opacity: 1;
  transform: translateY(-1px);
}

.footer-edit-floating:hover {
  background: var(--color-border, #e5e5e5);
  color: var(--color-text, #111);
}

/* Gift Preview */
.gift-preview {
  margin: 16px 20px;
  padding: 20px;
  background: var(--color-border, #fafafa);
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: var(--radius-lg, 16px);
  text-align: left;
}

.gift-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--color-text, #111);
}

.gift-desc {
  font-size: 12px;
  color: var(--color-text-muted, #666);
  margin-bottom: 12px;
  line-height: 1.4;
}

.gift-form-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gift-open-btn {
  width: 100%;
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-md, 12px);
  background: var(--color-text, #111);
  color: var(--color-bg, #fafafa);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  margin-bottom: 10px;
}

.gift-modal {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 10, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 1000;
}

.gift-card {
  width: min(92vw, 420px);
  max-height: 90vh;
  overflow-y: auto;
  background: var(--color-bg, #fff);
  color: var(--color-text, #111);
  border-radius: 20px;
  padding: 20px 20px 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  position: relative;
}

.gift-close {
  position: absolute;
  top: 12px;
  right: 12px;
  border: none;
  background: transparent;
  color: var(--color-text-muted, #666);
  font-size: 12px;
  cursor: pointer;
}

.gift-modal-header {
  text-align: center;
  margin-bottom: 12px;
}

.gift-modal-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 6px;
}

.gift-amount-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gift-amount-row label {
  font-size: 11px;
  color: var(--color-text-muted, #666);
}

.gift-form-preview input,
.gift-form-preview textarea {
  width: 100%;
  padding: 10px 12px;
  font-size: 12px;
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: var(--radius-md, 12px);
  background: var(--color-bg, #fafafa);
  color: var(--color-text-muted, #666);
  font-family: inherit;
}

.gift-form-preview textarea {
  resize: none;
}

.gift-btn {
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-md, 12px);
  background: var(--color-text, #111);
  color: var(--color-bg, #fafafa);
  cursor: default;
}

/* Newsletter Preview */
.newsletter-preview {
  margin: 16px 20px;
  padding: 20px;
  background: var(--color-border, #e5e5e5);
  border-radius: var(--radius-lg, 16px);
  text-align: center;
}

.newsletter-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--color-text, #111);
}

.newsletter-desc {
  font-size: 12px;
  color: var(--color-text-muted, #666);
  margin-bottom: 12px;
  line-height: 1.4;
}

.newsletter-form-preview {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.newsletter-input {
  flex: 1;
  padding: 10px 12px;
  font-size: 12px;
  border: 1px solid var(--color-bg, #fafafa);
  border-radius: var(--radius-md, 12px);
  background: var(--color-bg, #fafafa);
  color: var(--color-text-muted, #666);
}

.newsletter-btn {
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-md, 12px);
  background: var(--color-text, #111);
  color: var(--color-bg, #fafafa);
  cursor: default;
}

.newsletter-privacy {
  font-size: 10px;
  color: var(--color-text-muted, #666);
  margin: 0;
}

/* Booking Preview */
.booking-preview {
  margin: 16px 20px;
  padding: 20px;
  background: var(--color-border, #e5e5e5);
  border-radius: var(--radius-lg, 16px);
  text-align: center;
}

.booking-button {
  width: 100%;
  margin: 0;
  cursor: default;
}

.booking-button:hover {
  transform: none;
}

.booking-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--color-text, #111);
}

.booking-desc {
  font-size: 12px;
  color: var(--color-text-muted, #666);
  margin-bottom: 8px;
  line-height: 1.4;
}

.booking-duration {
  font-size: 12px;
  color: var(--color-text-muted, #666);
  margin-bottom: 12px;
}

.booking-type-tablist {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.booking-type-tab {
  border: 1px solid var(--color-border, #e5e5e5);
  background: transparent;
  color: var(--color-text-muted, #666);
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
}

.booking-type-tab.active {
  background: var(--color-text, #111);
  border-color: var(--color-text, #111);
  color: var(--color-bg, #fafafa);
}

.booking-widget-preview {
  background: var(--color-bg, #fafafa);
  border-radius: var(--radius-md, 12px);
  padding: 16px;
}

.booking-session-preview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.booking-session-preview:has(.booking-session-card:only-child) {
  grid-template-columns: 1fr;
}

.booking-session-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: var(--radius-md, 12px);
  background: rgba(255, 255, 255, 0.45);
  text-align: left;
  min-width: 0;
}

.booking-session-card.active {
  border-color: var(--color-text, #111);
}

.booking-session-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text, #111);
}

.booking-session-meta {
  font-size: 11px;
  color: var(--color-text-muted, #666);
}

.booking-session-submeta {
  font-size: 11px;
  color: var(--color-text-muted, #666);
}

.booking-date-picker {
  margin-bottom: 12px;
}

.booking-date-picker label {
  display: block;
  font-size: 12px;
  color: var(--color-text-muted, #666);
  margin-bottom: 6px;
  text-align: left;
}

.booking-date-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 12px;
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: var(--radius-md, 12px);
  background: var(--color-bg, #fafafa);
  color: var(--color-text-muted, #666);
}

.booking-preview-note {
  font-size: 11px;
  color: var(--color-text-muted, #666);
  font-style: italic;
  margin: 0;
}

.booking-occurrence-preview {
  display: grid;
  gap: 8px;
}

.booking-occurrence-row {
  padding: 10px 12px;
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: var(--radius-md, 12px);
  font-size: 12px;
  color: var(--color-text, #111);
  background: rgba(255, 255, 255, 0.45);
}
</style>
