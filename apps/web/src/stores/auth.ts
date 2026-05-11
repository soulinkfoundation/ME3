import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api } from "../api";

interface User {
  id: string;
  email: string;
  timezone: string | null;
  locale: string;
  localeSource: "explicit" | "inferred";
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const initialized = ref(false);
  let initializePromise: Promise<void> | null = null;

  const isAuthenticated = computed(() => !!user.value);

  function setSession(newUser: User) {
    user.value = newUser;
    initialized.value = true;
  }

  async function refreshSession(): Promise<boolean> {
    try {
      const response = await api.get<{ user: User }>("/auth/me");
      user.value = response.user;
      return true;
    } catch {
      user.value = null;
      return false;
    }
  }

  async function ensureInitialized(): Promise<void> {
    if (initialized.value) {
      return;
    }

    if (!initializePromise) {
      initializePromise = (async () => {
        await refreshSession();
        initialized.value = true;
      })().finally(() => {
        initializePromise = null;
      });
    }

    await initializePromise;
  }

  async function requestCode(email: string): Promise<boolean> {
    try {
      await api.post("/auth/request", { email });
      return true;
    } catch (error) {
      console.error("Request code error:", error);
      return false;
    }
  }

  async function verifyCode(email: string, code: string): Promise<boolean> {
    try {
      const response = await api.post<{ user: User }>(
        "/auth/verify",
        { email, code },
      );

      setSession(response.user);
      return true;
    } catch (error) {
      console.error("Verify code error:", error);
      return false;
    }
  }

  async function logout() {
    // Clear client auth state immediately so route guards stop treating
    // the user as authenticated before the network call completes.
    user.value = null;
    initialized.value = true;

    try {
      await api.post("/auth/logout");
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  return {
    user,
    initialized,
    isAuthenticated,
    ensureInitialized,
    refreshSession,
    requestCode,
    verifyCode,
    logout,
    setSession,
  };
});
