/** Force a service-worker update check.
 *
 * The app registers with vite-plugin-pwa's `autoUpdate`, which means a newly
 * found worker skips waiting and claims clients on its own — but only once
 * something triggers the check, which is why a fresh deploy has needed two
 * reloads to show up (first load finds it, second load runs it). Calling
 * `update()` directly collapses that into one tap.
 *
 * Resolves true when a new worker actually took over (caller should reload),
 * false when we're already on the newest build. Falls back to true with no
 * service worker at all (dev server, unsupported browser): a plain reload is
 * then the only way to pick up new code, so it's the honest answer.
 */
export async function checkForUpdate(timeoutMs = 10000): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return true;

  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg = await navigator.serviceWorker.getRegistration();
  } catch {
    return true;
  }
  if (!reg) return true;
  // pin it so the narrowing survives into the callbacks below
  const registration = reg;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (updated: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", onSwap);
      resolve(updated);
    };
    // the new worker activating and taking over is the real "it updated"
    // signal — installation alone doesn't mean the next load gets it
    const onSwap = () => finish(true);
    navigator.serviceWorker.addEventListener("controllerchange", onSwap);
    // a stuck check shouldn't leave the button spinning forever
    const timer = setTimeout(() => finish(false), timeoutMs);

    registration.update().then(
      () => {
        // update() resolves once the check itself finished. Nothing new
        // installing or waiting means we're current and no controllerchange
        // is ever coming — settle now rather than sitting out the timeout.
        if (registration.waiting) {
          // shouldn't happen under autoUpdate, but a worker parked in
          // `waiting` would otherwise never activate on its own
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
          return;
        }
        if (!registration.installing) finish(false);
      },
      () => finish(false),
    );
  });
}
