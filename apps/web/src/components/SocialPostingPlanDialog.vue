<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppDialog from "./AppDialog.vue";
import Button from "./Button.vue";
import UiIcon from "./UiIcon.vue";
import {
  useSocialStore,
  type PostingPlan,
  type PreferredPostingTime,
  type SocialAccountRow,
  type SocialPlatform,
  type SocialPlatformCapabilities,
} from "../stores/social";
import {
  detectBrowserTimeZone,
  instantToLocalDateTimeParts,
  resolveLocalDateTimeToUtc,
} from "../utils/timezone";

const props = defineProps<{
  open: boolean;
  siteId: string;
  accounts: SocialAccountRow[];
  capabilities: SocialPlatformCapabilities[];
  initialPlanId?: string | null;
}>();

const emit = defineEmits<{
  close: [];
  confirmed: [plan: PostingPlan];
  siteChange: [siteId: string];
}>();

const social = useSocialStore();
const browserTimezone = detectBrowserTimeZone() || "UTC";
const accountId = ref("");
const timezone = ref(browserTimezone);
const preferredTimes = ref<PreferredPostingTime[]>([{ day: "monday", localTime: "09:00" }]);
const minimumGapMinutes = ref(120);
const minimumRepostDays = ref<number | null>(null);
const windowStart = ref("");
const windowEnd = ref("");
const requestedCount = ref(3);
const preferenceSaved = ref(false);
const plan = ref<PostingPlan | null>(null);
const loading = ref(false);
const error = ref("");
const planningWindowEdited = ref(false);

const schedulablePlatforms = computed(() => new Set(
  props.capabilities.filter((capability) => capability.schedule).map((capability) => capability.platform),
));

const availableAccounts = computed(() => props.accounts.filter(
  (account) =>
    account.siteId === props.siteId &&
    account.status === "active" &&
    schedulablePlatforms.value.has(account.platform as SocialPlatform),
));

const canSavePreference = computed(() => Boolean(
  accountId.value && timezone.value.trim() && preferredTimes.value.length,
));

const canPropose = computed(() => Boolean(
  preferenceSaved.value &&
  accountId.value &&
  windowStart.value &&
  windowEnd.value &&
  requestedCount.value >= 1,
));

const canConfirm = computed(() => Boolean(
  plan.value &&
  plan.value.items.length &&
  (plan.value.status === "suggested" || plan.value.status === "needs_attention"),
));

watch(
  [() => props.open, () => props.initialPlanId] as const,
  ([open, initialPlanId], previous) => {
    if (!open) return;
    error.value = "";
    const wasOpen = previous?.[0] || false;
    const previousPlanId = previous?.[1] || null;
    if (initialPlanId) {
      if (!wasOpen || initialPlanId !== previousPlanId || plan.value?.id !== initialPlanId) {
        void loadPlan(initialPlanId);
      }
      return;
    }
    if (wasOpen && !previousPlanId) return;
    resetFreshPlan();
  },
  { immediate: true },
);

function resetFreshPlan() {
  plan.value = null;
  loading.value = false;
  preferenceSaved.value = false;
  timezone.value = browserTimezone;
  preferredTimes.value = [{ day: "monday", localTime: "09:00" }];
  minimumGapMinutes.value = 120;
  minimumRepostDays.value = null;
  requestedCount.value = 3;
  windowStart.value = "";
  windowEnd.value = "";
  planningWindowEdited.value = false;
  if (!accountId.value || !availableAccounts.value.some((account) => account.id === accountId.value)) {
    accountId.value = availableAccounts.value[0]?.id || "";
  }
  setDefaultWindow(true);
  if (accountId.value) void loadPreference();
}

watch(accountId, () => {
  if (plan.value?.accountId === accountId.value) return;
  preferenceSaved.value = false;
  plan.value = null;
  if (props.open && accountId.value) void loadPreference();
});

function setDefaultWindow(force = false) {
  if (!force && windowStart.value && windowEnd.value) return;
  const today = zonedDateKey(new Date(), timezone.value) || zonedDateKey(new Date(), browserTimezone);
  if (!today) return;
  const start = addCalendarDays(today, 1);
  windowStart.value = `${start}T00:00`;
  windowEnd.value = `${addCalendarDays(start, 7)}T00:00`;
  planningWindowEdited.value = false;
}

function zonedInput(date: Date, timeZone: string): string | null {
  const parts = instantToLocalDateTimeParts(date.toISOString(), timeZone);
  return parts ? `${parts.date}T${parts.time}` : null;
}

function zonedDateKey(date: Date, timeZone: string): string | null {
  return instantToLocalDateTimeParts(date.toISOString(), timeZone)?.date || null;
}

