<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import type { RouteLocationRaw } from "vue-router";

export type ButtonTone = "green" | "black" | "red" | "orange" | "outline";
export type ButtonVariant = "primary" | "secondary" | "outline";
export type ButtonSize = "small" | "compact" | "medium" | "large";
export type ButtonShape = "pill" | "soft";

const props = withDefaults(
  defineProps<{
    /** Explicit color tone. Takes precedence over `variant`. */
    tone?: ButtonTone;
    /** Legacy variant API; maps to a tone when `tone` is omitted. */
    variant?: ButtonVariant;
    size?: ButtonSize;
    shape?: ButtonShape;
    iconOnly?: boolean;
    ariaLabel?: string;
    /** When set, renders as `RouterLink`. */
    to?: RouteLocationRaw;
    /** When set (and `to` is not), renders as `<a>`. */
    href?: string;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
  }>(),
  {
    variant: "outline",
    size: "medium",
    shape: "pill",
    iconOnly: false,
    type: "button",
  },
);

const usesTone = computed(() => props.tone !== undefined);

const root = computed(() => {
  if (props.to !== undefined) return RouterLink;
  if (props.href !== undefined) return "a";
  return "button";
});

const rootAttrs = computed(() => {
  if (props.to !== undefined) return { to: props.to };
  if (props.href !== undefined) return { href: props.href };
  return {
    type: props.type,
    disabled: props.disabled,
    "aria-label": props.iconOnly ? props.ariaLabel : undefined,
  };
});

const rootClass = computed(() => [
  "me3-btn",
  usesTone.value ? `me3-btn--${props.tone}` : `me3-btn--${props.variant}`,
  `me3-btn--${props.size}`,
  `me3-btn--${props.shape}`,
  { "me3-btn--icon-only": props.iconOnly },
]);
</script>

<template>
  <component :is="root" :class="rootClass" v-bind="rootAttrs">
    <span v-if="$slots.icon" class="me3-btn__icon">
      <slot name="icon" />
    </span>
    <span v-if="!iconOnly && $slots.default" class="me3-btn__label">
      <slot />
    </span>
  </component>
</template>

<style scoped>
.me3-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  font-family: inherit;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  border-style: solid;
  border-width: 1px;
  border-color: transparent;
}

button.me3-btn {
  appearance: none;
}

.me3-btn:focus-visible {
  outline: 2px solid var(--color-text);
  outline-offset: 2px;
}

.me3-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.me3-btn__icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  line-height: 0;
}

.me3-btn__label {
  line-height: 1;
}

/* --- tones --- */

.me3-btn--green {
  background: var(--ui-accent, var(--color-accent));
  border-color: var(--ui-accent, var(--color-accent));
  color: var(--ui-accent-contrast, var(--color-accent-contrast));
}

.me3-btn--green:hover:not(:disabled) {
  background: var(--ui-accent-strong, var(--color-accent));
  border-color: var(--ui-accent-strong, var(--color-accent));
}

.me3-btn--black {
  background: var(--ui-text, var(--color-text));
  border-color: var(--ui-text, var(--color-text));
  color: var(--ui-bg, var(--color-bg));
}

.me3-btn--black:hover:not(:disabled) {
  opacity: 0.9;
}

.me3-btn--red {
  background: #dc2626;
  border-color: #dc2626;
  color: #fff;
}

.me3-btn--red:hover:not(:disabled) {
  background: #b91c1c;
  border-color: #b91c1c;
}

.me3-btn--orange {
  background: #ea580c;
  border-color: #ea580c;
  color: #fff;
}

.me3-btn--orange:hover:not(:disabled) {
  background: #c2410c;
  border-color: #c2410c;
}

.me3-btn--outline {
  background: transparent;
  border-color: var(--ui-border, var(--color-border));
  color: var(--ui-text, var(--color-text));
}

.me3-btn--outline:hover:not(:disabled) {
  background: var(--ui-surface-muted, var(--color-bg-subtle));
}

/* Legacy variant API (when `tone` is not set). */

.me3-btn--primary {
  background: var(--color-accent);
  color: var(--color-bg);
  border-color: var(--color-accent);
  border-width: 0;
}

.me3-btn--primary:hover:not(:disabled) {
  opacity: 0.9;
}

.me3-btn--secondary {
  background: var(--color-border);
  color: var(--color-text);
  border-width: 0;
}

.me3-btn--secondary:hover:not(:disabled) {
  background: var(--color-text-muted);
  color: var(--color-bg);
}

/* --- shapes --- */

.me3-btn--pill {
  border-radius: 22px;
}

.me3-btn--soft {
  border-radius: var(--ui-radius-md, 8px);
}

/* --- sizes --- */

.me3-btn--small {
  gap: 6px;
  min-height: 32px;
  padding: 6px 10px;
  font-size: 13px;
}

.me3-btn--compact {
  gap: 7px;
  min-height: 36px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 800;
}

.me3-btn--medium {
  gap: 8px;
  min-height: 40px;
  padding: 8px 14px;
  font-size: 14px;
}

.me3-btn--large {
  gap: 10px;
  min-height: 44px;
  padding: 10px 18px;
  font-size: 15px;
}

.me3-btn--large.me3-btn--pill {
  border-radius: 10px;
}

/* --- icon only --- */

.me3-btn--icon-only.me3-btn--small {
  width: 32px;
  min-width: 32px;
  padding: 0;
}

.me3-btn--icon-only.me3-btn--compact {
  width: 36px;
  min-width: 36px;
  padding: 0;
}

.me3-btn--icon-only.me3-btn--medium {
  width: 40px;
  min-width: 40px;
  padding: 0;
}

.me3-btn--icon-only.me3-btn--large {
  width: 44px;
  min-width: 44px;
  padding: 0;
}
</style>
