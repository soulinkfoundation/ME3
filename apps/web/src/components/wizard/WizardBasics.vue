<script setup lang="ts">
import { ref, watch } from "vue";
import { useWizardStore } from "../../stores/wizard";
import { api } from "../../api";

const wizard = useWizardStore();

const name = ref(wizard.profile.name);
const handle = ref(wizard.profile.handle || wizard.username);
const location = ref(wizard.profile.location);
const bio = ref(wizard.profile.bio);

// Debounced username check
let checkTimeout: ReturnType<typeof setTimeout> | null = null;

watch(name, (val) => {
  wizard.updateProfile({ name: val });
});

watch(bio, (val) => {
  wizard.updateProfile({ bio: val });
});

watch(location, (val) => {
  wizard.updateProfile({ location: val });
});

watch(handle, async (val) => {
  const cleanHandle = val.toLowerCase().replace(/[^a-z0-9_-]/g, "");

  if (cleanHandle !== val) {
    handle.value = cleanHandle;
    return;
  }

  wizard.username = cleanHandle;
  wizard.updateProfile({ handle: cleanHandle });

  // Clear previous timeout
  if (checkTimeout) {
    clearTimeout(checkTimeout);
  }

  if (cleanHandle.length < 3) {
    wizard.isUsernameAvailable = null;
    return;
  }

  // Debounce the check
  wizard.isCheckingUsername = true;
  checkTimeout = setTimeout(async () => {
    try {
      const response = await api.get<{ available: boolean }>(
        `/usernames/${cleanHandle}/available`,
      );
      wizard.isUsernameAvailable = response.available;
    } catch {
      // If endpoint doesn't exist yet, assume available
      wizard.isUsernameAvailable = true;
    } finally {
      wizard.isCheckingUsername = false;
    }
  }, 500);
});

const bioLength = 160;
</script>

<template>
  <div class="step-basics">
    <h2>Let's start with the basics</h2>

    <div class="form-group">
      <label for="name">Your name *</label>
      <input
        id="name"
        v-model="name"
        type="text"
        placeholder="e.g. Alex Smith"
        maxlength="100"
        autofocus
      />
    </div>

    <div class="form-group">
      <label for="handle">Username (@handle) *</label>
      <div class="handle-input">
        <span class="handle-prefix">@</span>
        <input
          id="handle"
          v-model="handle"
          type="text"
          placeholder="e.g. alex"
          maxlength="30"
        />
      </div>
      <div class="handle-status">
        <span v-if="wizard.isCheckingUsername" class="checking">
          Checking availability...
        </span>
        <span
          v-else-if="handle.length >= 3 && wizard.isUsernameAvailable === true"
          class="available"
        >
          ✓ {{ handle }}.example.com is available!
        </span>
        <span
          v-else-if="handle.length >= 3 && wizard.isUsernameAvailable === false"
          class="taken"
        >
          ✗ This username is taken
        </span>
        <span v-else-if="handle.length > 0 && handle.length < 3" class="hint">
          Username must be at least 3 characters
        </span>
      </div>
    </div>

    <div class="form-group">
      <label for="bio">
        Short bio
        <span class="optional">(optional)</span>
      </label>
      <textarea
        id="bio"
        v-model="bio"
        placeholder="A brief description of who you are..."
        :maxlength="bioLength"
        rows="3"
      />
      <div class="char-count">{{ bio.length }}/{{ bioLength }}</div>
    </div>

    <div class="form-group">
      <label for="location">
        Location
        <span class="optional">(optional)</span>
      </label>
      <input
        id="location"
        v-model="location"
        type="text"
        placeholder='e.g. "Remote" or "Berlin, Germany"'
        maxlength="100"
      />
    </div>
  </div>
</template>

<style scoped>
.step-basics h2 {
  font-size: 28px;
  margin-bottom: 8px;
}

.form-group {
  margin-bottom: 24px;
}

.form-group label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.optional {
  font-weight: 400;
  color: var(--color-text-muted);
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 14px 16px;
  font-size: 16px;
  border: 2px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg);
  color: var(--color-text);
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--color-text);
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.handle-input {
  display: flex;
  align-items: center;
  border: 2px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.2s;
}

.handle-input:focus-within {
  border-color: var(--color-text);
}

.handle-prefix {
  padding: 14px 0 14px 16px;
  color: var(--color-text-muted);
  font-size: 16px;
  background: var(--color-bg);
}

.handle-input input {
  border: none;
  padding-left: 4px;
}

.handle-input input:focus {
  border: none;
}

.handle-status {
  margin-top: 8px;
  font-size: 13px;
  min-height: 20px;
}

.checking {
  color: var(--color-text-muted);
}

.available {
  color: #4caf50;
}

.taken {
  color: #e53935;
}

.hint {
  color: var(--color-text-muted);
}

.char-count {
  text-align: right;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 4px;
}
</style>
