import { useEffect, useMemo, useState } from "react";
import encountersJson from "./data/encounters.json";
import bossesJson from "./data/bosses.json";
import type { AppState, BossesData, EncountersData, GameMode, Run } from "./types";
import { loadState, newRun, saveState } from "./lib/storage";
import { RoutesView } from "./views/RoutesView";
import { BossesView } from "./views/BossesView";
import { TeamView } from "./views/TeamView";
import { ReferenceView } from "./views/ReferenceView";
import "./app.css";

const encounters = encountersJson as unknown as EncountersData;
const bosses = bossesJson as unknown as BossesData;

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

  useEffect(() => saveState(state), [state]);

  const run = state.runs.find((r) => r.id === state.activeRunId) ?? null;

  const updateRun = (updater: (run: Run) => Run) => {
    setState((s) => ({
      ...s,
      runs: s.runs.map((r) => (r.id === s.activeRunId ? updater(r) : r)),
    }));
  };

  const mode: GameMode = run?.mode ?? "default";
  const modeData = bosses[mode];

  const currentCap = useMemo(() => {
    if (!run) return null;
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
          <div className="cap-pill" title={`Next: ${currentCap.entry.name} @ ${currentCap.entry.location}`}>
            Level cap <strong>{currentCap.entry.levelCap}</strong>
            <span className="cap-next">next: {currentCap.entry.name}</span>
          </div>
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
          onCreate={(name, m) => {
            const r = newRun(name, m);
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
        {tab === "routes" && (
          <RoutesView data={encounters} run={run} updateRun={updateRun} />
        )}
        {tab === "bosses" && (
          <BossesView modeData={modeData} mode={mode} run={run} updateRun={updateRun} />
        )}
        {tab === "team" && <TeamView run={run} updateRun={updateRun} />}
        {tab === "reference" && <ReferenceView data={encounters} />}
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
  onCreate: (name: string, mode: GameMode) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<GameMode>("hardcore");
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
              if (e.key === "Enter" && name.trim()) onCreate(name.trim(), mode);
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
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            disabled={!name.trim()}
            onClick={() => onCreate(name.trim(), mode)}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