function resolveZonedInput(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { ok: false as const, reason: "invalid" as const };
  return resolveLocalDateTimeToUtc(
    `${match[1]}-${match[2]}-${match[3]}`,
    `${match[4]}:${match[5]}`,
    timeZone,
  );
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + days, 12));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

async function loadPreference() {
  const selected = accountId.value;
  if (!selected) return;
  loading.value = true;
  error.value = "";
  try {
    const preference = await social.fetchPreferredPostingTimes(selected);
    if (selected !== accountId.value) return;
    if (preference) {
      timezone.value = preference.timezone;
      preferredTimes.value = preference.times.length
        ? preference.times
        : [{ day: "monday", localTime: "09:00" }];
      minimumGapMinutes.value = preference.minimumGapMinutes;
      minimumRepostDays.value = preference.minimumRepostDays;
      preferenceSaved.value = true;
      if (!plan.value && !planningWindowEdited.value) setDefaultWindow(true);
    } else {
      timezone.value = browserTimezone;
      preferredTimes.value = [{ day: "monday", localTime: "09:00" }];
      minimumGapMinutes.value = 120;
      minimumRepostDays.value = null;
      preferenceSaved.value = false;
      if (!plan.value && !planningWindowEdited.value) setDefaultWindow(true);
    }
  } catch (value) {
    social.setErrorFromApi(value, "Could not load Preferred posting times");
    error.value = social.error || "Could not load Preferred posting times";
  } finally {
    loading.value = false;
  }
}

async function savePreference() {
  if (!canSavePreference.value) return;
  loading.value = true;
  error.value = "";
  try {
    await social.updatePreferredPostingTimes(accountId.value, {
      timezone: timezone.value,
      times: preferredTimes.value,
      minimumGapMinutes: Number(minimumGapMinutes.value),
      minimumRepostDays: typeof minimumRepostDays.value === "number"
        ? Number(minimumRepostDays.value)
        : null,
    });
    preferenceSaved.value = true;
  } catch (value) {
    social.setErrorFromApi(value, "Could not save Preferred posting times");
    error.value = social.error || "Could not save Preferred posting times";
  } finally {
    loading.value = false;
  }
}

function addPreferredTime() {
  preferredTimes.value = [...preferredTimes.value, { day: "monday", localTime: "09:00" }];
  preferenceSaved.value = false;
}

function removePreferredTime(index: number) {
  preferredTimes.value = preferredTimes.value.filter((_, itemIndex) => itemIndex !== index);
  preferenceSaved.value = false;
}

async function proposePlan() {
  if (!canPropose.value) return;
  const startResolution = resolveZonedInput(windowStart.value, timezone.value);
  const endResolution = resolveZonedInput(windowEnd.value, timezone.value);
  if (!startResolution.ok || !endResolution.ok) {
    const ambiguous = (!startResolution.ok && startResolution.reason === "ambiguous") ||
      (!endResolution.ok && endResolution.reason === "ambiguous");
    error.value = ambiguous
      ? `Choose unambiguous planning-window times in ${timezone.value}.`
      : `Choose valid planning-window times that exist in ${timezone.value}.`;
    return;
  }
  const start = startResolution.value;
  const end = endResolution.value;
  if (Date.parse(start) >= Date.parse(end)) {
    error.value = "Choose a planning window with an end after its start.";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    plan.value = await social.createPostingPlan({
      accountId: accountId.value,
      windowStart: start,
      windowEnd: end,
      count: Number(requestedCount.value),
    });
  } catch (value) {
    social.setErrorFromApi(value, "Could not propose a Posting plan");
    error.value = social.error || "Could not propose a Posting plan";
  } finally {
    loading.value = false;
  }
}

async function loadPlan(planId: string) {
  if (plan.value?.id !== planId) plan.value = null;
  loading.value = true;
  error.value = "";
  try {
    const loaded = await social.fetchPostingPlan(planId);
    if (props.initialPlanId !== planId) return;
    emit("siteChange", loaded.siteId);
    plan.value = loaded;
    accountId.value = loaded.accountId;
    requestedCount.value = loaded.requestedCount;
    await loadPreference();
    const planTimezone = loaded.timezone || loaded.items[0]?.timezone || timezone.value;
    windowStart.value = zonedInput(new Date(loaded.windowStart), planTimezone) || loaded.windowStart.slice(0, 16);
    windowEnd.value = zonedInput(new Date(loaded.windowEnd), planTimezone) || loaded.windowEnd.slice(0, 16);
    planningWindowEdited.value = true;
  } catch (value) {
    if (props.initialPlanId !== planId) return;
    social.setErrorFromApi(value, "Could not load this Posting plan");
    error.value = social.error || "Could not load this Posting plan";
  } finally {
    if (props.initialPlanId === planId) loading.value = false;
  }
}

