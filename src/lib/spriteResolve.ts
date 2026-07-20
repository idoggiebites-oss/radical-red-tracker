/** Remembers which URL in a sprite fallback chain actually loaded, so later
 * mounts — and later sessions — start there instead of re-firing the 404s in
 * front of it. Only successes are recorded: an offline error must not poison
 * the chain for the next, online visit. */

const KEY = "rr-tracker.spriteSrc";

let cache: Record<string, number> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function load(): Record<string, number> {
  if (!cache) {
    try {
      cache = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    } catch {
      cache = {};
    }
  }
  return cache!;
}

/** index to try first for this sprite; 0 unless a later URL is known to work */
export function knownSpriteIdx(key: string, urlCount: number): number {
  const idx = load()[key] ?? 0;
  return idx < urlCount ? idx : 0;
}

export function rememberSpriteIdx(key: string, idx: number): void {
  const c = load();
  // index 0 is the default start — only worth storing over a previous value
  if (c[key] === idx || (idx === 0 && c[key] === undefined)) return;
  c[key] = idx;
  // a screen full of sprites resolves in a burst; write once after it settles
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(c));
    } catch {
      // storage full — the in-memory cache still helps this session
    }
  }, 500);
}
