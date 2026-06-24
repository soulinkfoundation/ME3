<script setup lang="ts">
import { ref, watch } from "vue";
import { useSitesStore, type Subscriber } from "../stores/sites";

const props = defineProps<{
  username: string;
  /** When true, shows a simpler inline layout without the expandable list (for wizard) */
  compact?: boolean;
}>();

const sites = useSitesStore();

const subscriberCount = ref<number>(0);
const showSubscribers = ref(false);
const subscribers = ref<Subscriber[]>([]);
const loadingSubscribers = ref(false);
const exportingSubscribers = ref(false);
const importingSubscribers = ref(false);
const importResult = ref<{ imported: number; skipped: number } | null>(null);
const importError = ref<string | null>(null);
const importFileInput = ref<HTMLInputElement | null>(null);
const subscriberPage = ref<number>(1);
const subscriberLimit = ref<number>(50);
const subscriberPagination = ref<{
  page: number;
  limit: number;
  total: number;
  pages: number;
} | null>(null);

const showAddModal = ref(false);
const addEmail = ref("");
const addFirstName = ref("");
const addLastName = ref("");
const addingSubscriber = ref(false);
const addResult = ref<string | null>(null);
const addError = ref<string | null>(null);

watch(
  () => props.username,
  async (username) => {
    if (username) {
      subscriberCount.value = await sites.getSubscriberCount(username);
    } else {
      subscriberCount.value = 0;
    }
  },
  { immediate: true },
);

async function loadSubscribers(page = 1) {
  if (loadingSubscribers.value || !props.username) return;
  loadingSubscribers.value = true;

  const result = await sites.getSubscribers(
    props.username,
    page,
    subscriberLimit.value,
  );
  if (result) {
    subscribers.value = result.subscribers;
    subscriberPagination.value = result.pagination;
    subscriberPage.value = result.pagination.page;
  }

  loadingSubscribers.value = false;
}

async function toggleSubscribers() {
  showSubscribers.value = !showSubscribers.value;
  if (showSubscribers.value) {
    subscriberPage.value = 1;
    await loadSubscribers(1);
  }
}

