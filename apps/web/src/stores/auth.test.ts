import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAuthStore } from "./auth";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("auth store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("should start unauthenticated before hydration", () => {
      const store = useAuthStore();
      expect(store.user).toBeNull();
      expect(store.isAuthenticated).toBe(false);
      expect(store.initialized).toBe(false);
    });

    it("should hydrate session from /auth/me", async () => {
      vi.mocked(api.get).mockResolvedValue({
        user: {
          id: "123",
          email: "test@example.com",
          timezone: null,
          locale: "en-US",
          localeSource: "inferred",
        },
      });

      const store = useAuthStore();
      await store.ensureInitialized();

      expect(store.initialized).toBe(true);
      expect(store.user).toEqual({
        id: "123",
        email: "test@example.com",
        timezone: null,
        locale: "en-US",
        localeSource: "inferred",
      });
      expect(store.isAuthenticated).toBe(true);
      expect(api.get).toHaveBeenCalledWith("/auth/me");
    });

    it("should treat missing session as unauthenticated", async () => {
      vi.mocked(api.get).mockRejectedValue(new Error("Unauthorized"));

      const store = useAuthStore();
      await store.ensureInitialized();

      expect(store.initialized).toBe(true);
      expect(store.user).toBeNull();
      expect(store.isAuthenticated).toBe(false);
    });

    it("should not re-fetch after initialization", async () => {
      vi.mocked(api.get).mockResolvedValue({
        user: {
          id: "123",
          email: "test@example.com",
          timezone: null,
          locale: "en-US",
          localeSource: "inferred",
        },
      });

      const store = useAuthStore();
      await store.ensureInitialized();
      await store.ensureInitialized();

      expect(api.get).toHaveBeenCalledTimes(1);
    });
  });

  describe("logout", () => {
    it("should call logout endpoint and clear user", async () => {
      vi.mocked(api.post).mockResolvedValue({ ok: true });

      const store = useAuthStore();
      store.setSession({
        id: "123",
        email: "test@example.com",
        timezone: null,
        locale: "en-US",
        localeSource: "inferred",
      });
      await store.logout();

      expect(api.post).toHaveBeenCalledWith("/auth/logout");
      expect(store.user).toBeNull();
      expect(store.isAuthenticated).toBe(false);
      expect(store.initialized).toBe(true);
    });

    it("should still clear user when logout endpoint fails", async () => {
      vi.mocked(api.post).mockRejectedValue(new Error("Network error"));

      const store = useAuthStore();
      store.setSession({
        id: "123",
        email: "test@example.com",
        timezone: null,
        locale: "en-US",
        localeSource: "inferred",
      });
      await store.logout();

      expect(store.user).toBeNull();
      expect(store.isAuthenticated).toBe(false);
      expect(store.initialized).toBe(true);
    });

    it("should clear user immediately before logout request resolves", async () => {
      let resolveLogout: (value: unknown) => void = () => {};
      const pendingLogout = new Promise((resolve) => {
        resolveLogout = resolve;
      });
      vi.mocked(api.post).mockReturnValue(pendingLogout as never);

      const store = useAuthStore();
      store.setSession({
        id: "123",
        email: "test@example.com",
        timezone: null,
        locale: "en-US",
        localeSource: "inferred",
      });

      const logoutPromise = store.logout();

      expect(store.user).toBeNull();
      expect(store.isAuthenticated).toBe(false);
      expect(store.initialized).toBe(true);

      resolveLogout({ ok: true });
      await logoutPromise;
    });
  });

  describe("requestCode", () => {
    it("should successfully request code", async () => {
      vi.mocked(api.post).mockResolvedValue({ ok: true });

      const store = useAuthStore();
      const result = await store.requestCode("test@example.com");

      expect(result).toBe(true);
      expect(api.post).toHaveBeenCalledWith("/auth/request", {
        email: "test@example.com",
      });
    });

    it("should return false on error", async () => {
      vi.mocked(api.post).mockRejectedValue(new Error("Network error"));

      const store = useAuthStore();
      const result = await store.requestCode("test@example.com");

      expect(result).toBe(false);
    });
  });

  describe("verifyCode", () => {
    it("should set authenticated user when code verification succeeds", async () => {
      vi.mocked(api.post).mockResolvedValue({
        user: {
          id: "123",
          email: "test@example.com",
          timezone: null,
          locale: "en-US",
          localeSource: "inferred",
        },
      });

      const store = useAuthStore();
      const result = await store.verifyCode("test@example.com", "123456");

      expect(result).toBe(true);
      expect(store.user).toEqual({
        id: "123",
        email: "test@example.com",
        timezone: null,
        locale: "en-US",
        localeSource: "inferred",
      });
      expect(store.isAuthenticated).toBe(true);
      expect(store.initialized).toBe(true);
      expect(api.post).toHaveBeenCalledWith("/auth/verify", {
        email: "test@example.com",
        code: "123456",
      });
    });

    it("should return false on invalid code", async () => {
      vi.mocked(api.post).mockRejectedValue(new Error("Invalid code"));

      const store = useAuthStore();
      const result = await store.verifyCode("test@example.com", "123456");

      expect(result).toBe(false);
      expect(store.user).toBeNull();
      expect(store.isAuthenticated).toBe(false);
    });
  });
});
