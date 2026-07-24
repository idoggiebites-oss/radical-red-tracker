import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MAX_SUGGESTIONS = 8;
// stop scanning once we have plenty of candidates to rank and slice —
// options lists run 1000+ long, no need to walk all of it every keystroke
const SCAN_CAP = MAX_SUGGESTIONS * 6;
// matches .combobox-list's max-height in app.css — used to decide whether
// there's enough room below the input to open downward as usual
const LIST_MAX_HEIGHT = 260;

type ListRect =
  | { left: number; width: number; top: number; bottom?: undefined }
  | { left: number; width: number; bottom: number; top?: undefined };

/** free-text input with a live-filtered, click/keyboard-selectable
 * suggestion dropdown — keeps the freedom to type anything (a species the
 * randomizer caught, a doc's abbreviated ability/move spelling) while
 * making it easy to land on a real name and avoid a silent typo. Matching
 * is case-insensitive; prefix matches rank first. Native <input list> +
 * <datalist> looks the same on desktop but iOS Safari barely renders any
 * suggestion UI for it at all — this works identically everywhere.
 *
 * The suggestion list is portaled to document.body and positioned off the
 * input's live screen coordinates (not CSS position:absolute inside the
 * input's own wrapper) — several callers (a randomized route's catch
 * form, an accordion row) sit inside an `overflow: hidden` card that
 * exists to clip rounded corners, which was silently clipping the
 * dropdown too. Fixed positioning relative to the viewport sidesteps any
 * ancestor's overflow/clipping entirely, current and future. */
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
  const [rect, setRect] = useState<ListRect | null>(null);

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

  useLayoutEffect(() => {
    if (!showList || !wrapRef.current) return;
    const update = () => {
      const r = wrapRef.current!.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      // open upward when there's not enough room below for the list at
      // (up to) its max height, but there IS more room above — otherwise
      // a row near the bottom of the viewport pushes the list off-screen
      // instead of just off the row (the portal fix escapes the row's own
      // clipping, but does nothing about the viewport's own edge)
      const openUpward = spaceBelow < LIST_MAX_HEIGHT && r.top > spaceBelow;
      setRect(
        openUpward
          ? { bottom: window.innerHeight - r.top + 3, left: r.left, width: r.width }
          : { top: r.bottom + 3, left: r.left, width: r.width },
      );
    };
    update();
    // the input's on-screen position moves if an ancestor scrolls or the
    // window resizes while the list is open — keep it glued in place
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [showList]);

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
        rect &&
        createPortal(
          <ul
            className="combobox-list combobox-list-portal"
            style={{
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              width: rect.width,
            }}
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
