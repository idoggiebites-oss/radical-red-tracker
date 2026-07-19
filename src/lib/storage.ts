import type { AppState, GameMode, Run, RunSaveInfo } from "../types";

const KEY = "rr-tracker.v1";

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    // corrupted state: start fresh
  }
  return { runs: [], activeRunId: null };
}

export function saveState(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

/** pseudo location id for the starter Pokémon (not a route encounter) */
export const STARTER_ID = "starter";

export function newRun(name: string, mode: GameMode, saveInfo?: RunSaveInfo): Run {
  return {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    mode,
    createdAt: Date.now(),
    encounters: {},
    defeated: {},
    saveInfo,
    speciesMap: {},
  };
}
