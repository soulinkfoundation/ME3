const legacyCachePrefix = "me3-app-shell-";

async function removeLegacyServiceWorker() {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
  }

  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith(legacyCachePrefix))
        .map((cacheName) => caches.delete(cacheName)),
    );
  }
}

export function cleanupLegacyServiceWorker() {
  const cleanup = () => {
    void removeLegacyServiceWorker().catch((error) => {
      console.error("Service worker cleanup failed:", error);
    });
  };

  if (document.readyState === "complete") {
    cleanup();
    return;
  }

  window.addEventListener("load", cleanup, { once: true });
}
