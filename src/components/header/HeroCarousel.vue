<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { t } from "../../i18n";
import type { HeroSlide } from "../../lib/settings-content";
import { carouselOptions } from "../../lib/settings-content";
import type { SiteSettings } from "emdash";
const props = defineProps<{
  slides: HeroSlide[];
  options?: SiteSettings["heroCarousel"];
  fallback: string;
}>();
const options = carouselOptions(props.options);
const current = ref(0);
const root = ref<HTMLElement>();
const paused = ref(false);
const reduced = ref(false);
const hovered = ref(false);
const focused = ref(false);
const hidden = ref(false);
const ready = ref(false);
const failed = ref(new Set<number>());
const playing = computed(
  () =>
    ready.value &&
    props.slides.length > 1 &&
    !paused.value &&
    !reduced.value &&
    !hovered.value &&
    !focused.value &&
    !hidden.value,
);
let timer: ReturnType<typeof setInterval> | undefined;
let motion: MediaQueryList | undefined;
let touchX: number | undefined;
const stop = () => {
  if (timer) clearInterval(timer);
  timer = undefined;
};
watch(playing, () => {
  stop();
  if (playing.value)
    timer = setInterval(
      () => go(current.value + 1),
      options.intervalSeconds * 1000,
    );
});
function go(index: number) {
  current.value = (index + props.slides.length) % props.slides.length;
}
function keyboard(event: KeyboardEvent) {
  if (props.slides.length < 2) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    go(current.value + (event.key === "ArrowRight" ? 1 : -1));
  }
}
function focusOut(event: FocusEvent) {
  focused.value =
    !!event.relatedTarget &&
    (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node);
}
function visibility() {
  hidden.value = document.hidden;
}
function preference() {
  reduced.value = motion?.matches || false;
}
function imageError(index: number) {
  if (!failed.value.has(index))
    failed.value = new Set([...failed.value, index]);
}
function touchEnd(event: TouchEvent) {
  if (touchX !== undefined && props.slides.length > 1) {
    const delta = event.changedTouches[0]!.clientX - touchX;
    if (Math.abs(delta) > 50) go(current.value + (delta < 0 ? 1 : -1));
  }
  touchX = undefined;
}
onMounted(() => {
  root.value
    ?.querySelectorAll<HTMLImageElement>(".hero-slide img")
    .forEach((image, index) => {
      if (image.complete && image.naturalWidth === 0) imageError(index);
    });
  motion = matchMedia("(prefers-reduced-motion: reduce)");
  preference();
  visibility();
  motion.addEventListener("change", preference);
  document.addEventListener("visibilitychange", visibility);
  ready.value = true;
});
onUnmounted(() => {
  stop();
  motion?.removeEventListener("change", preference);
  document.removeEventListener("visibilitychange", visibility);
});
const position = options.textPosition;
const style = {
  "--hero-height": options.height ? `${options.height}px` : "auto",
  "--hero-mobile-height": options.mobileHeight
    ? `${options.mobileHeight}px`
    : "auto",
  "--hero-blur": `${options.blurPx}px`,
  "--hero-overlay": options.overlayOpacity / 100,
  "--hero-title": `${options.titleSize}px`,
  "--hero-mobile-title": `${options.mobileTitleSize}px`,
  "--hero-description": `${options.descriptionSize}px`,
  "--hero-align": position.endsWith("start")
    ? "start"
    : position.endsWith("end")
      ? "end"
      : "center",
  "--hero-justify": position.startsWith("top")
    ? "start"
    : position.startsWith("bottom")
      ? "end"
      : "center",
};
</script>
<template>
  <section
    class="hero-carousel"
    ref="root"
    tabindex="0"
    role="region"
    :aria-label="t('carousel.label')"
    :aria-roledescription="t('carousel.role')"
    :style="style"
    @keydown="keyboard"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
    @focusin="focused = true"
    @focusout="focusOut"
    @touchstart.passive="touchX = $event.touches[0]?.clientX"
    @touchend.passive="touchEnd"
  >
    <article
      v-for="(slide, index) in slides"
      :key="index"
      class="hero-slide"
      :class="{ active: index === current }"
      :aria-hidden="index !== current"
      :inert="index !== current"
    >
      <img
        :src="failed.has(index) ? fallback : slide.imageUrl"
        alt=""
        :fetchpriority="index === 0 ? 'high' : 'auto'"
        :loading="index === 0 ? 'eager' : 'lazy'"
        @error="imageError(index)"
      />
      <div class="hero-overlay"></div>
      <div class="hero-caption">
        <h1>
          <a :href="slide.url">{{ slide.title }}</a>
        </h1>
        <p v-if="slide.excerpt">{{ slide.excerpt }}</p>
      </div>
    </article>
    <div v-if="slides.length > 1" class="carousel-controls">
      <button
        type="button"
        :aria-label="t('carousel.previous')"
        @click="go(current - 1)"
      >
        ‹
      </button>
      <button
        v-for="(_, index) in slides"
        :key="index"
        class="carousel-dot"
        :aria-label="t('carousel.slide', { count: index + 1 })"
        :aria-current="index === current ? 'true' : undefined"
        @click="go(index)"
      >
        ●
      </button>
      <button
        type="button"
        :aria-label="t('carousel.next')"
        @click="go(current + 1)"
      >
        ›
      </button>
      <button
        type="button"
        :aria-label="
          paused || reduced ? t('carousel.play') : t('carousel.pause')
        "
        :aria-pressed="paused || reduced"
        @click="
          paused = !paused;
          reduced = false;
        "
      >
        {{ paused || reduced ? "▶" : "Ⅱ" }}
      </button>
    </div>
    <p class="sr-only" :aria-live="playing ? 'off' : 'polite'">
      {{ t("carousel.slide", { count: current + 1 }) }} / {{ slides.length }}
    </p>
  </section>