async function confirmPlan() {
  if (!plan.value || !canConfirm.value) return;
  loading.value = true;
  error.value = "";
  try {
    plan.value = await social.confirmPostingPlan(plan.value);
    if (plan.value.status === "confirmed") emit("confirmed", plan.value);
  } catch (value) {
    social.setErrorFromApi(value, "Could not confirm this Posting plan");
    error.value = social.error || "Could not confirm this Posting plan";
  } finally {
    loading.value = false;
  }
}

function formatPlanTime(value: string, planTimezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: planTimezone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}
</script>

<template>
  <AppDialog :open="open" labelled-by="posting-plan-title" @close="emit('close')">
    <section class="posting-plan-card" :aria-busy="loading">
      <span v-if="loading" class="sr-only" role="status" aria-live="polite">Updating Posting plan…</span>
      <header>
        <div>
          <h2 id="posting-plan-title">Posting plan</h2>
          <p>ME3 proposes times for review. Nothing is scheduled until you confirm the exact plan.</p>
        </div>
        <Button color="ghost" shape="soft" size="compact" icon-only type="button" aria-label="Close Posting plan" @click="emit('close')">
          <UiIcon name="X" :size="17" aria-hidden="true" />
        </Button>
      </header>

      <p v-if="error" class="plan-error" role="alert">{{ error }}</p>

      <label class="plan-field">
        <span>Account</span>
        <select v-model="accountId" :disabled="loading || Boolean(initialPlanId)">
          <option value="">Choose an account</option>
          <option v-for="account in availableAccounts" :key="account.id" :value="account.id">
            {{ account.displayName || account.handle || account.platform }}
          </option>
        </select>
      </label>

      <fieldset :disabled="loading || !accountId">
        <legend>Preferred posting times</legend>
        <label class="plan-field">
          <span>Timezone</span>
          <input v-model="timezone" autocomplete="off" placeholder="Europe/Dublin" @input="preferenceSaved = false" />
        </label>
        <div class="preferred-times">
          <div v-for="(time, index) in preferredTimes" :key="index" class="preferred-time-row">
            <label>
              <span class="sr-only">Preferred weekday {{ index + 1 }}</span>
              <select v-model="time.day" @change="preferenceSaved = false">
                <option value="monday">Monday</option>
                <option value="tuesday">Tuesday</option>
                <option value="wednesday">Wednesday</option>
                <option value="thursday">Thursday</option>
                <option value="friday">Friday</option>
                <option value="saturday">Saturday</option>
                <option value="sunday">Sunday</option>
              </select>
            </label>
            <label>
              <span class="sr-only">Preferred local time {{ index + 1 }}</span>
              <input v-model="time.localTime" type="time" @input="preferenceSaved = false" />
            </label>
            <Button color="ghost" shape="soft" size="compact" icon-only type="button" aria-label="Remove Preferred posting time" :disabled="preferredTimes.length === 1" @click="removePreferredTime(index)">
              <UiIcon name="Trash2" :size="15" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <Button color="ghost" shape="soft" size="compact" type="button" @click="addPreferredTime">Add time</Button>
        <div class="rule-grid">
          <label class="plan-field">
            <span>Minimum gap (minutes)</span>
            <input v-model.number="minimumGapMinutes" type="number" min="0" max="10080" @input="preferenceSaved = false" />
          </label>
          <label class="plan-field">
            <span>Minimum time before reposting (days, optional)</span>
            <input v-model.number="minimumRepostDays" type="number" min="0" max="3650" @input="preferenceSaved = false" />
          </label>
        </div>
        <Button color="outline" shape="soft" size="compact" type="button" :disabled="loading || !canSavePreference" @click="savePreference">
          {{ preferenceSaved ? 'Preferences saved' : 'Save preferences' }}
        </Button>
      </fieldset>

      <fieldset :disabled="loading || !preferenceSaved || Boolean(initialPlanId)">
        <legend>Planning window</legend>
        <div class="rule-grid">
          <label class="plan-field">
            <span>Start</span>
            <input v-model="windowStart" type="datetime-local" @input="planningWindowEdited = true" />
          </label>
          <label class="plan-field">
            <span>End</span>
            <input v-model="windowEnd" type="datetime-local" @input="planningWindowEdited = true" />
          </label>
          <label class="plan-field">
            <span>Number of Posts</span>
            <input v-model.number="requestedCount" type="number" min="1" max="20" />
          </label>
        </div>
        <Button color="primary" shape="soft" size="compact" type="button" :disabled="loading || !canPropose" @click="proposePlan">
          Propose times
        </Button>
      </fieldset>

      <section v-if="plan" class="plan-review" aria-labelledby="posting-plan-review-title" aria-live="polite">
        <div class="plan-review__heading">
          <div>
            <h3 id="posting-plan-review-title">Review the exact plan</h3>
            <p>{{ plan.accountLabel }} · {{ plan.minimumGapMinutes }} minute minimum gap</p>
          </div>
          <span class="plan-status">{{ plan.status.replace('_', ' ') }}</span>
        </div>
        <ul v-if="plan.warnings.length" class="plan-warnings" aria-label="Posting plan warnings">
          <li v-for="warning in plan.warnings" :key="`${warning.code}:${warning.versionId || warning.scheduledFor || warning.message}`">
            {{ warning.message }}
          </li>
        </ul>
        <ol class="plan-items">
          <li v-for="item in plan.items" :key="item.id">
            <div>
              <strong>{{ item.sourceTitle }}</strong>
              <p>{{ item.postText }}</p>
            </div>
            <div class="plan-item-time">
              <time :datetime="item.scheduledFor">{{ formatPlanTime(item.scheduledFor, item.timezone) }}</time>
              <span v-if="item.isRepost">Repost</span>
              <span v-if="item.errorMessage" class="plan-item-error">{{ item.errorMessage }}</span>
            </div>
          </li>
        </ol>
        <p v-if="plan.items.length === 0" class="plan-empty">No safe times were found. Adjust the window or preferences and make a fresh plan.</p>
        <footer>
          <span v-if="plan.status === 'confirmed'">All plan items are linked to scheduled Publications.</span>
          <Button v-else color="primary" shape="soft" size="compact" type="button" :disabled="loading || !canConfirm" @click="confirmPlan">
            Confirm and schedule this exact plan
          </Button>
        </footer>
      </section>
    </section>
  </AppDialog>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.posting-plan-card {
  display: grid;
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  gap: 18px;
  overflow: auto;
  box-sizing: border-box;
  padding: 20px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-surface);
  color: var(--ui-text);
  box-shadow: var(--ui-shadow-md);
}

