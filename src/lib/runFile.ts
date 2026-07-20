import type { GameMode, Run } from "../types";

/** Run backup files: plain JSON inside, but with our own extension so they
 * read as tracker saves (and the import picker can filter on them). */
export const RUN_FILE_EXT = ".rrnuz";

const FORMAT = "rr-tracker-run";

interface RunFile {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  run: Run;
}

export function runFileName(run: Run): string {
  const slug =
    run.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "run";
  return `${slug}-${new Date().toISOString().slice(0, 10)}${RUN_FILE_EXT}`;
}

export function serializeRun(run: Run): string {
  const file: RunFile = {
    format: FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    run,
  };
  return JSON.stringify(file, null, 2);
}

/** parse an exported file (bare exported Run objects are accepted too);
 * returns null when the content isn't a run backup */
export function parseRunFile(text: string): Run | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const wrapper = data as Partial<RunFile>;
  const run = (wrapper.format === FORMAT ? wrapper.run : data) as Partial<Run>;
  if (
    typeof run !== "object" ||
    run === null ||
    typeof run.id !== "string" ||
    typeof run.name !== "string" ||
    (run.mode !== "default" && run.mode !== "hardcore") ||
    typeof run.encounters !== "object" ||
    run.encounters === null
  ) {
    return null;
  }
  return {
    // anything a future/older version doesn't carry falls back to empty
    defeated: {},
    createdAt: Date.now(),
    ...run,
    mode: run.mode as GameMode,
  } as Run;
}
