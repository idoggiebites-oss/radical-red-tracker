import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MAX_SUGGESTIONS = 8;
// stop scanning once we have plenty of candidates to rank and slice —
// options lists run 1000+ long, no need to walk all of it every keystroke
const SCAN_CAP = MAX_SUGGESTIONS * 6;
// matches .combobox-list's max-height in app.css — used as the "how tall
// might this get" guess before the first real measurement lands
const LIST_MAX_HEIGHT = 260;

/** free-text input with a live-filtered, click/keyboard-selectable
 * suggestion dropdown — keeps the freedom to type anything (a species the
 * randomizer caught, a doc's abbreviated ability/move spelling) while
 * making it easy to land on a real name and avoid a silent typo. Matching
 * is case-insensitive; prefix matches rank first. Native <input list> +
 * <datalist> looks the same on desktop but iOS Safari barely renders any
 * suggestion UI for it at all — this works identically everywhere.
 *
 * The suggestion list is portaled to document.body and positioned in
 * *document* coordinates (getBoundingClientRect() + scrollX/Y), not
 * viewport-relative position:fixed — two reasons. First, several callers
 * (a randomized route's catch form, an accordion row) sit inside an
 * `overflow: hidden` card that exists to clip rounded corners, which was
 * clipping the dropdown too; portaling to body escapes that regardless of
 * positioning scheme. Second, and why *this* scheme specifically: iOS
 * resizes the *visual* viewport for the on-screen keyboard while
 * position:fixed is computed against the *layout* viewport (the exact
 * mechanism that made the mobile nav bar detach from the screen edge —
 * see app.css's keyboard-open handling) — a fixed-position dropdown
 * inherits that same desync and can render far from its input while
 * typing. Document-relative absolute positioning never depends on the
 * viewport at all, so it can't desync from one. */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  invalid,
  className,
  autoFocus,
  onBlur,
  onEscape,
  renderOption,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  /** shows a red hint on the input — the caller decides what "invalid"
   * means for its context (e.g. only once there's actually a value) */
  invalid?: boolean;
  className?: string;
  autoFocus?: boolean;
  /** fires alongside the dropdown's own close-on-blur, for callers that
   * use leaving the field as their own "done editing" signal */
  onBlur?: () => void;
  /** Escape always closes the suggestion list; callers with their own
   * "cancel editing" behavior (distinct from just dismissing the list)
   * can hook it here */
  onEscape?: () => void;
  /** custom suggestion row content (e.g. a sprite next to the name);
   * defaults to the plain option text */
  renderOption?: (option: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const blurTimer = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const query = value.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!query) return [];
    const starts: string[] = [];
    const contains: string[] = [];
    for (const opt of options) {
      const lower = opt.toLowerCase();
      if (lower === query) continue;
      if (lower.startsWith(query)) starts.push(opt);
      else if (lower.includes(query)) contains.push(opt);
      if (starts.length >= MAX_SUGGESTIONS && starts.length + contains.length >= SCAN_CAP) break;
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [query, options]);

  const showList = open && suggestions.length > 0;

  // recomputed whenever the list opens, its content changes (the actual
  // rendered height can change as suggestions narrow down), or the page
  // scrolls/resizes while it's open. Runs after the DOM commit but before
  // paint, so listRef's real height (from *this* render's suggestions) is
  // already measurable — no separate invisible measuring pass needed.
  useLayoutEffect(() => {
    if (!showList || !wrapRef.current) return;
    const update = () => {
      const r = wrapRef.current!.getBoundingClientRect();
      const vv = window.visualViewport;
      // what's actually visible right now — window.innerHeight doesn't
      // shrink for the keyboard on iOS, visualViewport does
      const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const listHeight = listRef.current?.offsetHeight ?? LIST_MAX_HEIGHT;
      const spaceBelow = viewportBottom - r.bottom;
      const openUpward = spaceBelow < listHeight && r.top > spaceBelow;
      const top = openUpward
        ? r.top + window.scrollY - listHeight - 3
        : r.bottom + window.scrollY + 3;
      setRect({ top, left: r.left + window.scrollX, width: r.width });
    };
    update();
    // a nested scrollable ancestor (not just the page itself) moving the
    // input needs an explicit reposition; plain page scroll already keeps
    // document-relative coordinates correct with no listener at all
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [showList, suggestions]);

  const pick = (s: string) => {
    onChange(s);
    setOpen(false);
  };

  return (
    <div className={"combobox" + (className ? ` ${className}` : "")} ref={wrapRef}>
      <input
        className={invalid ? "invalid" : undefined}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // give a suggestion's onMouseDown a chance to fire before the
          // list disappears out from under the click
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            onEscape?.();
            return;
          }
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            if (suggestions[highlight]) {
              e.preventDefault();
              pick(suggestions[highlight]);
            }
          }
        }}
      />
      {showList &&
        createPortal(
          <ul
            ref={listRef}
            className="combobox-list combobox-list-portal"
            // invisible until the first real measurement lands (rect
            // starts null on first open) so it never flashes at (0,0)
            style={
              rect
                ? { top: rect.top, left: rect.left, width: rect.width }
                : { top: 0, left: -9999, width: wrapRef.current?.offsetWidth }
            }
          >
            {suggestions.map((s, i) => (
              <li
                key={s}
                className={i === highlight ? "active" : undefined}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  // preventDefault keeps focus on the input so the blur
                  // timeout above never fires and closes the list first
                  e.preventDefault();
                  if (blurTimer.current) window.clearTimeout(blurTimer.current);
                  pick(s);
                }}
              >
                {renderOption ? renderOption(s) : s}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