</template>
<style scoped>
.hero-carousel {
  position: relative;
  isolation: isolate;
  inline-size: 100%;
  height: var(--hero-height);
  aspect-ratio: 16/9;
  min-height: 160px;
  overflow: hidden;
  background: #344157;
  color: white;
}
.hero-slide {
  position: absolute;
  inset: 0;
  display: grid;
  align-items: var(--hero-justify);
  justify-items: var(--hero-align);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.5s;
}
.hero-slide.active {
  opacity: 1;
  visibility: visible;
}
.hero-slide img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(var(--hero-blur));
  transform: scale(1.03);
}
.hero-overlay {
  position: absolute;
  inset: 0;
  background: rgba(15, 24, 40, var(--hero-overlay));
}
.hero-caption {
  position: relative;
  z-index: 1;
  padding: 50px clamp(24px, 7vw, 110px) 70px;
  text-align: var(--hero-align);
  max-width: 100%;
  text-shadow: 0 2px 20px #16213b80;
}
.hero-caption h1 {
  font-size: var(--hero-title);
  line-height: 1.3;
  margin: 0 0 12px;
  overflow-wrap: anywhere;
}
.hero-caption p {
  font-size: var(--hero-description);
  margin: 0;
  line-height: 1.6;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.carousel-controls {
  position: absolute;
  inset-inline: 0;
  bottom: 15px;
  z-index: 2;
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 0 15px;
}
.carousel-controls button {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #ffffff25;
  color: white;
  border: 1px solid #ffffff60;
}
.carousel-controls button[aria-current] {
  background: var(--accent);
}
.carousel-dot {
  font-size: 10px;
}
.hero-carousel:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: -3px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
@media (max-width: 760px) {
  .hero-carousel {
    height: var(--hero-mobile-height);
    aspect-ratio: 4/3;
  }
  .hero-caption {
    padding: 24px 24px 60px;
  }
  .hero-caption h1 {
    font-size: var(--hero-mobile-title);
  }
  .hero-caption p {
    -webkit-line-clamp: 2;
  }
  .carousel-controls {
    gap: 4px;
  }
  .carousel-controls button {
    width: 28px;
    height: 28px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .hero-slide {
    transition: none;
  }
}
</style>
