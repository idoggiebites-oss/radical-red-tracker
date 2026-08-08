import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
import type { PlacedMon } from "./lib/saveImport";
import { SAVE_FILE_FEATURE } from "./lib/featureFlags";
import { bossTeamFor, orderChainInfo, type BossTarget } from "./lib/bossTarget";
import { RUN_FILE_EXT, parseRunFile, runFileName, serializeRun } from "./lib/runFile";
import { nextRequiredIndex, ROUTE_CHOICES } from "./lib/routeChoice";
import { nextLevelCap } from "./lib/levelCap";
import { ViewErrorBoundary, lazyView } from "./lib/lazyView";
import "./app.css";

// each view is its own chunk so the data/engine it imports (bosses.json,
// items.json, the damage calc) loads only when its tab is opened.
// lazyView, not lazy: a deploy landing while the page is open leaves these
// asking for hashes that no longer exist — see lib/lazyView.tsx
const RoutesView = lazyView(() =>
  import("./views/RoutesView").then((m) => ({ default: m.RoutesView })),
);
const BossesView = lazyView(() =>
  import("./views/BossesView").then((m) => ({ default: m.BossesView })),
);
const TeamView = lazyView(() =>
  import("./views/TeamView").then((m) => ({ default: m.TeamView })),
);
const ReferenceView = lazyView(() =>
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
  // remembered for the session so a chunk-failure reload (see lib/lazyView)
  // returns to the tab that was clicked instead of dumping the user on Routes
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = sessionStorage.getItem("rr-tracker.tab");
      if (TABS.some((t) => t.id === saved)) return saved as Tab;
    } catch {
      // storage disabled: start where we always did
    }
    return "routes";
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("rr-tracker.tab", tab);
    } catch {
      // nothing to do; the tab just won't survive a reload
    }
  }, [tab]);
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
  // the flow space the tab row occupies, so `.tabs-slot` can hold it open
  // while the row is fixed. Margins are part of that space and offsetHeight
  // excludes them, hence the computed-style read.
  const tabsRef = useRef<HTMLElement>(null);
  const [tabsHeight, setTabsHeight] = useState(0);
  useEffect(() => {
    const el = tabsRef.current;
    // only meaningful while it is still in flow; once floating its box is
    // detached and would measure the wrong thing
    if (!el || showFloatingNav) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const h =
        el.getBoundingClientRect().height +
        parseFloat(cs.marginTop) +
        parseFloat(cs.marginBottom);
      setTabsHeight((prev) => (Math.abs(prev - h) > 0.5 ? h : prev));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [showFloatingNav]);
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
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setKeyboardOpen(vv.height < window.innerHeight * 0.85);
    vv.addEventListener("resize", update);
    update();
    return () => vv.removeEventListener("resize", update);
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

  // probed with a real File because canShare({files}) is the only reliable
  // signal — `"share" in navigator` is true on platforms that still refuse
  // file payloads, and the label shouldn't promise a sheet that won't open
  const canShareFiles = useMemo(() => {
    try {
      const probe = new File([""], `probe${RUN_FILE_EXT}`, { type: "application/json" });
      return !!navigator.canShare?.({ files: [probe] });
    } catch {
      return false;
    }
  }, []);

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

  const exportActiveRun = async () => {
    if (!run) return;
    const name = runFileName(run);
    const blob = new Blob([serializeRun(run)], { type: "application/json" });

    // an installed iOS app has no useful download UI — the share sheet is
    // how a file actually reaches Files/iCloud/Messages there, which is the
    // whole point given Safari can evict local storage. Anywhere without
    // file sharing (desktop) still gets a plain download.
    if (canShareFiles) {
      try {
        await navigator.share({
          files: [new File([blob], name, { type: blob.type })],
          title: name,
        });
        return;
      } catch (err) {
        // dismissing the sheet is a cancel, not a failure — don't fall
        // through to a download they didn't ask for
        if ((err as Error)?.name === "AbortError") return;
        // anything else (iOS has been flaky sharing files) falls through
      }
    }

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
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
  // re-read a .sav into the run already in progress (cog menu)
  const [syncing, setSyncing] = useState(false);
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

  const runSwitcher = (
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
  );

  const appClass =
    "app" +
    (showFloatingNav ? " floating-nav-active" : "") +
    (keyboardOpen ? " keyboard-open" : "");
  return (
    <div className={appClass}>
      <header className="topbar">
        {/* an <h1> rather than a <div>: the page had no heading at all, so
            the element search weights most was simply missing. Renders
            identically — .brand neutralises the browser's h1 defaults */}
        <h1 className="brand">
          <span className="brand-title">Radical Red 4.1</span>
          <span className="brand-sub">Nuzlocke Tracker</span>
        </h1>
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
        {/* Rendered twice on purpose, and only ever one is displayed: the
            switcher belongs in the header on desktop (you read it far more
            often than you click it) and inside the popover on a phone, where
            there is no room beside the brand. display:none keeps the hidden
            one out of the accessibility tree, so nothing is announced or
            focusable twice. */}
        <div className="run-switcher-inline">{runSwitcher}</div>
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
          {runSwitcher}
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
              title={
                canShareFiles
                  ? `Send this run as a ${RUN_FILE_EXT} file to Files, Messages, Mail…`
                  : `Download this run as a ${RUN_FILE_EXT} backup file`
              }
              onClick={() => {
                setRunMenuOpen(false);
                exportActiveRun();
              }}
            >
              Export
            </button>
          )}
          {run && SAVE_FILE_FEATURE && (
            <button
              title="Re-read your .sav to pull in new catches, evolutions and build changes"
              onClick={() => {
                setRunMenuOpen(false);
                setSyncing(true);
              }}
            >
              Update from save
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
            /* iOS resolves these to UTIs off the file's last extension, so
               a custom extension would grey out our own backups (see
               RUN_FILE_EXT). Listing json keeps the picker on documents
               rather than offering the photo library. The .rrnuz entries
               are legacy — briefly-used names that still open on desktop;
               iOS ignores the bare one for want of a UTI. parseRunFile
               remains the real guard either way. */
            accept=".json,application/json,.rrnuz.json,.rrnuz"
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
          onCreate={(name, m, saveInfo, minimalGrind, encounters) => {
            const r = newRun(name, m, saveInfo, minimalGrind);
            if (encounters) r.encounters = encounters;
            setState((s) => ({ runs: [...s.runs, r], activeRunId: r.id }));
            setCreating(false);
          }}
        />
      )}

      {syncing && run && (
        <SyncSaveDialog
          run={run}
          onCancel={() => setSyncing(false)}
          onApply={(encounters, saveInfo) => {
            updateRun((r) => ({ ...r, encounters, saveInfo: saveInfo ?? r.saveInfo }));
            setSyncing(false);
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
      {/* Holds the tab row's place once it goes `position: fixed`. Without
          it the row leaves the flow and everything below jumps up ~66px —
          and back down when you scroll up again, so it re-scores every time
          you cross the threshold rather than once. That was the larger half
          of this page's field CLS on desktop, and it was invisible to every
          measurement that didn't scroll.

          Measured rather than hard-coded: the height is the nav's own,
          margins included, taken while it is still in flow. Reserving space
          on `.tabs-sentinel` instead would have been fewer lines and a bug —
          the IntersectionObserver watches that element, so resizing it on
          the very signal it produces feeds straight back into itself. */}
      <div
        className="tabs-slot"
        // as a custom property, not `height`, so the mobile breakpoint can
        // ignore it: below 641px the row is fixed unconditionally and was
        // never in flow, so reserving space there ADDS 81px that never
        // existed — a shift in the opposite direction
        style={
          showFloatingNav && tabsHeight
            ? ({ "--tabs-slot-h": `${tabsHeight}px` } as CSSProperties)
            : undefined
        }
      >
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
      </div>

      <main>
        {!run && (
          <div className="empty-state">
            {/* the tabs sit above this on desktop but in a fixed bottom bar
                on mobile, where "new run" also moves into the ⚙ menu — so
                the two wordings are swapped by the same 640px breakpoint
                that moves them, and can't drift out of sync with the layout */}
            <p>
              <span className="only-wide">
                Create a run to start tracking your Nuzlocke, or browse the docs
                data with the tabs above.
              </span>
              <span className="only-narrow">
                Create a run from the ⚙ menu to start tracking your Nuzlocke, or
                browse the docs data with the tabs below.
              </span>
            </p>
            {/* deliberately outside the 640px swap above: this is the only
                sentence naming what the app does, and search indexes the
                mobile layout, where an only-wide span is display:none and
                so invisible to a crawler as well as to a phone */}
            <p>
              Radical Red Tracker follows your route encounters, boss teams and
              level caps, and includes a damage calculator and battle-readiness
              matchups for every boss Pokémon.
            </p>
            {/* storage eviction wipes everything, so there's no way to detect
                that a run used to be here — this has to read sensibly both
                to a first-time visitor and to someone who just lost a run.
                Import moves into the ⚙ menu on mobile but is a header button
                on desktop, so name it with the same 640px swap as above */}
            <p className="empty-recover">
              Had a run here before? Safari clears a web app's saved data after
              about a week without opening it. Import your most recent{" "}
              <code>{RUN_FILE_EXT}</code> backup{" "}
              <span className="only-wide">from the header</span>
              <span className="only-narrow">from the ⚙ menu</span> to restore
              it.
            </p>
          </div>
        )}
        <ViewErrorBoundary>
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
        </ViewErrorBoundary>
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

/** Re-read a .sav into a run already in progress.
 *
 * Deliberately not "create the run again": the save is authoritative for
 * what the game records (species, so evolutions land, plus nickname,
 * ability, item, nature, moves and who's in the party) and knows nothing
 * about what only the player knows (whether something died, its KO count,
 * the note explaining how). mergeEncounters draws that line; this dialog's
 * job is to show the consequences before anything is written, because a
 * re-import touches a run that already has hours of play in it. */
function SyncSaveDialog({
  run,
  onApply,
  onCancel,
}: {
  run: Run;
  onApply: (encounters: Run["encounters"], saveInfo?: RunSaveInfo) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveInfo, setSaveInfo] = useState<RunSaveInfo | undefined>();
  const [graveyard, setGraveyard] = useState(true);
  const [placed, setPlaced] = useState<PlacedMon[] | null>(null);
  const importer = useRef<typeof import("./lib/saveImport") | null>(null);

  // recomputed rather than stored so the graveyard toggle re-previews live
  const preview = useMemo(() => {
    if (!placed || !importer.current) return null;
    return importer.current.mergeEncounters(run.encounters, placed, { graveyard });
  }, [placed, graveyard, run.encounters]);

  const onFile = async (file: File | undefined) => {
    setError("");
    setPlaced(null);
    setSaveInfo(undefined);
    if (!file) return;
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();

      // loading the reader and reading with it fail for completely different
      // reasons, and one catch around both reported a parse crash as "check
      // your connection" — which sent me looking at the save file when the
      // real fault was a module that never loaded
      let mods;
      try {
        mods = await Promise.all([
          import("./lib/saveImport"),
          import("./lib/saveFile"),
          import("./data/encounters.json"),
        ]);
      } catch (err) {
        console.error("save reader failed to load", err);
        setError(
          "Couldn't load the save-file reader. Check your connection and try again.",
        );
        return;
      }
      const [saveImport, { readSaveFile }, encountersData] = mods;
      importer.current = saveImport;

      const info = readSaveFile(buffer);
      if (!info) {
        setError(
          "Couldn't read that file. Make sure it's the emulator's battery save (.sav), not a save state.",
        );
        return;
      }
      setSaveInfo(info);

      try {
        const mons = [
          ...saveImport.readParty(buffer),
          ...saveImport.readBoxes(buffer),
          ...saveImport.readExtraStorage(buffer),
        ];
        setPlaced(
          saveImport.placeOnRoutes(mons, encountersData.default.locations),
        );
      } catch (err) {
        // the header read fine, so the file is a real save — say what
        // actually broke rather than guessing at the cause
        console.error("save parse failed", err);
        setError(
          `Read the trainer data, but not the Pokémon: ${
            (err as Error)?.message ?? "unknown error"
          }`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const counts = {
    added: preview?.changes.filter((c) => c.kind === "added").length ?? 0,
    updated: preview?.changes.filter((c) => c.kind === "updated").length ?? 0,
    unchanged: preview?.changes.filter((c) => c.kind === "unchanged").length ?? 0,
    absent: preview?.changes.filter((c) => c.kind === "absent").length ?? 0,
  };
  // "nothing to do" is a real outcome worth stating rather than an empty list
  const willChange = counts.added + counts.updated > 0;
  const shown = preview?.changes.filter((c) => c.kind !== "unchanged") ?? [];

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Update from save</h2>
        <p className="muted">
          Re-read your <code>.sav</code> to pull in new catches, evolutions and
          build changes. Your status marks, KO counts and graveyard notes are
          kept — the save doesn&apos;t record those, so nothing here can
          overwrite them.
        </p>
        <label>
          Save file
          {/* octet-stream first for the same iOS UTI reason as the new-run
              dialog — see the note there before changing this list */}
          <input
            type="file"
            accept="application/octet-stream,.sav,.sa2,.fla"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        {busy && <p className="muted">Reading…</p>}
        {error && <p className="save-error">{error}</p>}
        {saveInfo && (
          <div className="save-summary">
            <div>
              Trainer <strong>{saveInfo.trainerName || "?"}</strong>
              {run.saveInfo?.trainerName &&
                run.saveInfo.trainerName !== saveInfo.trainerName && (
                  <span className="save-warn">
                    {" "}
                    — this run was started from <strong>
                      {run.saveInfo.trainerName}
                    </strong>
                    &apos;s save
                  </span>
                )}
            </div>
          </div>
        )}
        {preview && (
          <div className="save-import">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={graveyard}
                onChange={(e) => setGraveyard(e.target.checked)}
              />
              Treat your overflow box as the graveyard (new entries only)
            </label>
            <p className="muted">
              {counts.added} new · {counts.updated} updated · {counts.unchanged}{" "}
              already current · {counts.absent} not in the save
            </p>
            {shown.length === 0 ? (
              <p className="muted">
                Nothing to change — this run already matches the save.
              </p>
            ) : (
              <ul className="save-import-list">
                {shown.map((c) => (
                  <li key={c.locationId} className={`sync-${c.kind}`}>
                    <span className="si-mon">
                      {c.nickname || c.species}
                      {c.nickname && <span className="muted"> · {c.species}</span>}
                    </span>
                    <span className="si-where">{c.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="dialog-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="primary"
            disabled={!preview || !willChange}
            onClick={() => preview && onApply(preview.encounters, saveInfo)}
          >
            {willChange
              ? `Apply ${counts.added + counts.updated} change${
                  counts.added + counts.updated === 1 ? "" : "s"
                }`
              : "Apply"}
          </button>
        </div>
      </div>
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
    encounters?: Run["encounters"],
  ) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<GameMode>("default");
  const [minimalGrind, setMinimalGrind] = useState(false);
  const [saveInfo, setSaveInfo] = useState<RunSaveInfo | undefined>();
  const [saveError, setSaveError] = useState("");
  const [placed, setPlaced] = useState<PlacedMon[] | null>(null);
  const [importMons, setImportMons] = useState(true);
  const [graveyard, setGraveyard] = useState(true);

  // the .sav reader pulls in the damage-calc engine and four data files, so
  // it stays out of the eager bundle and loads when a file is actually picked
  const importer = useRef<typeof import("./lib/saveImport") | null>(null);

  const willPlace = (placed ?? []).filter((p) => p.locationId);
  const create = () =>
    onCreate(
      name.trim(),
      mode,
      saveInfo,
      minimalGrind,
      importMons && placed && importer.current
        ? importer.current.encountersFrom(placed, { graveyard })
        : undefined,
    );

  const onSaveFile = async (file: File | undefined) => {
    setSaveError("");
    setSaveInfo(undefined);
    setPlaced(null);
    if (!file) return;
    const buffer = await file.arrayBuffer();
    let mods;
    try {
      mods = await Promise.all([
        import("./lib/saveImport"),
        import("./lib/saveFile"),
        import("./data/encounters.json"),
      ]);
    } catch {
      // first visit on a bad connection: the reader isn't cached yet
      setSaveError(
        "Couldn't load the save-file reader. Check your connection and try again.",
      );
      return;
    }
    const [saveImport, { readSaveFile }, encountersData] = mods;
    importer.current = saveImport;
    const info = readSaveFile(buffer);
    if (!info) {
      setSaveError(
        "Couldn't read that file. Make sure it's the emulator's battery save (.sav), not a save state.",
      );
      return;
    }
    setSaveInfo(info);
    // the save knows which mode the run is actually in
    setMode(info.hardmode || info.restricted ? "hardcore" : "default");
    // and which Pokemon were caught where, so the run can start already filled in
    try {
      const mons = [
        ...saveImport.readParty(buffer),
        ...saveImport.readBoxes(buffer),
        ...saveImport.readExtraStorage(buffer),
      ];
      setPlaced(saveImport.placeOnRoutes(mons, encountersData.default.locations));
    } catch {
      // a save we can read the header of but not the Pokemon: keep the run
      // creation working and just don't offer the import
      setPlaced(null);
    }
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
            {/* application/octet-stream first, on purpose. iOS resolves an
                accept list to UTIs off the file's extension, and .sav/.sa2/.fla
                map to nothing Apple knows — listing only those greys out every
                real save, the same way an invented .rrnuz once did to backups.
                octet-stream resolves to public.data, so iOS shows files rather
                than nothing, while desktop still gets the extension hints. */}
            <input
              type="file"
              accept="application/octet-stream,.sav,.sa2,.fla"
              onChange={(e) => onSaveFile(e.target.files?.[0])}
            />
          </label>
        )}
        {SAVE_FILE_FEATURE && !saveInfo && (
          <p className="save-hint">
            Your emulator&apos;s battery save — the <code>.sav</code> next to
            the ROM, not a save state. It fills in your party, boxes and where
            each Pokémon was caught, and you get to review all of it before
            anything is created. The file is read here on your device and never
            uploaded.
          </p>
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
        {placed && placed.length > 0 && (
          <div className="save-import">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={importMons}
                onChange={(e) => setImportMons(e.target.checked)}
              />
              Import {placed.length} Pokémon from the save
            </label>
            {importMons && placed.some((p) => p.mon.extraStorage) && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={graveyard}
                  onChange={(e) => setGraveyard(e.target.checked)}
                />
                Treat the{" "}
                {placed.filter((p) => p.mon.extraStorage).length} in your
                overflow box as the graveyard (mark them fainted)
              </label>
            )}
            {importMons && (
              <>
                <p className="muted">
                  {willPlace.length} will be placed on the route they were
                  caught on. Anything below that couldn&apos;t be matched is
                  left for you to record yourself — it is never guessed.
                </p>
                <ul className="save-import-list">
                  {placed.map((p, i) => (
                    <li key={i} className={p.locationId ? undefined : "unplaced"}>
                      <span className="si-mon">
                        {p.mon.nickname || p.mon.species}
                        {p.mon.nickname && (
                          <span className="muted"> · {p.mon.species}</span>
                        )}
                      </span>
                      <span className="si-where">
                        {p.mon.extraStorage && graveyard && p.locationId
                          ? `✝ ${p.mon.metLocationName}`
                          : p.locationId
                            ? p.mon.metLocationName
                            : p.unplacedReason}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
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
