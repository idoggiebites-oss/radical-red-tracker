import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppState,
  BossesData,
  CalcTarget,
  GameMode,
  Run,
  RunSaveInfo,
} from "./types";
import { loadState, newRun, saveState } from "./lib/storage";
import { checkForUpdate } from "./lib/appUpdate";
import { readSaveFile } from "./lib/saveFile";
import { SAVE_FILE_FEATURE } from "./lib/featureFlags";
import { bossTeamFor, orderChainInfo, type BossTarget } from "./lib/bossTarget";
import { RUN_FILE_EXT, parseRunFile, runFileName, serializeRun } from "./lib/runFile";
import { nextRequiredIndex, ROUTE_CHOICES } from "./lib/routeChoice";
import { nextLevelCap } from "./lib/levelCap";
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

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "routes", label: "Routes", icon: "nav-routes" },
  { id: "bosses", label: "Bosses", icon: "nav-bosses" },
  { id: "team", label: "Team", icon: "nav-team" },
  { id: "reference", label: "Reference", icon: "nav-reference" },
];

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [tab, setTab] = useState<Tab>("routes");
  const [creating, setCreating] = useState(false);
  // mobile only: run controls (switcher/new/export/import/delete) collapse
  // behind a cog button instead of a full row across the header
  const [runMenuOpen, setRunMenuOpen] = useState(false);
  // desktop: once the top tab row scrolls out of view, echo it as a fixed
  // bottom bar (mobile already has one unconditionally, via CSS alone) —
  // tracked off a sentinel placed right before <nav>, not the nav itself,
  // so toggling the nav's own position can't feed back into the observer
  const [showFloatingNav, setShowFloatingNav] = useState(false);
  const tabsSentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tabsSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowFloatingNav(!entry.isIntersecting),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // hide the mobile bottom nav while the on-screen keyboard or a native
  // <select> picker wheel is up — position:fixed detaches from the screen
  // edge while iOS resizes the visual viewport for either, exposing page
  // content behind it. Tried `:has(input:focus, select:focus, ...)` in
  // CSS first, but a <select>'s focus state commonly outlives its picker
  // (mobile Safari doesn't blur it just because the wheel closed), so the
  // bar stayed hidden long after the picker was gone. Measuring the real
  // visual viewport directly sidesteps that: it's only ever short while
  // something is actually covering the screen, regardless of DOM focus.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const tabsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setKeyboardOpen(vv.height < window.innerHeight * 0.85);
      // Hiding alone isn't enough. position:fixed resolves against the
      // *layout* viewport, so with the keyboard up the bar sits at the
      // bottom of a viewport that's partly behind the keyboard — and the
      // 0.85 test above is a heuristic that a short keypad or a mid-
      // animation state can slip past, leaving it stranded on screen.
      // Pin it to where the visual viewport actually ends instead, so a
      // missed hide is merely a visible bar, not a detached one.
      const el = tabsRef.current;
      if (!el) return;
      const below = window.innerHeight - (vv.height + vv.offsetTop);
      // desktop and the no-keyboard case land on 0 and clear the transform
      el.style.transform = below > 0 ? `translateY(${-below}px)` : "";
    };
    // resize fires when the keyboard opens/closes; scroll fires when iOS
    // *pans* the visual viewport to reveal a focused input, which the
    // original listener missed entirely — that pan is the state where the
    // bar most visibly comes away from the screen edge
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  // set when the cap pill is clicked: the boss team to jump to and open
  const [bossFocus, setBossFocus] = useState<(BossTarget & { nonce: number }) | null>(
    null,
  );
  // set when a boss Pokémon's Calc button is clicked: jump to Team →
  // Calculator with that Pokémon prefilled as the Opponent
  const [calcTarget, setCalcTarget] = useState<(CalcTarget & { nonce: number }) | null>(
    null,
  );
  const openCalc = (target: CalcTarget) => {
    setTab("team");
    setCalcTarget({ ...target, nonce: Date.now() });
  };
  // Clearing the Opponent card should forget the explicit boss it was
  // opened with too, so revisiting the Calculator falls back to auto-
  // loading the run's next boss instead of re-applying the old target
  const clearCalcTarget = () => setCalcTarget(null);
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

  const importInput = useRef<HTMLInputElement>(null);

  // installed to the home screen there's no address bar to reload from, so
  // the cog is the only way to pull a new deploy (see lib/appUpdate.ts)
  const [updateState, setUpdateState] = useState<
    "idle" | "checking" | "current" | "updating"
  >("idle");
  const runUpdateCheck = async () => {
    setUpdateState("checking");
    if (await checkForUpdate()) {
      setUpdateState("updating");
      location.reload();
    } else {
      setUpdateState("current");
      setTimeout(() => setUpdateState("idle"), 2500);
    }
  };

  const exportActiveRun = () => {
    if (!run) return;
    const blob = new Blob([serializeRun(run)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = runFileName(run);
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importRun = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseRunFile(await file.text());
    if (!parsed) {
      alert("That file isn't a tracker run backup.");
      return;
    }
    const existing = state.runs.find((r) => r.id === parsed.id);
    if (
      existing &&
      !confirm(
        `"${existing.name}" is already in the tracker — replace it with the backup's version?`,
      )
    ) {
      return;
    }
    setState((s) => ({
      runs: s.runs.some((r) => r.id === parsed.id)
        ? s.runs.map((r) => (r.id === parsed.id ? parsed : r))
        : [...s.runs, parsed],
      activeRunId: parsed.id,
    }));
  };

  const currentCap = useMemo(() => {
    if (!run || !modeData) return null;
    const i = nextRequiredIndex(modeData.trainerOrder, run);
    return i < 0 ? null : { entry: modeData.trainerOrder[i], index: i };
  }, [run, modeData]);
  // the pill's *number* isn't currentCap.entry.levelCap — the docs repeat
  // the same cap on every trainer between one gym leader and the next
  // (Misty and the S.S. Anne/Dig House trainers before Lt. Surge all list
  // "27"), so that field is "the cap you're expected to be under for this
  // fight", not "the cap this fight raises you to". nextLevelCap() tracks
  // the highest cap already unlocked by defeated trainers instead, so it
  // correctly shows 34 right after Misty even though the next required
  // trainer chronologically (currentCap.entry, used below for the "next:
  // NAME" label/click-to-jump/chain display) is still a same-cap fight.
  const capNumber = useMemo(
    () => (modeData && run ? nextLevelCap(modeData, run) : undefined),
    [modeData, run],
  );

  // landed on the post-Sabrina fork with no route picked yet: this isn't a
  // normal "next fight", it's a decision blocking the tracker's progress
  const needsRouteChoice = !!(currentCap && currentCap.entry.routeChoice && !run?.sabrinaRoute);
  const [routePickerOpen, setRoutePickerOpen] = useState(false);
  const routePromptedKey = run ? `rr-tracker.routePrompted.${run.id}` : "";
  useEffect(() => {
    if (needsRouteChoice && routePromptedKey && !localStorage.getItem(routePromptedKey)) {
      setRoutePickerOpen(true);
      localStorage.setItem(routePromptedKey, "1");
    }
  }, [needsRouteChoice, routePromptedKey]);

  // trainers fought back-to-back right after the next one (no healing between)
  const chainNames = useMemo(() => {
    if (!modeData || !currentCap || needsRouteChoice) return [];
    const chains = orderChainInfo(modeData);
    const names: string[] = [];
    for (let i = currentCap.index + 1; chains.get(i)?.withPrev; i++) {
      names.push(modeData.trainerOrder[i].name);
    }
    return names;
  }, [modeData, currentCap, needsRouteChoice]);

  const appClass =
    "app" +
    (showFloatingNav ? " floating-nav-active" : "") +
    (keyboardOpen ? " keyboard-open" : "");
  return (
    <div className={appClass}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-title">Radical Red 4.1</span>
          <span className="brand-sub">Nuzlocke Tracker</span>
        </div>
        {run && currentCap && needsRouteChoice && (
          <button
            className="cap-pill route-pending"
            title="Route 12-18 forks two ways to Fuchsia City — click to choose which one you're taking"
            onClick={() => setRoutePickerOpen(true)}
          >
            Level cap <strong>{capNumber ?? currentCap.entry.levelCap}</strong>
            <span className="cap-next">choose your route →</span>
          </button>
        )}
        {run && currentCap && !needsRouteChoice && (
          <button
            className="cap-pill"
            title={
              `Next: ${currentCap.entry.name} @ ${currentCap.entry.location}` +
              (chainNames.length > 0
                ? ` — back-to-back with ${chainNames.join(", ")}`
                : "") +
              " — click to open their team"
            }
            onClick={() => {
              if (!modeData) return;
              const target = bossTeamFor(modeData, currentCap.index);
              setTab("bosses");
              if (target) setBossFocus({ ...target, nonce: Date.now() });
            }}
          >
            Level cap <strong>{capNumber ?? currentCap.entry.levelCap}</strong>
            <span className="cap-next">
              next: {currentCap.entry.name}
              {chainNames.length > 0 && (
                <span className="cap-chain" title={`Back-to-back: ${chainNames.join(", ")}`}>
                  ⛓+{chainNames.length}
                </span>
              )}
            </span>
          </button>
        )}
        <button
          className="settings-cog"
          title="Run settings"
          aria-label="Run settings"
          onClick={() => setRunMenuOpen((o) => !o)}
        >
          <span
            className="icon-mask"
            style={{
              maskImage: `url(${import.meta.env.BASE_URL}icons/settings-cog.svg)`,
              WebkitMaskImage: `url(${import.meta.env.BASE_URL}icons/settings-cog.svg)`,
            }}
          />
        </button>
        {runMenuOpen && (
          <div className="cog-backdrop" onClick={() => setRunMenuOpen(false)} />
        )}
        <div className={runMenuOpen ? "run-controls open" : "run-controls"}>
          <select
            value={state.activeRunId ?? ""}
            onChange={(e) => {
              setState((s) => ({ ...s, activeRunId: e.target.value || null }));
              setRunMenuOpen(false);
            }}
          >
            <option value="">— no run —</option>
            {state.runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.mode})
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setRunMenuOpen(false);
              setCreating(true);
            }}
          >
            + New run
          </button>
          {run && (
            <button
              title={`Download this run as a ${RUN_FILE_EXT} backup file`}
              onClick={() => {
                setRunMenuOpen(false);
                exportActiveRun();
              }}
            >
              Export
            </button>
          )}
          <button
            title={`Load a run from a ${RUN_FILE_EXT} backup file`}
            onClick={() => {
              setRunMenuOpen(false);
              importInput.current?.click();
            }}
          >
            Import
          </button>
          <input
            ref={importInput}
            type="file"
            accept={`${RUN_FILE_EXT},.json,application/json`}
            hidden
            onChange={(e) => {
              importRun(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {/* stays open while it runs — the result is the whole point */}
          <button
            className="update-check"
            title="Fetch the newest version of the tracker and reload"
            disabled={updateState === "checking" || updateState === "updating"}
            onClick={runUpdateCheck}
          >
            {updateState === "checking"
              ? "Checking…"
              : updateState === "updating"
                ? "Updating…"
                : updateState === "current"
                  ? "Up to date ✓"
                  : "⟳ Check for update"}
          </button>
          {run && (
            <button
              className="danger"
              onClick={() => {
                setRunMenuOpen(false);
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
          onCreate={(name, m, saveInfo, minimalGrind) => {
            const r = newRun(name, m, saveInfo, minimalGrind);
            setState((s) => ({ runs: [...s.runs, r], activeRunId: r.id }));
            setCreating(false);
          }}
        />
      )}

      {routePickerOpen && run && (
        <RouteChoiceDialog
          current={run.sabrinaRoute}
          onCancel={() => setRoutePickerOpen(false)}
          onChoose={(route) => {
            updateRun((r) => ({ ...r, sabrinaRoute: route }));
            setRoutePickerOpen(false);
          }}
        />
      )}

      <div ref={tabsSentinelRef} className="tabs-sentinel" />
      <nav ref={tabsRef} className={showFloatingNav ? "tabs floating" : "tabs"}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            <span
              className="icon-mask tab-icon"
              style={{
                maskImage: `url(${import.meta.env.BASE_URL}icons/${t.icon}.svg)`,
                WebkitMaskImage: `url(${import.meta.env.BASE_URL}icons/${t.icon}.svg)`,
              }}
            />
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
              onCalc={openCalc}
            />
          )}
          {tab === "team" && modeData && (
            <TeamView
              run={run}
              updateRun={updateRun}
              modeData={modeData}
              calcTarget={calcTarget}
              onCalc={openCalc}
              onClearCalcTarget={clearCalcTarget}
            />
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

function RouteChoiceDialog({
  current,
  onChoose,
  onCancel,
}: {
  current?: "east" | "west";
  onChoose: (route: "east" | "west") => void;
  onCancel: () => void;
}) {
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog route-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Which way to Fuchsia City?</h2>
        <p className="muted">
          After Sabrina the road forks — clearing either side gets you to Koga,
          so only one is required. Pick the one you're actually playing;
          the other stays on the Trainer order list as optional.
        </p>
        <div className="route-options">
          {ROUTE_CHOICES.map((r) => (
            <button
              key={r.value}
              className={"route-option" + (current === r.value ? " active" : "")}
              onClick={() => onChoose(r.value)}
            >
              <span className="route-option-label">{r.label}</span>
              <span className="muted">{r.routes}</span>
              <span className="route-option-weather">{r.weather}</span>
            </button>
          ))}
        </div>
        <div className="dialog-actions">
          <button onClick={onCancel}>
            {current ? "Close" : "Decide later"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewRunDialog({
  onCreate,
  onCancel,
}: {
  onCreate: (
    name: string,
    mode: GameMode,
    saveInfo?: RunSaveInfo,
    minimalGrind?: boolean,
  ) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<GameMode>("default");
  const [minimalGrind, setMinimalGrind] = useState(false);
  const [saveInfo, setSaveInfo] = useState<RunSaveInfo | undefined>();
  const [saveError, setSaveError] = useState("");

  const create = () => onCreate(name.trim(), mode, saveInfo, minimalGrind);

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
        <label className="checkbox">
          <input
            type="checkbox"
            checked={minimalGrind}
            onChange={(e) => setMinimalGrind(e.target.checked)}
          />
          Minimal Grind start (no EVs) — hides EV inputs in the calc and builds
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
