import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import type {
  AppState,
  BossesData,
  GameMode,
  Run,
  RunSaveInfo,
} from "./types";
import { loadState, newRun, saveState } from "./lib/storage";
import { readSaveFile } from "./lib/saveFile";
import { SAVE_FILE_FEATURE } from "./lib/featureFlags";
import { bossTeamFor, type BossTarget } from "./lib/bossTarget";
import "./app.css";

// each view is its own chunk so the data/engine it imports (bosses.json,
// items.json, the damage calc) loads only when its tab is opened
const RoutesView = lazy(() =>
  import("./views/RoutesView").then((m) => ({ default: m.RoutesView })),
);
const BossesView = lazy(() =>
  import("./views/BossesView").then((m) => ({ default: m.BossesView })),
);
const TeamView = lazy(() =>
  import("./views/TeamView").then((m) => ({ default: m.TeamView })),
);
const ReferenceView = lazy(() =>
  import("./views/ReferenceView").then((m) => ({ default: m.ReferenceView })),
);

type Tab = "routes" | "bosses" | "team" | "reference";

const TABS: { id: Tab; label: string }[] = [
  { id: "routes", label: "Routes" },
  { id: "bosses", label: "Bosses" },
  { id: "team", label: "Team" },
  { id: "reference", label: "Reference" },
];

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [tab, setTab] = useState<Tab>("routes");
  const [creating, setCreating] = useState(false);
  // set when the cap pill is clicked: the boss team to jump to and open
  const [bossFocus, setBossFocus] = useState<(BossTarget & { nonce: number }) | null>(
    null,
  );
  // bosses.json is the largest data file; fetched as its own chunk so the
  // main bundle stays small (only the cap pill and two tabs need it)
  const [bosses, setBosses] = useState<BossesData | null>(null);
  useEffect(() => {
    import("./data/bosses.json").then((m) =>
      setBosses(m.default as unknown as BossesData),
    );
  }, []);

  useEffect(() => saveState(state), [state]);

  const run = state.runs.find((r) => r.id === state.activeRunId) ?? null;

  const updateRun = (updater: (run: Run) => Run) => {
    setState((s) => ({
      ...s,
      runs: s.runs.map((r) => (r.id === s.activeRunId ? updater(r) : r)),
    }));
  };

  const mode: GameMode = run?.mode ?? "default";
  const modeData = bosses?.[mode] ?? null;

  const currentCap = useMemo(() => {
    if (!run || !modeData) return null;
    const order = modeData.trainerOrder;
    for (let i = 0; i < order.length; i++) {
      if (!run.defeated[i] && !order[i].optional) {
        return { entry: order[i], index: i };
      }
    }
    return null;
  }, [run, modeData]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-title">Radical Red 4.1</span>
          <span className="brand-sub">Nuzlocke Tracker</span>
        </div>
        {run && currentCap && (
          <button
            className="cap-pill"
            title={`Next: ${currentCap.entry.name} @ ${currentCap.entry.location} — click to open their team`}
            onClick={() => {
              if (!modeData) return;
              const target = bossTeamFor(modeData, currentCap.index);
              setTab("bosses");
              if (target) setBossFocus({ ...target, nonce: Date.now() });
            }}
          >
            Level cap <strong>{currentCap.entry.levelCap}</strong>
            <span className="cap-next">next: {currentCap.entry.name}</span>
          </button>
        )}
        <div className="run-controls">
          <select
            value={state.activeRunId ?? ""}
            onChange={(e) =>
              setState((s) => ({ ...s, activeRunId: e.target.value || null }))
            }
          >
            <option value="">— no run —</option>
            {state.runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.mode})
              </option>
            ))}
          </select>
          <button onClick={() => setCreating(true)}>+ New run</button>
          {run && (
            <button
              className="danger"
              onClick={() => {
                if (confirm(`Delete run "${run.name}"? This cannot be undone.`)) {
                  setState((s) => ({
                    runs: s.runs.filter((r) => r.id !== run.id),
                    activeRunId: null,
                  }));
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      </header>

      {creating && (
        <NewRunDialog
          onCancel={() => setCreating(false)}
          onCreate={(name, m, saveInfo) => {
            const r = newRun(name, m, saveInfo);
            setState((s) => ({ runs: [...s.runs, r], activeRunId: r.id }));
            setCreating(false);
          }}
        />
      )}

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {!run && (
          <div className="empty-state">
            <p>
              Create a run to start tracking your Nuzlocke, or browse the docs data
              with the tabs above.
            </p>
          </div>
        )}
        <Suspense fallback={<p className="muted">Loading…</p>}>
          {tab === "routes" && <RoutesView run={run} updateRun={updateRun} />}
          {tab === "bosses" && modeData && (
            <BossesView
              modeData={modeData}
              mode={mode}
              run={run}
              updateRun={updateRun}
              focus={bossFocus}
            />
          )}
          {tab === "team" && modeData && (
            <TeamView run={run} updateRun={updateRun} modeData={modeData} />
          )}
          {tab === "reference" && <ReferenceView />}
        </Suspense>
      </main>

      <footer className="footer">
        Data from the official Radical Red 4.1 docs (Pokémon Locations &amp; Raid
        Dens, Default/Hardcore Mode Bosses). Run{" "}
        <code>python3 scripts/import_data.py --refresh</code> to re-import after doc
        updates.
      </footer>
    </div>
  );
}

function NewRunDialog({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string, mode: GameMode, saveInfo?: RunSaveInfo) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<GameMode>("hardcore");
  const [saveInfo, setSaveInfo] = useState<RunSaveInfo | undefined>();
  const [saveError, setSaveError] = useState("");

  const create = () => onCreate(name.trim(), mode, saveInfo);

  const onSaveFile = async (file: File | undefined) => {
    setSaveError("");
    setSaveInfo(undefined);
    if (!file) return;
    const info = readSaveFile(await file.arrayBuffer());
    if (!info) {
      setSaveError(
        "Couldn't read that file. Make sure it's the emulator's battery save (.sav), not a save state.",
      );
      return;
    }
    setSaveInfo(info);
    // the save knows which mode the run is actually in
    setMode(info.hardmode || info.restricted ? "hardcore" : "default");
  };

  const randomFlags = saveInfo
    ? [
        saveInfo.random.normalSpecies && "Species",
        saveInfo.random.scaledSpecies && "Scaled species",
        saveInfo.random.learnset && "Learnset",
        saveInfo.random.abilities && "Abilities",
      ].filter(Boolean)
    : [];

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>New run</h2>
        <label>
          Run name
          <input
            autoFocus
            value={name}
            placeholder="e.g. Attempt #3"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) create();
            }}
          />
        </label>
        <label>
          Game mode
          <select value={mode} onChange={(e) => setMode(e.target.value as GameMode)}>
            <option value="default">Default</option>
            <option value="hardcore">Hardcore / Restricted</option>
          </select>
        </label>
        {SAVE_FILE_FEATURE && (
          <label>
            Save file (optional)
            <input
              type="file"
              accept=".sav,.sa2,.fla"
              onChange={(e) => onSaveFile(e.target.files?.[0])}
            />
          </label>
        )}
        {saveError && <p className="save-error">{saveError}</p>}
        {saveInfo && (
          <div className="save-summary">
            <div>
              Trainer <strong>{saveInfo.trainerName || "?"}</strong>
              {" · "}
              {saveInfo.hardmode
                ? "Hardcore"
                : saveInfo.restricted
                  ? "Restricted"
                  : "Default"}{" "}
              mode
            </div>
            <div>
              Randomizers:{" "}
              {randomFlags.length > 0 ? randomFlags.join(", ") : "none"}
            </div>
            {(saveInfo.random.normalSpecies || saveInfo.random.scaledSpecies) && (
              <div className="muted">
                Species randomizer detected — type whatever you actually catch
                in a route's species box, and optionally note what shows up in
                each slot.
              </div>
            )}
          </div>
        )}
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={!name.trim()} onClick={create}>
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
