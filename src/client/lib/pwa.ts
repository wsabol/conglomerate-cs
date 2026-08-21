const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

function checkForUpdate(registration: ServiceWorkerRegistration) {
  void registration.update().catch(() => {
    // A failed background check is expected when the device is offline.
  });
}

async function registerProductionServiceWorker() {
  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    checkForUpdate(registration);

    window.setInterval(
      () => checkForUpdate(registration),
      UPDATE_INTERVAL_MS,
    );

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        checkForUpdate(registration);
      }
    });
  } catch {
    // Registration can fail while offline; the browser will retry next load.
  }
}

if ("serviceWorker" in navigator) {
  if (import.meta.env.DEV) {
    // Let the plugin register its development-only service worker URL.
    void import("virtual:pwa-register").then(({ registerSW }) => {
      registerSW({ immediate: true });
    });
  } else {
    void registerProductionServiceWorker();
  }
}
