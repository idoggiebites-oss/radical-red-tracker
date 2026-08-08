/** Lazy view loading that survives a deploy landing mid-session.
 *
 * Each tab is its own chunk, imported by content-hashed filename. When a
 * deploy lands, GitHub Pages stops serving the old filenames and the service
 * worker's `cleanupOutdatedCaches()` drops the precache the open tab was
 * running from — so a page that has been sitting open still holds the OLD
 * hashes and asks for a file that no longer exists anywhere. The import
 * rejects, and with nothing catching it React unmounts the entire tree: the
 * tab goes blank and only a manual reload brings it back.
 *
 * Reloading is the correct recovery, not a workaround — the page needs the
 * new index.html to learn the new hashes. What has to be guarded is looping:
 * a chunk that is genuinely missing (a bad deploy) would otherwise reload
 * forever. One reload per session, cleared once the app mounts successfully,
 * so a second deploy in the same session is still recoverable. */
import { Component, lazy, type ComponentType, type ReactNode } from "react";

const RELOADED_AT_KEY = "rr-tracker.chunkReloadAt";
/** long enough that a reload which didn't help falls through to the error
 * instead of bouncing the tab again, short enough that a deploy landing
 * later in the same session still gets its own retry */
const RETRY_AFTER_MS = 60_000;

/** forget the last reload, so the very next failure may retry immediately */
export function clearChunkReloadGuard() {
  try {
    sessionStorage.removeItem(RELOADED_AT_KEY);
  } catch {
    // private mode / storage disabled: the guard just doesn't persist
  }
}

function isMissingChunk(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  // Chrome/Safari/Firefox all word this differently
  return (
    /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      msg,
    )
  );
}

/** `lazy()` that reloads once when the chunk it wants is gone.
 * Props are `any` for the same reason React's own `lazy` types them that
 * way — this wraps components with unrelated prop shapes. */
// oxlint-disable-next-line no-explicit-any
export function lazyView<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    load().catch((err) => {
      if (!isMissingChunk(err)) throw err;
      // Timestamp rather than a flag cleared on mount: clearing on mount
      // would re-arm the reload every time the app came back up, so a chunk
      // that is genuinely gone would bounce the page on every click and the
      // message below would never be reachable.
      let recentlyReloaded = false;
      try {
        const last = Number(sessionStorage.getItem(RELOADED_AT_KEY) ?? 0);
        recentlyReloaded = Date.now() - last < RETRY_AFTER_MS;
        if (!recentlyReloaded) sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
      } catch {
        // no storage: one reload is still better than a blank tab
      }
      if (recentlyReloaded) throw err;
      location.reload();
      // the reload is on its way; never resolving keeps the fallback up
      // instead of flashing an error the user would not have time to read
      return new Promise<{ default: T }>(() => {});
    }),
  );
}

/** Last line of defence. If the reload above has already been spent, show
 * something explaining itself rather than the blank screen that sent the
 * user looking for the reload button in the first place. */
export class ViewErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="view-error">
        <p>This section didn&apos;t load.</p>
        <p className="muted">
          Usually an update landed while the page was open. Reloading picks it
          up — your run is saved and won&apos;t be affected.
        </p>
        <button
          className="primary"
          onClick={() => {
            clearChunkReloadGuard();
            location.reload();
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
