<script setup lang="ts">
import type { WizardPaymentMethod } from "../../stores/wizard";
import StripePaymentSetupCallout from "./StripePaymentSetupCallout.vue";

withDefaults(
  defineProps<{
    modelValue: WizardPaymentMethod;
    instructions: string;
    inputId: string;
    compact?: boolean;
  }>(),
  {
    compact: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: WizardPaymentMethod];
  "update:instructions": [value: string];
}>();

function updateMethod(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  emit("update:modelValue", value === "manual" ? "manual" : "stripe");
}

function updateInstructions(event: Event) {
  emit("update:instructions", (event.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <fieldset class="payment-collection-fields">
    <legend>How will customers pay?</legend>
    <div class="payment-method-options">
      <label class="payment-method-option">
        <input
          type="radio"
          :name="`${inputId}-method`"
          value="stripe"
          :checked="modelValue === 'stripe'"
          @change="updateMethod"
        />
        <span>
          <strong>Pay online with Stripe</strong>
          <small>Payment is required before the booking or order is confirmed.</small>
        </span>
      </label>
      <label class="payment-method-option">
        <input
          type="radio"
          :name="`${inputId}-method`"
          value="manual"
          :checked="modelValue === 'manual'"
          @change="updateMethod"
        />
        <span>
          <strong>Pay separately</strong>
          <small>
            Payment is not taken now. The customer receives payment details by
            email after confirming.
          </small>
        </span>
      </label>
    </div>

    <div v-if="modelValue === 'manual'" class="payment-instructions-field">
      <label :for="`${inputId}-instructions`">Payment details for this offer</label>
      <textarea
        :id="`${inputId}-instructions`"
        :value="instructions"
        rows="4"
        maxlength="4000"
        required
        :aria-describedby="`${inputId}-instructions-help`"
        placeholder="Add a payment link, bank details, or explain how to pay."
        @input="updateInstructions"
      ></textarea>
      <small :id="`${inputId}-instructions-help`">
        Required for Pay separately. ME3 includes these details privately in
        the customer’s confirmation email; they never appear on your website.
      </small>
    </div>

    <StripePaymentSetupCallout
      v-if="modelValue === 'stripe'"
      :compact="compact"
    />
  </fieldset>
</template>

<style scoped>
.payment-collection-fields {
  display: grid;
  gap: 12px;
  margin: 14px 0 0;
  padding: 0;
  border: 0;
  color: var(--ui-text, var(--color-text));
}

.payment-collection-fields legend {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 700;
}

.payment-method-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.payment-method-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 44px;
  padding: 12px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-bg, var(--color-bg));
  cursor: pointer;
}

.payment-method-option:has(input:checked) {
  border-color: var(--ui-border-strong, var(--color-text));
}

.payment-method-option input {
  width: 18px;
  height: 18px;
  margin: 2px 0 0;
  accent-color: var(--ui-accent, var(--color-primary));
}

.payment-method-option span,
.payment-method-option strong,
.payment-method-option small {
  display: block;
}

.payment-method-option strong {
  font-size: 13px;
}

.payment-method-option small,
.payment-instructions-field small {
  margin-top: 3px;
  color: var(--ui-text-muted, var(--color-text-muted));
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
}

.payment-instructions-field {
  display: grid;
  gap: 7px;
}

.payment-instructions-field label {
  font-size: 13px;
  font-weight: 700;
}

.payment-instructions-field textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 96px;
  padding: 11px 12px;
  border: 1px solid var(--ui-border, var(--color-border));
  border-radius: var(--ui-radius-md, 10px);
  background: var(--ui-bg, var(--color-bg));
  color: var(--ui-text, var(--color-text));
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
}

.payment-instructions-field textarea:focus-visible,
.payment-method-option:focus-within {
  outline: 2px solid var(--ui-accent, var(--color-primary));
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .payment-method-options {
    grid-template-columns: 1fr;
  }
}
</style>
