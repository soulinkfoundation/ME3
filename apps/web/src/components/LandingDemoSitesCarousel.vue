<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import EmblaCarousel, { type EmblaCarouselType } from "embla-carousel";

const slides = [
  // {
  //   image: "/demo-4.png",
  //   href: "https://feelthefeelsdemo.example.com/",
  //   title: "Somatic Healing — example me3 site",
  // },
  {
    image: "/demo-6.png",
    href: "https://tonyrobbinslifecoach.example.com/",
    title: "The Coaches Coach — example me3 site",
  },
  {
    image: "/demo-3.png",
    href: "https://yinsyogastudio.example.com/",
    title: "Yin's Yoga — example me3 site",
  },
  {
    image: "/demo-5.png",
    href: "https://breathworkbob.example.com/",
    title: "Breathwork Bob — example me3 site",
  },
] as const;

const carouselViewport = ref<HTMLElement | null>(null);
const emblaApi = ref<EmblaCarouselType | null>(null);
const selectedIndex = ref(0);

function destroyEmbla() {
  emblaApi.value?.destroy();
  emblaApi.value = null;
}

function initEmbla() {
  destroyEmbla();
  if (!carouselViewport.value) return;
  emblaApi.value = EmblaCarousel(carouselViewport.value, {
    loop: true,
    align: "center",
    dragFree: false,
  });
  selectedIndex.value = emblaApi.value.selectedScrollSnap();
  emblaApi.value.on("select", () => {
    if (!emblaApi.value) return;
    selectedIndex.value = emblaApi.value.selectedScrollSnap();
  });
}

function scrollToSlide(index: number) {
  emblaApi.value?.scrollTo(index);
}

onMounted(() => {
  nextTick(() => initEmbla());
});

onBeforeUnmount(() => {
  destroyEmbla();
});
</script>

<template>
  <div class="demo-sites-carousel-wrap">
    <div class="carousel-stage">
      <div class="carousel-viewport-shell">
        <div ref="carouselViewport" class="testimonials-carousel">
          <div class="testimonials-track">
            <div
              v-for="(slide, index) in slides"
              :key="index"
              class="testimonials-slide"
            >
              <a
                class="demo-slide-card"
                :href="slide.href"
                target="_blank"
                rel="noopener noreferrer"
                :aria-label="`${slide.title} (opens in new tab)`"
              >
                <div class="demo-slide-media">
                  <img
                    class="demo-slide-image"
                    :src="slide.image"
                    alt=""
                    width="390"
                    height="844"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
      <div class="carousel-dots">
        <button
          v-for="(_, index) in slides"
          :key="index"
          type="button"
          class="carousel-dot"
          :class="{ active: selectedIndex === index }"
          :aria-label="`Go to example site ${index + 1}`"
          :aria-current="selectedIndex === index ? 'true' : undefined"
          @click="scrollToSlide(index)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.demo-sites-carousel-wrap {
  max-width: min(100%, 440px);
  margin: 0 auto;
}

.carousel-stage {
  position: relative;
  /* Extra room below cards so shadows blend into section bg (dots sit in this band) */
  padding-bottom: 72px;
}

.carousel-viewport-shell {
  position: relative;
  isolation: isolate;
}

/* Lighter edge fades: more of peeking slides visible, blend into section bg */
.carousel-viewport-shell::before,
.carousel-viewport-shell::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: clamp(12px, 5vw, 32px);
  z-index: 2;
  pointer-events: none;
}

.carousel-viewport-shell::before {
  left: 0;
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--color-bg, #fff) 88%, transparent) 0%,
    color-mix(in srgb, var(--color-bg, #fff) 25%, transparent) 65%,
    transparent 100%
  );
}

.carousel-viewport-shell::after {
  right: 0;
  background: linear-gradient(
    to left,
    color-mix(in srgb, var(--color-bg, #fff) 88%, transparent) 0%,
    color-mix(in srgb, var(--color-bg, #fff) 25%, transparent) 65%,
    transparent 100%
  );
}

/* Bottom padding inside overflow:hidden so card shadows are not clipped */
.testimonials-carousel {
  overflow: hidden;
  padding-bottom: 64px;
  box-sizing: border-box;
}

.testimonials-track {
  display: flex;
  gap: 24px;
  padding: 18px 14px 0;
}

.testimonials-slide {
  flex: 0 0 76%;
  min-width: 0;
}

.demo-slide-card {
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  border: 1px solid var(--color-border, #e5e5e5);
  background: var(--color-bg, #fff);
  color: inherit;
  text-decoration: none;
  transform-origin: center center;
  transition:
    transform 0.28s ease,
    box-shadow 0.28s ease;
  box-shadow:
    0 14px 28px rgba(0, 0, 0, 0.07),
    0 32px 52px -28px rgba(0, 0, 0, 0.14),
    -28px 0 36px -32px rgba(0, 0, 0, 0.08),
    28px 0 36px -32px rgba(0, 0, 0, 0.08);
}

.demo-slide-media {
  overflow: hidden;
  border-radius: 17px;
}

@media (hover: hover) and (pointer: fine) {
  .testimonials-slide:hover .demo-slide-card {
    transform: scale(1.035) translateY(-6px);
    box-shadow:
      0 18px 36px rgba(0, 0, 0, 0.1),
      0 40px 64px -24px rgba(0, 0, 0, 0.18),
      -32px 0 44px -30px rgba(0, 0, 0, 0.1),
      32px 0 44px -30px rgba(0, 0, 0, 0.1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .demo-slide-card {
    transition: none;
  }

  .testimonials-slide:hover .demo-slide-card {
    transform: none;
  }
}

.demo-slide-image {
  display: block;
  width: 100%;
  height: auto;
}

.demo-slide-card:focus-visible {
  outline: 2px solid var(--color-text, #111);
  outline-offset: 3px;
}

.carousel-dots {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  z-index: 4;
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 10px 14px;
  margin: 0;
  /* Sits over the shadow tail so dots stay legible */
  background: var(--color-bg, #fff);
  border-radius: 999px;
}

.carousel-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  background: var(--color-border, #e5e5e5);
  cursor: pointer;
  padding: 0;
}

.carousel-dot.active {
  background: var(--color-text, #111);
}

.carousel-dot:focus-visible {
  outline: 2px solid var(--color-text, #111);
  outline-offset: 2px;
}
</style>
