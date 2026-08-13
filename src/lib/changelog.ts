/** the "what's new" notes, read straight out of CHANGELOG.md.
 *
 * `?raw` inlines the file at build time, so there is no generator script and
 * no generated file to drift out of sync — and nothing that needs git during
 * the build, which matters because CI checks out shallow (`actions/checkout`
 * with no fetch-depth), so anything reading `git log` there would silently
 * see one commit.
 *
 * The panel is keyed on what the reader has already seen, NOT on the build:
 * every push deploys, and busy days here run to 17 pushes, so a per-deploy
 * popup would be unusable. Batching by last-seen means one panel per visit
 * however many times we shipped in between, and nothing at all when the
 * notes haven't moved.
 */

import raw from "../../CHANGELOG.md?raw";

export interface Note {
  /** counted up from the OLDEST note, so published notes keep their number
   * as long as new entries are only ever added at the top of the file */
  id: number;
  date: string;
  text: string;
}

const HEADING = /^##\s+(.+?)\s*$/;
const BULLET = /^[-*]\s+(.+?)\s*$/;

/** newest first */
export const NOTES: Note[] = (() => {
  const found: { date: string; text: string }[] = [];
  let date = "";
  let current: { date: string; text: string } | null = null;
  for (const line of raw.split("\n")) {
    const heading = HEADING.exec(line);
    if (heading) {
      date = heading[1];
      current = null;
      continue;
    }
    if (!date) continue; // the file's own preamble
    const bullet = BULLET.exec(line);
    if (bullet) {
      current = { date, text: bullet[1] };
      found.push(current);
    } else if (current && line.trim()) {
      // a note wrapped onto the next line
      current.text += " " + line.trim();
    } else {
      current = null;
    }
  }
  return found.map((n, i) => ({ ...n, id: found.length - i }));
})();

export const NEWEST_NOTE = NOTES.length ? NOTES[0].id : 0;

const KEY = "rr-tracker.lastSeenNote";

function lastSeen(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** notes added since this reader last dismissed the panel.
 *
 * A reader we've never recorded gets NOTHING — not the whole history. That
 * covers both a brand-new player and everyone already using the app on the
 * day this ships; `markSeen` then records where they came in, so the next
 * real note is the first thing they see. */
export function unseenNotes(): Note[] {
  const seen = lastSeen();
  if (seen === null) return [];
  return NOTES.filter((n) => n.id > seen);
}

/** true when this reader has no recorded position yet */
export const isFirstRun = () => lastSeen() === null;

export function markSeen(id: number = NEWEST_NOTE): void {
  try {
    localStorage.setItem(KEY, String(id));
  } catch {
    // storage disabled: the panel just reappears next visit
  }
}
