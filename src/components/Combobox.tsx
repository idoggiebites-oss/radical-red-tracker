import { type ReactNode, useMemo, useRef, useState } from "react";

const MAX_SUGGESTIONS = 8;
// stop scanning once we have plenty of candidates to rank and slice —
// options lists run 1000+ long, no need to walk all of it every keystroke
const SCAN_CAP = MAX_SUGGESTIONS * 6;

/** free-text input with a live-filtered, click/keyboard-selectable
 * suggestion dropdown — keeps the freedom to type anything (a species the
 * randomizer caught, a doc's abbreviated ability/move spelling) while
 * making it easy to land on a real name and avoid a silent typo. Matching
 * is case-insensitive; prefix matches rank first. Native <input list> +
 * <datalist> looks the same on desktop but iOS Safari barely renders any
 * suggestion UI for it at all — this works identically everywhere. */
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

  const pick = (s: string) => {
    onChange(s);
    setOpen(false);
  };

  return (
    <div className={"combobox" + (className ? ` ${className}` : "")}>
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
      {showList && (
        <ul className="combobox-list">
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
        </ul>
      )}
    </div>
  );
}