async function goToPage(page: number) {
  if (
    page >= 1 &&
    subscriberPagination.value &&
    page <= subscriberPagination.value.pages
  ) {
    await loadSubscribers(page);
    const subscribersSection = document.querySelector(".subscribers-list");
    if (subscribersSection) {
      subscribersSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

async function exportSubscribers() {
  if (exportingSubscribers.value || !props.username) return;
  exportingSubscribers.value = true;
  await sites.exportSubscribers(props.username);
  exportingSubscribers.value = false;
}

async function removeSubscriber(id: number) {
  if (!confirm("Remove this subscriber?") || !props.username) return;
  const success = await sites.deleteSubscriber(props.username, id);
  if (success) {
    subscribers.value = subscribers.value.filter((s) => s.id !== id);
    subscriberCount.value = Math.max(0, subscriberCount.value - 1);
    if (subscriberPagination.value) {
      subscriberPagination.value.total = Math.max(
        0,
        subscriberPagination.value.total - 1,
      );
    }
    if (subscribers.value.length === 0 && subscriberPage.value > 1) {
      await goToPage(subscriberPage.value - 1);
    } else if (subscribers.value.length === 0) {
      await loadSubscribers(subscriberPage.value);
    }
  }
}

function openAddModal() {
  addEmail.value = "";
  addFirstName.value = "";
  addLastName.value = "";
  addResult.value = null;
  addError.value = null;
  showAddModal.value = true;
}

function closeAddModal() {
  showAddModal.value = false;
}

async function submitAddSubscriber() {
  if (addingSubscriber.value || !props.username) return;
  addResult.value = null;
  addError.value = null;

  const email = addEmail.value.trim();
  if (!email) {
    addError.value = "Email is required";
    return;
  }

  addingSubscriber.value = true;

  const result = await sites.addSubscriber(
    props.username,
    email,
    addFirstName.value.trim() || undefined,
    addLastName.value.trim() || undefined,
  );

  addingSubscriber.value = false;

  if (result) {
    addResult.value = result.resubscribed ? "Subscriber re-added." : "Subscriber added.";
    subscriberCount.value = await sites.getSubscriberCount(props.username);
    if (showSubscribers.value) {
      await loadSubscribers(subscriberPage.value);
    }
    addEmail.value = "";
    addFirstName.value = "";
    addLastName.value = "";
  } else {
    addError.value = sites.error || "Failed to add subscriber";
  }
}

function triggerImport() {
  importFileInput.value?.click();
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !props.username) return;

  importingSubscribers.value = true;
  importResult.value = null;
  importError.value = null;

  const result = await sites.importSubscribers(props.username, file);

  if (result) {
    importResult.value = { imported: result.imported, skipped: result.skipped };
    subscriberCount.value = await sites.getSubscriberCount(props.username);
    if (showSubscribers.value) {
      await loadSubscribers(subscriberPage.value);
    }
  } else {
    importError.value = sites.error || "Failed to import subscribers";
  }

  importingSubscribers.value = false;
  input.value = "";
}
</script>

<template>
  <div class="newsletter-subscribers" :class="{ compact }">
    <div class="section-header">
      <div>
        <h2 v-if="!compact">Newsletter Subscribers</h2>
        <p v-else class="compact-label">Subscriber list</p>
        <p class="subscriber-count">
          {{ subscriberCount }} subscriber{{ subscriberCount === 1 ? "" : "s" }}
        </p>
      </div>
      <div class="subscriber-actions">
        <button
          class="button secondary small add-btn"
          @click="openAddModal"
          title="Add subscriber"
        >
          +
        </button>
        <button
          class="button secondary small"
          :disabled="importingSubscribers"
          @click="triggerImport"
        >
          {{ importingSubscribers ? "Importing..." : "Import CSV" }}
        </button>
        <input
          ref="importFileInput"
          type="file"
          accept=".csv"
          style="display: none"
          @change="handleImportFile"
        />
        <button
          class="button secondary small"
          :disabled="exportingSubscribers || subscriberCount === 0"
          @click="exportSubscribers"
        >
          {{ exportingSubscribers ? "Exporting..." : "Export CSV" }}
        </button>
        <button
          v-if="!compact && subscriberCount > 0"
          class="button secondary small"
          @click="toggleSubscribers"
        >
          {{ showSubscribers ? "Hide" : "View" }}
        </button>
      </div>
    </div>

    <!-- Add Subscriber Modal -->
    <Teleport to="body">
      <div v-if="showAddModal" class="modal-overlay" @click.self="closeAddModal">
        <div class="modal">
          <div class="modal-header">
            <h3>Add Subscriber</h3>
            <button class="modal-close" @click="closeAddModal">×</button>
          </div>
          <div class="modal-body">
            <div v-if="addResult" class="add-result add-success">
              ✓ {{ addResult }}
            </div>
            <div v-if="addError" class="add-result add-error-msg">
              ✕ {{ addError }}
            </div>
            <div class="modal-form-group">
              <label>Email <span class="required">*</span></label>
              <input
                v-model="addEmail"
                type="email"
                placeholder="email@example.com"
                @keydown.enter="submitAddSubscriber"
                autofocus
              />
            </div>
            <div class="modal-form-row">
              <div class="modal-form-group">
                <label>First name <span class="optional-label">(optional)</span></label>
                <input
                  v-model="addFirstName"
                  type="text"
                  placeholder="Jane"
                  @keydown.enter="submitAddSubscriber"
                />
              </div>
              <div class="modal-form-group">
                <label>Last name <span class="optional-label">(optional)</span></label>
                <input
                  v-model="addLastName"
                  type="text"
                  placeholder="Smith"
                  @keydown.enter="submitAddSubscriber"
                />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="button secondary small" @click="closeAddModal">Cancel</button>
            <button
              class="button small"
              :disabled="addingSubscriber || !addEmail.trim()"
              @click="submitAddSubscriber"
            >
              {{ addingSubscriber ? "Adding..." : "Add Subscriber" }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <div v-if="importResult" class="import-result">
      <span class="import-success">
        ✓ Imported {{ importResult.imported }} subscriber{{
          importResult.imported === 1 ? "" : "s"
        }}
      </span>
      <span v-if="importResult.skipped > 0" class="import-skipped">
        ({{ importResult.skipped }} skipped)
      </span>
      <button class="dismiss-btn" @click="importResult = null">×</button>
    </div>
    <div v-if="importError" class="import-result import-error">
      <span class="import-error-text">✕ {{ importError }}</span>
      <button class="dismiss-btn" @click="importError = null">×</button>
    </div>

    <div v-if="!compact && showSubscribers" class="subscribers-list">
      <div v-if="loadingSubscribers" class="loading-small">Loading...</div>
      <div v-else-if="subscribers.length === 0" class="empty-small">
        No subscribers yet
      </div>
      <template v-else>
        <div v-if="subscriberPagination" class="pagination-info">
          Showing
          {{
            (subscriberPagination.page - 1) * subscriberPagination.limit + 1
          }}–{{
            Math.min(
              subscriberPagination.page * subscriberPagination.limit,
              subscriberPagination.total,
            )
          }}
          of {{ subscriberPagination.total }} subscribers
        </div>
        <table class="subscribers-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Subscribed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sub in subscribers" :key="sub.id">
              <td>{{ sub.email }}</td>
              <td>
                {{ new Date(sub.subscribed_at).toLocaleDateString() }}
              </td>
              <td>
                <button
                  class="remove-btn"
                  @click="removeSubscriber(sub.id)"
                  title="Remove"
                >
                  ×
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div
          v-if="subscriberPagination && subscriberPagination.pages > 1"
          class="pagination-controls"
        >
          <button
            class="button secondary small"
            :disabled="subscriberPage === 1 || loadingSubscribers"
            @click="goToPage(subscriberPage - 1)"
          >
            ← Previous
          </button>
          <span class="pagination-page-info">
            Page {{ subscriberPage }} of {{ subscriberPagination.pages }}
          </span>
          <button
            class="button secondary small"
            :disabled="
              subscriberPage === subscriberPagination.pages ||
              loadingSubscribers
            "
            @click="goToPage(subscriberPage + 1)"
          >
            Next →
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.section-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.section-header > div:first-child {
  min-width: 0;
}

.newsletter-subscribers h2 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.compact-label {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}

.subscriber-count {
  font-size: 13px;
  color: var(--color-text-muted);
  margin: 0;
}

.subscriber-actions {
  display: flex;
  max-width: 100%;
  flex-wrap: wrap;
  gap: 8px;
}

.subscriber-actions .button {
  white-space: nowrap;
}

.button {
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  background: var(--color-text);
  color: var(--color-bg);
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.button:hover:not(:disabled) {
  opacity: 0.9;
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button.secondary {
  background: var(--color-border);
  color: var(--color-text);
}

.button.secondary:hover:not(:disabled) {
  background: var(--color-text-muted);
  color: var(--color-bg);
}

.button.small {
  padding: 8px 14px;
  font-size: 12px;
}

.import-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(76, 175, 80, 0.1);
  border-radius: 8px;
  margin-top: 12px;
  font-size: 13px;
}

.import-success {
  color: #4caf50;
  font-weight: 500;
}

.import-result.import-error {
  background: rgba(244, 67, 54, 0.1);
}

.import-error-text {
  color: #f44336;
  font-weight: 500;
}

.import-skipped {
  color: var(--color-text-muted);
}

.dismiss-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
}

.dismiss-btn:hover {
  color: var(--color-text);
}

.subscribers-list {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}

.loading-small,
.empty-small {
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
  padding: 16px;
}

.subscribers-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.subscribers-table th {
  text-align: left;
  font-weight: 600;
  padding: 8px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  color: var(--color-text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.subscribers-table td {
  padding: 10px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.1);
}

.subscribers-table tr:last-child td {
  border-bottom: none;
}

.subscribers-table .remove-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.subscribers-table .remove-btn:hover {
  background: rgba(229, 57, 53, 0.1);
  color: #e53935;
}

.pagination-info {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 12px;
}

.pagination-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}

.pagination-page-info {
  font-size: 13px;
  color: var(--color-text-muted);
}

.add-btn {
  font-size: 16px;
  font-weight: 400;
  padding: 6px 12px;
  line-height: 1;
}

@media (max-width: 420px) {
  .subscriber-actions {
    width: 100%;
  }
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.modal-header h3 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.modal-close:hover {
  color: var(--color-text);
}

.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-form-row {
  display: flex;
  gap: 12px;
}

.modal-form-row .modal-form-group {
  flex: 1;
}

.modal-form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.modal-form-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-muted);
}

.modal-form-group input {
  padding: 9px 12px;
  font-size: 14px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
}

.modal-form-group input:focus {
  outline: none;
  border-color: var(--color-text);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
}

.add-result {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
}

.add-success {
  background: rgba(76, 175, 80, 0.1);
  color: #4caf50;
}

.add-error-msg {
  background: rgba(244, 67, 54, 0.1);
  color: #f44336;
}

.required {
  color: var(--color-text-muted);
}

.optional-label {
  font-weight: 400;
  color: var(--color-text-muted);
}
</style>
