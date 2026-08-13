import { useEffect, useState } from "react";
import {
  isFirstRun,
  markSeen,
  unseenNotes,
  type Note,
} from "../lib/changelog";

/** how many notes to show before summarising the rest. A day's work is
 * usually one to three notes, so most visits show everything anyway; the cap
 * is for the reader who has been away a fortnight, whose phone would
 * otherwise open onto a screen of text with the app below the fold. */
const MAX_SHOWN = 3;

/** the one piece of markdown the notes are allowed — enough to pick a
 * feature name out of a sentence, without pulling in a parser */
function renderNote(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

/** a dismissible strip of what's changed since this reader was last here.
 *
 * Deliberately not a modal: it appears on the run you came to check, and
 * blocking that to announce a colour change would be worse than saying
 * nothing. The unseen set is computed synchronously in the state
 * initialiser, so the strip is part of the first render rather than
 * appearing a beat later and pushing the whole page down — this app has
 * form on exactly that kind of layout shift. */
export function WhatsNew() {
  const [notes, setNotes] = useState<Note[]>(unseenNotes);
  const [showAll, setShowAll] = useState(false);

  // a reader with no recorded position gets nothing this visit; record where
  // they came in so the next real note is the first thing they see
  useEffect(() => {
    if (isFirstRun()) markSeen();
  }, []);

  if (notes.length === 0) return null;

  const dismiss = () => {
    markSeen();
    setNotes([]);
  };
  const shown = showAll ? notes : notes.slice(0, MAX_SHOWN);
  const rest = notes.length - shown.length;

  return (
    <div className="whats-new" role="status">
      <div className="whats-new-head">
        <strong>What's new</strong>
        <button
          className="whats-new-close"
          onClick={dismiss}
          aria-label="Dismiss what's new"
        >
          ×
        </button>
      </div>
      <ul>
        {shown.map((n) => (
          <li key={n.id}>{renderNote(n.text)}</li>
        ))}
      </ul>
      {rest > 0 && (
        <button className="whats-new-rest" onClick={() => setShowAll(true)}>
          …and {rest} more change{rest === 1 ? "" : "s"} since your last visit
        </button>
      )}
    </div>
  );
}