.posting-plan-card header,
.plan-review__heading,
.plan-review footer,
.preferred-time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.posting-plan-card h2,
.posting-plan-card h3,
.posting-plan-card p {
  margin: 0;
}

.posting-plan-card header p,
.plan-review__heading p,
.plan-empty,
.plan-review footer,
.plan-items p {
  color: var(--ui-text-muted);
  font-size: 0.85rem;
}

.posting-plan-card fieldset,
.plan-review {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 14px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.posting-plan-card legend,
.plan-field > span {
  font-size: 0.82rem;
  font-weight: 650;
}

.plan-field {
  display: grid;
  gap: 6px;
}

.posting-plan-card input,
.posting-plan-card select {
  width: 100%;
  min-height: 44px;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  color: var(--ui-text);
  font: inherit;
}

.posting-plan-card :deep(button) {
  min-width: 44px;
  min-height: 44px;
}

.posting-plan-card input:focus,
.posting-plan-card select:focus {
  border-color: var(--ui-accent);
  outline: 2px solid var(--ui-accent-soft);
}

.preferred-times,
.plan-items {
  display: grid;
  gap: 8px;
}

.preferred-time-row {
  justify-content: flex-start;
}

.preferred-time-row label {
  flex: 1;
}

.rule-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.plan-error,
.plan-warnings {
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, #c94b4b 42%, var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-muted);
}

.plan-warnings {
  display: grid;
  gap: 5px;
  margin: 0;
  padding-left: 30px;
  color: var(--ui-text-muted);
  font-size: 0.85rem;
}

.plan-status {
  padding: 3px 8px;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  color: var(--ui-text-muted);
  font-size: 0.75rem;
  text-transform: capitalize;
}

.plan-items {
  margin: 0;
  padding-left: 26px;
}

.plan-items li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--ui-border);
}

.plan-items p {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 4px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.plan-item-time {
  display: grid;
  justify-items: end;
  gap: 4px;
  color: var(--ui-text-muted);
  font-size: 0.82rem;
}

.plan-item-error {
  max-width: 240px;
  color: var(--ui-text);
  text-align: right;
}

@media (max-width: 620px) {
  .rule-grid,
  .plan-items li {
    grid-template-columns: 1fr;
  }

  .plan-item-time {
    justify-items: start;
  }
}
</style>
