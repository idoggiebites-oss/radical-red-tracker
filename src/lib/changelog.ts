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

/** Where a reader with no stored position starts.
 *
 * Players who predate this panel have no position, and treating them as
 * new would mean the recent work never gets announced to the people who
 * would most want it. But a genuinely new player must NOT be shown "the
 * Reference tab has a Pokédex" as news about an app they are opening for
 * the first time. The two are told apart by whether the app had saved
 * state before this session: read at module load, which is well before
 * App's own save effect can create the key and blur the distinction.
 *
 * This only ever applies once per reader — the position is written
 * immediately — so the set it covers empties out as people visit. */
const BACKFILL_FROM = 3; // the 2026-08-09 tab bar; everything since is new
const HAD_STATE_AT_STARTUP = (() => {
  try {
    return localStorage.getItem("rr-tracker.v1") !== null;
  } catch {
    return false;
  }
})();

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

/** where an unrecorded reader is treated as having got to: an existing
 * player is caught up only to BACKFILL_FROM, a first-time visitor to the
 * newest note, so only the former is told anything */
export const startingPosition = () =>
  HAD_STATE_AT_STARTUP ? BACKFILL_FROM : NEWEST_NOTE;

/** notes added since this reader last dismissed the panel */
export function unseenNotes(): Note[] {
  const seen = lastSeen() ?? startingPosition();
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
