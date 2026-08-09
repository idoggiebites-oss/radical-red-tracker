/** The tab row, with press-and-slide selection.
 *
 * Modelled on the iOS 26 tab bar (Instagram's is the reference): press
 * anywhere on the bar and the highlight glides under your finger, snapping
 * from icon to icon, and the tab only commits when you lift. Crucially the
 * *content* does not change while you drag — only the highlight moves — so
 * sliding across four tabs doesn't mount and discard three views on the way
 * past. That also makes it cheap here, where every view is its own lazy
 * chunk: dragging over Reference never fetches Reference.
 *
 * The highlight is one absolutely-positioned element rather than a
 * background on the active button, because a background cannot animate
 * between elements — it can only appear and disappear. Measuring the target
 * button and translating a single pill is what produces the glide. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon: string;
}

export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
  floating,
  navRef,
  iconBase,
}: {
  tabs: readonly TabDef<T>[];
  value: T;
  onChange: (id: T) => void;
  floating?: boolean;
  /** the app measures this row's flow height to reserve space when it goes
   * fixed (see App.tsx) — the ref has to reach the real <nav> */
  navRef?: React.RefObject<HTMLElement | null>;
  iconBase: string;
}) {
  const localRef = useRef<HTMLElement | null>(null);
  const setNav = useCallback(
    (el: HTMLElement | null) => {
      localRef.current = el;
      if (navRef) navRef.current = el;
    },
    [navRef],
  );
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** which tab the finger is currently over; null when not dragging */
  const [preview, setPreview] = useState<T | null>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  const shown = preview ?? value;

  // position the highlight over whichever tab is showing as selected
  useLayoutEffect(() => {
    const nav = localRef.current;
    const i = tabs.findIndex((t) => t.id === shown);
    const btn = btnRefs.current[i];
    if (!nav || !btn) return;
    const measure = () =>
      setPill({ x: btn.offsetLeft, w: btn.offsetWidth });
    measure();
    // the row reflows on rotate, on the desktop/mobile breakpoint, and when
    // it becomes the floating bar — all of which move the buttons
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    ro.observe(btn);
    return () => ro.disconnect();
  }, [shown, tabs, floating]);

  /** the tab under a viewport x, or null when the point is off the row */
  const tabAt = (clientX: number): T | null => {
    for (let i = 0; i < tabs.length; i++) {
      const b = btnRefs.current[i];
      if (!b) continue;
      const r = b.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return tabs[i].id;
    }
    return null;
  };

  const dragging = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    // mouse: only the primary button, and never interfere with a real click
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPreview(tabAt(e.clientX) ?? value);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const hit = tabAt(e.clientX);
    if (hit) setPreview(hit);
  };

  const finish = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // capture may already be gone; nothing to undo
    }
    const landed = tabAt(e.clientX) ?? preview;
    setPreview(null);
    if (landed && landed !== value) onChange(landed);
  };

  // a cancelled gesture (system swipe, call banner) must not switch tabs
  const onPointerCancel = () => {
    dragging.current = false;
    setPreview(null);
  };

  // pointer capture keeps events coming to the nav, but a drag that ends
  // outside it still needs clearing
  useEffect(() => {
    const stop = () => {
      dragging.current = false;
      setPreview(null);
    };
    window.addEventListener("pointercancel", stop);
    return () => window.removeEventListener("pointercancel", stop);
  }, []);

  return (
    <nav
      ref={setNav}
      className={floating ? "tabs floating" : "tabs"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={onPointerCancel}
    >
      {pill && (
        <span
          className="tab-pill"
          aria-hidden
          style={{ transform: `translateX(${pill.x}px)`, width: pill.w }}
        />
      )}
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            btnRefs.current[i] = el;
          }}
          className={shown === t.id ? "tab active" : "tab"}
          aria-current={value === t.id ? "page" : undefined}
          // the phone bar hides the visible label, so the accessible name has
          // to come from somewhere — without this the buttons are announced
          // as unlabelled there
          aria-label={t.label}
          // the pointer sequence above already commits the change; a click
          // would fire again for taps and is only needed for keyboards
          onClick={() => onChange(t.id)}
        >
          <span
            className="icon-mask tab-icon"
            style={{
              maskImage: `url(${iconBase}icons/${t.icon}.svg)`,
              WebkitMaskImage: `url(${iconBase}icons/${t.icon}.svg)`,
            }}
          />
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
