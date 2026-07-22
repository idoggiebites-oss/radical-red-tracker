import { useEffect, useMemo, useState } from "react";
import type { Boss, BossMode, BossMon, CalcTarget, CaughtMon, MonBuild, Run } from "../types";
import { Sprite } from "../components/Sprite";
import { ItemSprite } from "../components/ItemSprite";
import { MonCard, SpeciesDefenses } from "../components/MonCard";
import { CalculatorPage } from "../components/CalculatorPage";
import { TypeBadges, abilitiesFor, typesFor } from "../components/TypeBadges";
import { isNoItem } from "../lib/itemSprites";
import { abilitiesRandomized } from "../lib/saveFile";
import { nextLevelCap } from "../lib/levelCap";
import { bossMatchesStarter, rivalStarterFor } from "../lib/starters";
import { bossTeamFor } from "../lib/bossTarget";
import { nextRequiredIndex } from "../lib/routeChoice";
import {
  ALL_TYPES,
  STAT_KEYS,
  evolutionsFor,
  preEvolutionsFor,
  statsFor,
  typeColor,
  type StatKey,
} from "../lib/effectiveness";
import {
  ABILITY_NAMES,
  ITEM_NAMES,
  MOVE_NAMES,
  NATURES,
  NATURE_EFFECTS,
  autoField,
  autoFieldNote,
  buildBossPokemon,
  buildPlayerPokemon,
  calcMoveRange,
  defaultBossLevel,
  fieldFromBattleEffect,
  formsFor,
  statTotals,
  STATUSES,
  type MoveRange,
  type PlayerMonConfig,
} from "../lib/damagecalc";
import { ModifierToggle } from "../components/ModifierToggle";

const WEATHERS = ["Sun", "Rain", "Sand", "Hail", "Snow"];

const EMPTY_BUILD: MonBuild = {
  nature: "Serious",
  ability: "",
  item: "",
  moves: ["", "", "", ""],
};

type Entry = [string, Run["encounters"][string]];

/** base stat total, 0 when the species is unknown to the dex data */
const bstFor = (species: string) =>
  Object.values(statsFor(species)).reduce((sum, v) => sum + (v ?? 0), 0);

const collapsedKey = (runId: string) => `rr-tracker.teamCollapsed.${runId}`;

function loadCollapsed(runId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(collapsedKey(runId)) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function TeamView({
  run,
  updateRun,
  modeData,
  calcTarget,
  onCalc,
}: {
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
  modeData: BossMode;
  /** set when a boss Pokémon's Calc button is clicked elsewhere: jump to
   * the Calculator subtab and prefill the Opponent with it */
  calcTarget?: (CalcTarget & { nonce: number }) | null;
  onCalc?: (mon: BossMon, battleEffect: string, levelCap?: number) => void;
}) {
  const [subtab, setSubtab] = useState<"roster" | "readiness" | "calculator">(
    "roster",
  );
  useEffect(() => {
    if (!calcTarget) return;
    setSubtab("calculator");
  }, [calcTarget]);
  const [sortStat, setSortStat] = useState<StatKey | "KOS" | "BST" | "">("");
  const [filterType, setFilterType] = useState("");
  const [buildOpen, setBuildOpen] = useState<string | null>(null);
  const [evolveOpen, setEvolveOpen] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState<string | null>(null);
  // which sections (Party/Box/Graveyard) are collapsed to a scan-friendly
  // table, per run — a long playthrough's box/graveyard can get tall
  const runId = run?.id;
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    runId ? loadCollapsed(runId) : new Set(),
  );
  useEffect(() => {
    setCollapsed(runId ? loadCollapsed(runId) : new Set());
  }, [runId]);
  const toggleCollapsed = (title: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      if (run) localStorage.setItem(collapsedKey(run.id), JSON.stringify([...next]));
      return next;
    });
  };

  if (!run) return <p className="muted">Create or select a run to see your team.</p>;

  const refine = (items: Entry[]): Entry[] => {
    let out = items;
    if (filterType) {
      out = out.filter(([, e]) => typesFor(e.species).includes(filterType));
    }
    if (sortStat === "KOS") {
      out = [...out].sort(([, a], [, b]) => (b.kos ?? 0) - (a.kos ?? 0));
    } else if (sortStat === "BST") {
      out = [...out].sort(
        ([, a], [, b]) => bstFor(b.species) - bstFor(a.species),
      );
    } else if (sortStat) {
      out = [...out].sort(
        ([, a], [, b]) =>
          (statsFor(b.species)[sortStat] ?? -1) -
          (statsFor(a.species)[sortStat] ?? -1),
      );
    }
    return out;
  };

  const entries = Object.entries(run.encounters).filter(([, e]) => e.species);
  const caughtMons: CaughtMon[] = entries
    .filter(([, e]) => e.status === "caught")
    .map(([, e]) => ({ species: e.species, nickname: e.nickname, build: e.build }));
  const partyAll = entries.filter(([, e]) => e.status === "caught" && e.inParty);
  const party = refine(partyAll);
  const box = refine(entries.filter(([, e]) => e.status === "caught" && !e.inParty));
  const graveyard = refine(entries.filter(([, e]) => e.status === "fainted"));

  const setInParty = (locId: string, inParty: boolean) => {
    updateRun((r) => ({
      ...r,
      encounters: {
        ...r.encounters,
        [locId]: { ...r.encounters[locId], inParty },
      },
    }));
  };

  const setBuild = (locId: string, build: MonBuild | undefined) => {
    updateRun((r) => ({
      ...r,
      encounters: {
        ...r.encounters,
        [locId]: { ...r.encounters[locId], build },
      },
    }));
  };

  const setSpecies = (locId: string, species: string) => {
    updateRun((r) => ({
      ...r,
      encounters: {
        ...r.encounters,
        [locId]: { ...r.encounters[locId], species },
      },
    }));
    setEvolveOpen(null);
  };

  const addKo = (locId: string, delta: number) => {
    updateRun((r) => ({
      ...r,
      encounters: {
        ...r.encounters,
        [locId]: {
          ...r.encounters[locId],
          kos: Math.max(0, (r.encounters[locId].kos ?? 0) + delta),
        },
      },
    }));
  };

  const markFainted = (locId: string) => {
    updateRun((r) => ({
      ...r,
      encounters: {
        ...r.encounters,
        [locId]: { ...r.encounters[locId], status: "fainted", inParty: false },
      },
    }));
    // open the post-mortem editor right away, while the loss is fresh
    setNotesOpen(locId);
  };

  const setDeath = (
    locId: string,
    patch: Partial<Pick<Run["encounters"][string], "deathTags" | "deathNote">>,
  ) => {
    updateRun((r) => ({
      ...r,
      encounters: {
        ...r.encounters,
        [locId]: { ...r.encounters[locId], ...patch },
      },
    }));
  };

  const anyAbility = abilitiesRandomized(run);
  const levelCap = nextLevelCap(modeData, run) ?? 50;

  const sectionShared = {
    statLevel: levelCap,
    buildOpen,
    setBuildOpen,
    setBuild,
    addKo,
    evolveOpen,
    setEvolveOpen,
    setSpecies,
    anyAbility,
    noEvs: run.mode === "hardcore" || !!run.minimalGrind,
  };

  const toolbar = (
    <div className="box-toolbar">
      <label>
        Sort by
        <select
          value={sortStat}
          onChange={(e) =>
            setSortStat(e.target.value as StatKey | "KOS" | "BST" | "")
          }
        >
          <option value="">Caught order</option>
          <option value="KOS">Most KOs</option>
          <option value="BST">Highest BST</option>
          {STAT_KEYS.map((s) => (
            <option key={s} value={s}>
              Highest {s}
            </option>
          ))}
        </select>
      </label>
      <label>
        Type
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">Any</option>
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      {filterType && (
        <span
          className="type-badge"
          style={{ background: typeColor(filterType) }}
        >
          {filterType}
        </span>
      )}
    </div>
  );

  const filteredEmpty = (base: string) =>
    filterType ? `Nothing here matches ${filterType}.` : base;

  return (
    <div className="team">
      <div className="toolbar">
        <div className="segmented">
          <button
            className={subtab === "roster" ? "active" : ""}
            onClick={() => setSubtab("roster")}
          >
            Party &amp; Box
          </button>
          <button
            className={subtab === "readiness" ? "active" : ""}
            onClick={() => setSubtab("readiness")}
          >
            Battle readiness
          </button>
          <button
            className={subtab === "calculator" ? "active" : ""}
            onClick={() => setSubtab("calculator")}
          >
            Calculator
          </button>
        </div>
        {subtab === "roster" && toolbar}
      </div>
      <datalist id="team-items">
        {ITEM_NAMES.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
      <datalist id="team-moves">
        {MOVE_NAMES.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="team-abilities">
        {ABILITY_NAMES.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      {subtab === "readiness" && (
        <ReadinessView
          key={run.id}
          run={run}
          modeData={modeData}
          party={partyAll}
          setBuild={setBuild}
          onCalc={onCalc}
        />
      )}
      {subtab === "calculator" && (
        <CalculatorPage
          key={run.id}
          run={run}
          modeData={modeData}
          caught={caughtMons}
          noEvs={run.mode === "hardcore" || !!run.minimalGrind}
          anyAbility={anyAbility}
          target={calcTarget}
        />
      )}
      {subtab === "roster" && (
      <>
      <Section
        title="Party"
        items={party}
        empty={filteredEmpty("No Pokémon in the party — promote some from the box.")}
        highlightStat={sortStat}
        collapsed={collapsed.has("Party")}
        onToggleCollapsed={() => toggleCollapsed("Party")}
        {...sectionShared}
        actions={(id) => (
          <>
            <button onClick={() => setInParty(id, false)}>To box</button>
            <button className="danger" onClick={() => markFainted(id)}>
              Fainted
            </button>
          </>
        )}
      />
      <Section
        title="Box"
        items={box}
        empty={filteredEmpty(
          "Nothing in the box yet. Mark route encounters as caught to fill it.",
        )}
        highlightStat={sortStat}
        collapsed={collapsed.has("Box")}
        onToggleCollapsed={() => toggleCollapsed("Box")}
        {...sectionShared}
        actions={(id) => (
          <>
            <button
              disabled={partyAll.length >= 6}
              title={partyAll.length >= 6 ? "Party is full" : undefined}
              onClick={() => setInParty(id, true)}
            >
              To party
            </button>
            <button className="danger" onClick={() => markFainted(id)}>
              Fainted
            </button>
          </>
        )}
      />
      <Section
        title="Graveyard"
        items={graveyard}
        empty={filteredEmpty("No losses yet. Keep it that way.")}
        highlightStat={sortStat}
        canEvolve={false}
        collapsed={collapsed.has("Graveyard")}
        onToggleCollapsed={() => toggleCollapsed("Graveyard")}
        {...sectionShared}
        actions={(id) => (
          <>
            <button
              className={
                (run.encounters[id]?.deathTags?.length ?? 0) > 0 ||
                run.encounters[id]?.deathNote
                  ? "notes-marked"
                  : undefined
              }
              onClick={() => setNotesOpen(notesOpen === id ? null : id)}
            >
              Notes
            </button>
            <button
              onClick={() =>
                updateRun((r) => ({
                  ...r,
                  encounters: {
                    ...r.encounters,
                    [id]: { ...r.encounters[id], status: "caught" },
                  },
                }))
              }
            >
              Revive (undo)
            </button>
          </>
        )}
        extraPanel={(id, e) =>
          notesOpen === id ? (
            <DeathNotesEditor entry={e} onChange={(p) => setDeath(id, p)} />
          ) : null
        }
      />
      </>
      )}
    </div>
  );
}

/** battle-current stats at the given level: the build's nature, ability and
 * item applied (Light Ball, Choice items, Huge Power, ...); nature ups/downs
 * and item/ability-modified stats are tinted */
function CurrentStats({
  species,
  build,
  level,
  noEvs,
}: {
  species: string;
  build?: MonBuild;
  level: number;
  /** hardcore/restricted run or a Minimal Grind start: EVs don't apply */
  noEvs?: boolean;
}) {
  // statTotals builds an engine Pokémon — skip it unless this card's inputs
  // changed (build objects are referentially stable until edited)
  const computed = useMemo(() => {
    const cfg: PlayerMonConfig = {
      species,
      level,
      nature: build?.nature || "Serious",
      ability: build?.ability || abilitiesFor(species)[0] || "",
      item: build?.item ?? "",
      evs: noEvs ? {} : (build?.evs ?? {}),
      moves: [],
    };
    return { nature: cfg.nature, t: statTotals(cfg, {}) };
  }, [species, build, level, noEvs]);
  const t = computed.t;
  if (!t) return null;
  const nature = NATURE_EFFECTS[computed.nature];
  const cls = (k: string) =>
    t.itemMods[k] || t.abilityMods[k]
      ? "alt-speed"
      : nature?.plus === k
        ? "nature-plus"
        : nature?.minus === k
          ? "nature-minus"
          : "";
  return (
    <table className="stat-table">
      <thead>
        <tr>
          <th></th>
          {STAT_KEYS.map((s) => (
            <th key={s}>{s}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="k">Lv {level}</td>
          {STAT_KEYS.map((s) => (
            <td key={s} className={cls(s)}>
              {t.totals[s] ?? "–"}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** party in the boss-preview compact style: rows that expand into current
 * stats, defensive profile and the build editor */
function PartyPreview({
  party,
  setBuild,
  anyAbility,
  noEvs,
  level,
}: {
  party: Entry[];
  setBuild: (locId: string, build: MonBuild | undefined) => void;
  anyAbility?: boolean;
  /** hardcore/restricted run or a Minimal Grind start: hides EV inputs */
  noEvs?: boolean;
  /** level cap the current-stats row is computed at */
  level: number;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="readiness-preview">
      {party.map(([locId, e]) => (
        <div
          key={locId}
          className={open === locId ? "preview-wrap open" : "preview-wrap"}
        >
          <button
            className={"preview-row" + (open === locId ? " open" : "")}
            onClick={() => setOpen(open === locId ? null : locId)}
          >
            <Sprite species={e.species} size={40} />
            <span className="team-info">
              <span className="team-name">
                {e.nickname || e.species}
                {e.nickname && <span className="muted"> · {e.species}</span>}
              </span>
              <TypeBadges species={e.species} small />
              <span className="preview-meta muted">
                {e.build ? (
                  <>
                    {e.build.nature}
                    {e.build.ability && ` · ${e.build.ability}`}
                    {e.build.item && (
                      <>
                        {" · "}
                        <ItemSprite name={e.build.item} size={18} /> {e.build.item}
                      </>
                    )}
                  </>
                ) : (
                  "no build set"
                )}
              </span>
            </span>
            <span className="chev">{open === locId ? "▾" : "▸"}</span>
          </button>
          {open === locId && (
            <div className="party-detail">
              <CurrentStats
                species={e.species}
                build={e.build}
                level={level}
                noEvs={noEvs}
              />
              <SpeciesDefenses
                species={e.species}
                ability={e.build?.ability || abilitiesFor(e.species)[0]}
              />
              <BuildEditor
                species={e.species}
                build={e.build ?? EMPTY_BUILD}
                onChange={(b) => setBuild(locId, b)}
                onClear={() => setBuild(locId, undefined)}
                anyAbility={anyAbility}
                noEvs={noEvs}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** two-column battle-readiness layout on a shared grid, so the party
 * header lines up with the boss selector and both card grids start level */
function ReadinessView({
  run,
  modeData,
  party,
  setBuild,
  onCalc,
}: {
  run: Run;
  modeData: BossMode;
  party: Entry[];
  setBuild: (locId: string, build: MonBuild | undefined) => void;
  onCalc?: (mon: BossMon, battleEffect: string, levelCap?: number) => void;
}) {
  // remember the last viewed boss per run
  const storageKey = `rr-tracker.readinessBoss.${run.id}`;
  const [selected, setSelected] = useState(
    () => localStorage.getItem(storageKey) ?? "",
  );
  const select = (v: string) => {
    setSelected(v);
    localStorage.setItem(storageKey, v);
  };
  const rivalStarter = rivalStarterFor(run);
  // keep the boss picker following the cap pill's "next required fight"
  // until the player manually strays — re-syncs whenever that fight
  // actually advances (a trainer gets checked off), not on every render
  const nextOrderIdx = useMemo(
    () => nextRequiredIndex(modeData.trainerOrder, run),
    [modeData, run],
  );
  useEffect(() => {
    const autoKey = `rr-tracker.readinessBossAutoIdx.${run.id}`;
    if (localStorage.getItem(autoKey) === String(nextOrderIdx)) return;
    localStorage.setItem(autoKey, String(nextOrderIdx));
    if (nextOrderIdx < 0) return;
    const target = bossTeamFor(modeData, nextOrderIdx);
    if (!target) return;
    const cat = modeData.categories.find((c) => c.name === target.category);
    const i = cat?.bosses.findIndex(
      (b) => b.title === target.title && bossMatchesStarter(b.subtitle, rivalStarter),
    );
    if (i === undefined || i < 0) return;
    const v = `${target.category}|${i}`;
    setSelected(v);
    localStorage.setItem(storageKey, v);
  }, [nextOrderIdx, modeData, run.id, rivalStarter, storageKey]);
  const levelCap = nextLevelCap(modeData, run);
  const [catName, idxStr] = selected.split("|");
  const boss = modeData.categories
    .find((c) => c.name === catName)
    ?.bosses[Number(idxStr)];
  // weather defaults to the boss's permanent weather; picking one overrides
  // it until another boss is selected
  const bossField = boss?.battleEffect
    ? fieldFromBattleEffect(boss.battleEffect)
    : {};
  const [weatherPick, setWeatherPick] = useState<{
    boss: string;
    value: string;
  } | null>(null);
  const weather =
    weatherPick?.boss === selected ? weatherPick.value : (bossField.weather ?? "");
  const terrain = bossField.terrain ?? "";
  return (
    <div className="readiness">
      <div className="readiness-head head-party">
        <h3>
          Party <span className="count">({party.length})</span>
        </h3>
        <label className="boss-picker-label weather-label">
          Weather
          <select
            value={weather}
            onChange={(e) =>
              setWeatherPick({ boss: selected, value: e.target.value })
            }
          >
            <option value="">None</option>
            {WEATHERS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="readiness-head head-boss">
        <label className="boss-picker-label">
          Boss team
          <select value={selected} onChange={(e) => select(e.target.value)}>
            <option value="">— choose a boss —</option>
            {modeData.categories.map((cat) => (
              <optgroup key={cat.name} label={cat.name}>
                {cat.bosses.map((b, i) =>
                  bossMatchesStarter(b.subtitle, rivalStarter) ? (
                    <option key={i} value={`${cat.name}|${i}`}>
                      {b.title}
                      {b.subtitle ? ` — ${b.subtitle}` : ""}
                    </option>
                  ) : null,
                )}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className="readiness-col col-party">
        {party.length === 0 && (
          <p className="muted">
            No Pokémon in the party — promote some from the box.
          </p>
        )}
        <PartyPreview
          party={party}
          setBuild={setBuild}
          anyAbility={abilitiesRandomized(run)}
          noEvs={run.mode === "hardcore" || !!run.minimalGrind}
          level={levelCap ?? 50}
        />
      </div>
      <div className="readiness-col col-boss">
        {boss ? (
          <BossPreview
            key={selected}
            boss={boss}
            levelCap={levelCap}
            onCalc={onCalc}
          />
        ) : (
          <p className="muted">Pick a boss team to check your party against.</p>
        )}
      </div>
      {boss && party.length > 0 && (
        <MatchupSection
          runId={run.id}
          party={party}
          boss={boss}
          levelCap={levelCap}
          weather={weather}
          terrain={terrain}
          noEvs={run.mode === "hardcore" || !!run.minimalGrind}
        />
      )}
    </div>
  );
}

interface MatchupShared {
  crit: boolean;
  setCrit: (fn: (c: boolean) => boolean) => void;
  doubles: boolean;
  setDoubles: (fn: (d: boolean) => boolean) => void;
  myStatus: string;
  setMyStatus: (s: string) => void;
  foeStatus: string;
  setFoeStatus: (s: string) => void;
}

/** the matchup area below the readiness divider: "You vs them" (your moves
 * against the boss team) and "Them vs you" (a boss Pokémon's moves against
 * your party). Status/crit settings carry across the two tabs. */
function MatchupSection({
  runId,
  party,
  boss,
  levelCap,
  weather,
  terrain,
  noEvs,
}: {
  runId: string;
  party: Entry[];
  boss: Boss;
  levelCap?: number;
  weather: string;
  terrain: string;
  /** hardcore/restricted run or a Minimal Grind start: EVs don't apply */
  noEvs?: boolean;
}) {
  const dirKey = `rr-tracker.readinessMatchupDir.${runId}`;
  const [dir, setDirState] = useState<"you" | "them">(() =>
    localStorage.getItem(dirKey) === "them" ? "them" : "you",
  );
  const setDir = (d: "you" | "them") => {
    setDirState(d);
    localStorage.setItem(dirKey, d);
  };
  const [crit, setCrit] = useState(false);
  // spread moves deal 0.75x in doubles — default from the boss sheet's own
  // "DOUBLES" battle-effect tag, editable either way
  const [doubles, setDoubles] = useState(() => /DOUBLES/i.test(boss.battleEffect));
  const [myStatus, setMyStatus] = useState("");
  const [foeStatus, setFoeStatus] = useState("");
  const shared: MatchupShared = {
    crit,
    setCrit,
    doubles,
    setDoubles,
    myStatus,
    setMyStatus,
    foeStatus,
    setFoeStatus,
  };
  const props = { runId, party, boss, levelCap, weather, terrain, noEvs, ...shared };
  return (
    <div className="matchup">
      <div className="segmented matchup-dir">
        <button
          className={dir === "you" ? "active" : ""}
          onClick={() => setDir("you")}
        >
          You vs them
        </button>
        <button
          className={dir === "them" ? "active" : ""}
          onClick={() => setDir("them")}
        >
          Them vs you
        </button>
      </div>
      {dir === "you" ? <MoveMatchup {...props} /> : <FoeMatchup {...props} />}
    </div>
  );
}

/** the shared status pickers and crit/doubles toggles of both matchup tabs */
function MatchupControls({
  crit,
  setCrit,
  doubles,
  setDoubles,
  myStatus,
  setMyStatus,
  foeStatus,
  setFoeStatus,
}: MatchupShared) {
  return (
    <>
      <label className="boss-picker-label status-label">
        Your status
        <select value={myStatus} onChange={(e) => setMyStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="boss-picker-label status-label">
        Their status
        <select value={foeStatus} onChange={(e) => setFoeStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <ModifierToggle
        active={crit}
        title="Calculate every move as a critical hit"
        onClick={() => setCrit((c) => !c)}
      >
        Crit
      </ModifierToggle>
      <ModifierToggle
        active={doubles}
        title="Double battle — spread moves (Earthquake, Surf, Heat Wave…) deal ×0.75 to each target"
        onClick={() => setDoubles((d) => !d)}
      >
        Doubles
      </ModifierToggle>
    </>
  );
}

/** one row per move of the chosen party mon; each row previews the damage
 * against every Pokémon of the selected boss as an HP bar */
function MoveMatchup({
  runId,
  party,
  boss,
  levelCap,
  weather,
  terrain,
  noEvs,
  ...shared
}: {
  runId: string;
  party: Entry[];
  boss: Boss;
  levelCap?: number;
  weather: string;
  terrain: string;
  /** hardcore/restricted run or a Minimal Grind start: EVs don't apply */
  noEvs?: boolean;
} & MatchupShared) {
  const { crit, doubles, myStatus, foeStatus } = shared;
  // remember the last attacker per run, like the boss selection
  const storageKey = `rr-tracker.readinessAttacker.${runId}`;
  const [sel, setSel] = useState(
    () => localStorage.getItem(storageKey) ?? "",
  );
  const select = (v: string) => {
    setSel(v);
    localStorage.setItem(storageKey, v);
  };
  const active = party.find(([id]) => id === sel) ?? party[0];
  const activeId = active?.[0] ?? "";
  const mon = active?.[1];
  const level = levelCap ?? 50;
  // the grid is an engine calc per move × defender — recompute only when the
  // attacker entry, boss, or field actually change, not on every re-render
  // (entry objects are referentially stable in run state unless edited)
  const grid = useMemo(() => {
    if (!mon) return null;
    const cfg: PlayerMonConfig = {
      species: mon.species,
      level,
      nature: mon.build?.nature || "Serious",
      ability: mon.build?.ability || abilitiesFor(mon.species)[0] || "",
      item: mon.build?.item ?? "",
      evs: noEvs ? {} : (mon.build?.evs ?? {}),
      status: myStatus,
      moves: mon.build?.moves ?? [],
    };
    const attacker = buildPlayerPokemon(cfg);
    const fieldOpts = {
      weather: weather || undefined,
      terrain: terrain || undefined,
      gameType: doubles ? "Doubles" : "Singles",
    };
    // weather/terrain summoned by switch-in abilities (Drought, Orichalcum
    // Pulse, …) applies per matchup unless the pickers above override it
    const defenders = boss.pokemon.map((bm) => ({
      bm,
      poke: buildBossPokemon(
        bm,
        defaultBossLevel(bm.level, levelCap),
        undefined,
        foeStatus,
      ),
      field: autoField(fieldOpts, [cfg.ability, bm.ability]),
    }));
    const autoBits = autoFieldNote(fieldOpts, [
      cfg.ability,
      ...boss.pokemon.map((bm) => bm.ability),
    ]);
    return {
      cfg,
      unknown: !attacker,
      autoBits,
      rows: (mon.build?.moves ?? [])
        .filter((m) => m.trim())
        .map((move) => ({
          move,
          targets: defenders.map(({ bm, poke, field }) => ({
            bm,
            line:
              attacker && poke
                ? calcMoveRange(attacker, poke, move, field, crit)
                : null,
          })),
        })),
    };
  }, [mon, level, levelCap, boss, weather, terrain, crit, doubles, myStatus, foeStatus, noEvs]);
  if (!mon || !grid) return null;
  return (
    <>
      <div className="matchup-toolbar">
        <label className="boss-picker-label attacker-label">
          Attacker
          <select value={activeId} onChange={(e) => select(e.target.value)}>
            {party.map(([id, e]) => (
              <option key={id} value={id}>
                {e.nickname ? `${e.nickname} (${e.species})` : e.species}
              </option>
            ))}
          </select>
        </label>
        <MatchupControls {...shared} />
        <span className="muted matchup-note">
          your moves vs {boss.title}
          {weather && ` · ${weather}`}
          {terrain && ` · ${terrain} Terrain`}
          {grid.autoBits.map((b) => ` · auto ${b}`).join("")}
          {doubles && " · doubles"}
          {crit && " · crit"}
        </span>
      </div>
      <div className="matchup-body">
        <div className="matchup-attacker">
          <Sprite species={mon.species} size={56} />
          <div className="team-name">
            {mon.nickname || mon.species}
            {mon.nickname && <span className="muted"> · {mon.species}</span>}
          </div>
          <TypeBadges species={mon.species} small />
          <div className="muted matchup-attacker-meta">
            Lv {level} · {grid.cfg.nature}
            {grid.cfg.ability && ` · ${grid.cfg.ability}`}
          </div>
          {grid.cfg.item && (
            <div className="muted matchup-attacker-meta">
              <ItemSprite name={grid.cfg.item} size={18} /> {grid.cfg.item}
            </div>
          )}
          {grid.unknown && (
            <div className="save-error">The calc doesn't know this species.</div>
          )}
        </div>
        <div className="matchup-rows">
          {grid.rows.length === 0 && (
            <p className="muted">
              No moves set — expand this Pokémon in the party list above and
              fill in its build to preview damage.
            </p>
          )}
          {grid.rows.map(({ move, targets }, mi) => (
            <div key={mi} className="matchup-row">
              <div className="matchup-move">{move}</div>
              <div className="matchup-targets">
                {targets.map(({ bm, line }, i) => (
                  <TargetCard key={i} species={bm.species} label={bm.species} line={line} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** the inverse matrix: one row per move of a chosen boss Pokémon; each row
 * previews the damage into every member of your party */
function FoeMatchup({
  runId,
  party,
  boss,
  levelCap,
  weather,
  terrain,
  noEvs,
  ...shared
}: {
  runId: string;
  party: Entry[];
  boss: Boss;
  levelCap?: number;
  weather: string;
  terrain: string;
  /** hardcore/restricted run or a Minimal Grind start: EVs don't apply */
  noEvs?: boolean;
} & MatchupShared) {
  const { crit, doubles, myStatus, foeStatus } = shared;
  const storageKey = `rr-tracker.readinessFoe.${runId}`;
  const [sel, setSel] = useState(
    () => parseInt(localStorage.getItem(storageKey) ?? "0", 10) || 0,
  );
  const select = (v: number) => {
    setSel(v);
    localStorage.setItem(storageKey, String(v));
  };
  const idx = sel >= 0 && sel < boss.pokemon.length ? sel : 0;
  const bm = boss.pokemon[idx];
  const level = levelCap ?? 50;
  const grid = useMemo(() => {
    if (!bm) return null;
    const bossLevel = defaultBossLevel(bm.level, levelCap);
    const attacker = buildBossPokemon(bm, bossLevel, undefined, foeStatus);
    const fieldOpts = {
      weather: weather || undefined,
      terrain: terrain || undefined,
      gameType: doubles ? "Doubles" : "Singles",
    };
    const defenders = party.map(([id, e]) => {
      const cfg: PlayerMonConfig = {
        species: e.species,
        level,
        nature: e.build?.nature || "Serious",
        ability: e.build?.ability || abilitiesFor(e.species)[0] || "",
        item: e.build?.item ?? "",
        evs: noEvs ? {} : (e.build?.evs ?? {}),
        status: myStatus,
        moves: [],
      };
      return {
        id,
        e,
        ability: cfg.ability,
        poke: buildPlayerPokemon(cfg),
        field: autoField(fieldOpts, [bm.ability, cfg.ability]),
      };
    });
    const autoBits = autoFieldNote(fieldOpts, [
      bm.ability,
      ...defenders.map((d) => d.ability),
    ]);
    return {
      bossLevel,
      unknown: !attacker,
      autoBits,
      rows: bm.moves
        .filter((m) => m.trim() && m !== "-")
        .map((move) => ({
          move,
          targets: defenders.map(({ id, e, poke, field }) => ({
            id,
            e,
            line:
              attacker && poke
                ? calcMoveRange(attacker, poke, move, field, crit)
                : null,
          })),
        })),
    };
  }, [bm, party, level, levelCap, weather, terrain, crit, doubles, myStatus, foeStatus, noEvs]);
  if (!bm || !grid) return null;
  return (
    <>
      <div className="matchup-toolbar">
        <label className="boss-picker-label attacker-label">
          Attacker
          <select
            value={idx}
            onChange={(e) => select(parseInt(e.target.value, 10))}
          >
            {boss.pokemon.map((m, i) => (
              <option key={i} value={i}>
                {m.species}
              </option>
            ))}
          </select>
        </label>
        <MatchupControls {...shared} />
        <span className="muted matchup-note">
          {bm.species}'s moves vs your party
          {weather && ` · ${weather}`}
          {terrain && ` · ${terrain} Terrain`}
          {grid.autoBits.map((b) => ` · auto ${b}`).join("")}
          {doubles && " · doubles"}
          {crit && " · crit"}
        </span>
      </div>
      <div className="matchup-body">
        <div className="matchup-attacker">
          <Sprite species={bm.species} size={56} />
          <div className="team-name">{bm.species}</div>
          <TypeBadges species={bm.species} small />
          <div className="muted matchup-attacker-meta">
            Lv {grid.bossLevel} · {bm.nature}
            {bm.ability && ` · ${bm.ability}`}
          </div>
          {bm.item && bm.item !== "-" && (
            <div className="muted matchup-attacker-meta">
              <ItemSprite name={bm.item} size={18} /> {bm.item}
            </div>
          )}
          {grid.unknown && (
            <div className="save-error">The calc doesn't know this species.</div>
          )}
        </div>
        <div className="matchup-rows">
          {grid.rows.length === 0 && (
            <p className="muted">No moves listed for this Pokémon.</p>
          )}
          {grid.rows.map(({ move, targets }, mi) => (
            <div key={mi} className="matchup-row">
              <div className="matchup-move">{move}</div>
              <div className="matchup-targets">
                {targets.map(({ id, e, line }) => (
                  <TargetCard
                    key={id}
                    species={e.species}
                    label={e.nickname || e.species}
                    line={line}
                    tone="incoming"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function TargetCard({
  species,
  label,
  line,
  tone = "outgoing",
}: {
  species: string;
  label: string;
  line: MoveRange | null;
  /** outgoing = a KO is good news (green), incoming = it's your mon (red) */
  tone?: "outgoing" | "incoming";
}) {
  const ok = line !== null && !line.error;
  const guard = ok ? line.guard : undefined;
  const ko = ok && !guard && line.minPercent >= 100;
  const maybeKo = ok && !guard && !ko && line.maxPercent >= 100;
  // remaining HP range: sure = survives even max damage, maybe = roll-dependent;
  // a Sturdy/Focus Sash holder always keeps at least a 1 HP sliver
  let lo = ok ? Math.max(0, 100 - line.maxPercent) : 100;
  let hi = ok ? Math.max(0, 100 - line.minPercent) : 100;
  if (guard) {
    lo = Math.max(lo, 1);
    hi = Math.max(hi, lo);
  }
  const barTone = lo < 25 ? " low" : lo < 55 ? " mid" : "";
  const koClass = tone === "incoming" ? " ko-bad" : " ko";
  return (
    <div className="target-card">
      <Sprite species={species} size={30} />
      <span className="target-info">
        <span className="target-name">{label}</span>
        <span className="hp-bar">
          <span className={"hp-sure" + barTone} style={{ width: `${lo}%` }} />
          <span className="hp-maybe" style={{ width: `${hi - lo}%` }} />
        </span>
        <span
          className={"target-dmg" + (ko ? koClass : maybeKo || guard ? " maybe-ko" : "")}
          title={
            guard
              ? `${guard} keeps it at 1 HP through a single otherwise-lethal hit`
              : undefined
          }
        >
          {!line
            ? "—"
            : line.error
              ? line.error
              : ko
                ? `KO · ${line.minPercent}%+`
                : guard
                  ? `${line.minPercent}–${line.maxPercent}% · 1 HP (${guard})`
                  : `${line.minPercent}–${line.maxPercent}%${maybeKo ? " · may KO" : ""}`}
        </span>
      </span>
    </div>
  );
}

function BossPreview({
  boss,
  levelCap,
  onCalc,
}: {
  boss: Boss;
  levelCap?: number;
  onCalc?: (mon: BossMon, battleEffect: string, levelCap?: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="readiness-preview">
      {(boss.battleEffect || boss.chained || boss.chainedNext) && (
        <div className="effect-row">
          {boss.battleEffect && (
            <span className="battle-effect">⚡ {boss.battleEffect}</span>
          )}
          {(boss.chained || boss.chainedNext) && (
            <span
              className="chain-badge"
              title="Fought back-to-back with the previous team — no healing between the fights"
            >
              ⛓ back-to-back
            </span>
          )}
        </div>
      )}
      {boss.pokemon.map((m, i) => (
        <div key={i} className={open === i ? "preview-wrap open" : "preview-wrap"}>
          <button
            className={"preview-row" + (open === i ? " open" : "")}
            onClick={() => setOpen(open === i ? null : i)}
          >
            <Sprite species={m.species} size={40} />
            <span className="team-info">
              <span className="team-name">{m.species}</span>
              <TypeBadges species={m.species} small />
              <span className="preview-meta muted">
                Lv. {m.level || "?"}
                {m.item && !isNoItem(m.item) && (
                  <>
                    {" · "}
                    <ItemSprite name={m.item} size={18} /> {m.item}
                  </>
                )}
              </span>
            </span>
            <span className="chev">{open === i ? "▾" : "▸"}</span>
          </button>
          {open === i && (
            <MonCard
              mon={m}
              battleEffect={boss.battleEffect}
              levelCap={levelCap}
              onCalc={onCalc}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function BuildEditor({
  species,
  build,
  onChange,
  onClear,
  anyAbility,
  noEvs,
}: {
  species: string;
  build: MonBuild;
  onChange: (build: MonBuild) => void;
  onClear: () => void;
  /** ability randomizer active: accept any ability, not just legal ones */
  anyAbility?: boolean;
  /** hardcore/restricted run or a Minimal Grind start: EVs don't apply */
  noEvs?: boolean;
}) {
  const legalAbilities = abilitiesFor(species);
  return (
    <div className="build-editor">
      <div className="calc-row">
        <select
          title="Nature"
          value={build.nature}
          onChange={(e) => onChange({ ...build, nature: e.target.value })}
        >
          {NATURES.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        {legalAbilities.length > 0 && !anyAbility ? (
          <select
            title="Ability"
            value={build.ability || legalAbilities[0]}
            onChange={(e) => onChange({ ...build, ability: e.target.value })}
          >
            {legalAbilities.map((a, i) => (
              <option key={a} value={a}>
                {a}
                {i === legalAbilities.length - 1 && legalAbilities.length > 1
                  ? " (hidden)"
                  : ""}
              </option>
            ))}
          </select>
        ) : (
          <input
            placeholder="Ability"
            list="team-abilities"
            value={build.ability}
            onChange={(e) => onChange({ ...build, ability: e.target.value })}
          />
        )}
        <input
          placeholder="Held item"
          list="team-items"
          value={build.item}
          onChange={(e) => onChange({ ...build, item: e.target.value })}
        />
      </div>
      {!noEvs && (
        <div className="calc-row evs">
          {STAT_KEYS.map((k) => (
            <label key={k}>
              {k} EV
              <input
                type="number"
                min={0}
                max={252}
                step={4}
                value={build.evs?.[k] ?? 0}
                onChange={(e) =>
                  onChange({
                    ...build,
                    evs: {
                      ...build.evs,
                      [k]: Math.max(0, Math.min(252, parseInt(e.target.value, 10) || 0)),
                    },
                  })
                }
              />
            </label>
          ))}
          <span className="muted ev-total">
            {STAT_KEYS.reduce((sum, k) => sum + (build.evs?.[k] ?? 0), 0)}/508
          </span>
        </div>
      )}
      <div className="calc-row">
        {build.moves.map((m, i) => (
          <input
            key={i}
            className="calc-move"
            placeholder={`Move ${i + 1}`}
            list="team-moves"
            value={m}
            onChange={(e) => {
              const moves = [...build.moves];
              moves[i] = e.target.value;
              onChange({ ...build, moves });
            }}
          />
        ))}
      </div>
      <div className="build-editor-foot muted">
        The damage calculator imports this set when you select {species}.
        <button className="st-btn clear" onClick={onClear}>
          Clear build
        </button>
      </div>
    </div>
  );
}

const DEATH_TAGS = [
  "Sacrificed",
  "Bad luck",
  "Crit",
  "Status effect",
  "Wrong matchup",
  "Misplay",
  "Underleveled",
];

/** post-mortem panel for graveyard entries: cause-of-death tags + a
 * free-form note, saved straight into the encounter like builds are */
function DeathNotesEditor({
  entry,
  onChange,
}: {
  entry: Entry[1];
  onChange: (patch: { deathTags?: string[]; deathNote?: string }) => void;
}) {
  const tags = entry.deathTags ?? [];
  const toggle = (t: string) =>
    onChange({
      deathTags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t],
    });
  return (
    <div className="death-editor">
      <div className="death-tag-row">
        {DEATH_TAGS.map((t) => (
          <button
            key={t}
            className={tags.includes(t) ? "death-tag-btn active" : "death-tag-btn"}
            onClick={() => toggle(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        placeholder="What happened? The situation, the mistake, the lesson…"
        value={entry.deathNote ?? ""}
        onChange={(e) => onChange({ deathNote: e.target.value })}
      />
    </div>
  );
}

function EvolvePanel({
  species,
  onPick,
}: {
  species: string;
  onPick: (species: string) => void;
}) {
  const evos = evolutionsFor(species);
  const pres = preEvolutionsFor(species);
  const forms = formsFor(species);
  return (
    <div className="evolve-panel">
      {evos.map((ev) => (
        <button
          key={ev.to}
          className="evolve-option"
          onClick={() => onPick(ev.to)}
        >
          <Sprite species={ev.to} size={36} />
          <span className="evolve-name">{ev.to}</span>
          <TypeBadges species={ev.to} small />
          <span className="muted">{ev.how}</span>
        </button>
      ))}
      {evos.length === 0 && forms.length === 0 && (
        <span className="muted">{species} doesn't evolve further.</span>
      )}
      {forms.map((f) => (
        <button key={f} className="evolve-option" onClick={() => onPick(f)}>
          <Sprite species={f} size={36} />
          <span className="evolve-name">{f}</span>
          <TypeBadges species={f} small />
          <span className="muted">form change</span>
        </button>
      ))}
      {pres.length > 0 && (
        <div className="evolve-devolve">
          <span className="muted">Devolve (undo):</span>
          {pres.map((p) => (
            <button key={p} className="st-btn clear" onClick={() => onPick(p)}>
              ← {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Top-level component (not defined inside TeamView's render) so React keeps
 * the subtree mounted across re-renders — otherwise inputs lose focus on
 * every keystroke. */
interface SectionCommon {
  buildOpen: string | null;
  setBuildOpen: (locId: string | null) => void;
  setBuild: (locId: string, build: MonBuild | undefined) => void;
  addKo: (locId: string, delta: number) => void;
  evolveOpen: string | null;
  setEvolveOpen: (locId: string | null) => void;
  setSpecies: (locId: string, species: string) => void;
  canEvolve?: boolean;
  anyAbility?: boolean;
  /** hardcore/restricted run or a Minimal Grind start: EVs don't apply */
  noEvs?: boolean;
  /** level the current-stats row is computed at (the run's level cap) */
  statLevel: number;
  /** section-specific panel under a card (graveyard: death notes editor) */
  extraPanel?: (locId: string, e: Entry[1]) => React.ReactNode;
}

/** Evolve/Build toggle buttons shared by the full-card and compact layouts */
function EditButtons({
  locId,
  species,
  build,
  buildOpen,
  setBuildOpen,
  evolveOpen,
  setEvolveOpen,
  canEvolve,
}: {
  locId: string;
  species: string;
  build?: MonBuild;
} & Pick<
  SectionCommon,
  "buildOpen" | "setBuildOpen" | "evolveOpen" | "setEvolveOpen" | "canEvolve"
>) {
  return (
    <>
      <button onClick={() => setBuildOpen(buildOpen === locId ? null : locId)}>
        {build ? "Edit build" : "Build"}
      </button>
      {canEvolve &&
        (evolutionsFor(species).length > 0 ||
          preEvolutionsFor(species).length > 0 ||
          formsFor(species).length > 0) && (
          <button onClick={() => setEvolveOpen(evolveOpen === locId ? null : locId)}>
            {evolutionsFor(species).length > 0 || preEvolutionsFor(species).length > 0
              ? "Evolve"
              : "Form"}
          </button>
        )}
    </>
  );
}

/** Build editor / evolve panel / extra panel, expanded under a card in
 * either layout */
function ItemExtras({
  locId,
  e,
  buildOpen,
  evolveOpen,
  setBuild,
  setSpecies,
  anyAbility,
  noEvs,
  extraPanel,
}: {
  locId: string;
  e: Entry[1];
} & Pick<
  SectionCommon,
  | "buildOpen"
  | "evolveOpen"
  | "setBuild"
  | "setSpecies"
  | "anyAbility"
  | "noEvs"
  | "extraPanel"
>) {
  return (
    <>
      {buildOpen === locId && (
        <BuildEditor
          species={e.species}
          build={e.build ?? EMPTY_BUILD}
          onChange={(b) => setBuild(locId, b)}
          onClear={() => setBuild(locId, undefined)}
          anyAbility={anyAbility}
          noEvs={noEvs}
        />
      )}
      {evolveOpen === locId && (
        <EvolvePanel species={e.species} onPick={(sp) => setSpecies(locId, sp)} />
      )}
      {extraPanel?.(locId, e)}
    </>
  );
}

/** Top-level component (not defined inside TeamView's render) so React keeps
 * the subtree mounted across re-renders — otherwise inputs lose focus on
 * every keystroke. */
function Section({
  title,
  items,
  empty,
  actions,
  highlightStat,
  collapsed = false,
  onToggleCollapsed,
  canEvolve = true,
  ...common
}: {
  title: string;
  items: Entry[];
  empty: string;
  actions: (locId: string) => React.ReactNode;
  highlightStat?: StatKey | "KOS" | "BST" | "";
  /** minimized to a scan-friendly table instead of full cards (persisted per run) */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
} & SectionCommon) {
  return (
    <section className="team-section">
      <button
        className="team-section-head"
        onClick={onToggleCollapsed}
        disabled={!onToggleCollapsed}
      >
        <h3>
          {title} <span className="count">({items.length})</span>
        </h3>
        {onToggleCollapsed && <span className="chev">{collapsed ? "▸" : "▾"}</span>}
      </button>
      {items.length === 0 && <p className="muted">{empty}</p>}
      {items.length > 0 &&
        (collapsed ? (
          <MiniTable items={items} highlightStat={highlightStat} />
        ) : (
          <FullGrid
            items={items}
            actions={actions}
            highlightStat={highlightStat}
            canEvolve={canEvolve}
            {...common}
          />
        ))}
    </section>
  );
}

function FullGrid({
  items,
  actions,
  highlightStat,
  canEvolve,
  statLevel,
  ...common
}: {
  items: Entry[];
  actions: (locId: string) => React.ReactNode;
  highlightStat?: StatKey | "KOS" | "BST" | "";
  canEvolve?: boolean;
} & SectionCommon) {
  return (
    <div className="team-grid">
      {items.map(([locId, e]) => {
        const bst = bstFor(e.species);
        return (
          <div key={locId} className="team-card-wrap">
            <div className="team-card">
              <Sprite species={e.species} size={48} />
              <div className="team-info">
                <div className="team-name">
                  {e.nickname || e.species}
                  {e.nickname && <span className="muted"> · {e.species}</span>}
                  {highlightStat &&
                    highlightStat !== "KOS" &&
                    highlightStat !== "BST" &&
                    statsFor(e.species)[highlightStat] !== undefined && (
                      <span className="stat-pill">
                        {highlightStat} {statsFor(e.species)[highlightStat]}
                      </span>
                    )}
                </div>
                <TypeBadges species={e.species} small />
                <div className="team-loc muted">
                  {locId === "starter"
                    ? "starter · oak's lab"
                    : locId.startsWith("static-")
                      ? "static · " + locId.slice(7).replace(/-/g, " ")
                      : locId.replace(/-/g, " ")}
                </div>
                {e.build && (
                  <div className="build-summary muted">
                    {e.build.nature}
                    {e.build.ability && ` · ${e.build.ability}`}
                    {e.build.item && (
                      <>
                        {" · "}
                        <ItemSprite name={e.build.item} size={18} /> {e.build.item}
                      </>
                    )}
                  </div>
                )}
                <div className="ko-counter">
                  <span className="ko-label" title="Enemy Pokémon knocked out by this one">
                    KOs
                  </span>
                  <button className="ko-btn" onClick={() => common.addKo(locId, -1)} aria-label="Remove KO">
                    −
                  </button>
                  <span className="ko-count">{e.kos ?? 0}</span>
                  <button className="ko-btn" onClick={() => common.addKo(locId, 1)} aria-label="Add KO">
                    +
                  </button>
                </div>
                {bst > 0 && (
                  <div className="bst-line">
                    <span className="ko-label" title="Base stat total">
                      BST
                    </span>
                    <span className="bst-val">{bst}</span>
                  </div>
                )}
              </div>
              <div className="team-actions">
                {actions(locId)}
                <EditButtons
                  locId={locId}
                  species={e.species}
                  build={e.build}
                  buildOpen={common.buildOpen}
                  setBuildOpen={common.setBuildOpen}
                  evolveOpen={common.evolveOpen}
                  setEvolveOpen={common.setEvolveOpen}
                  canEvolve={canEvolve}
                />
              </div>
              <CurrentStats
                species={e.species}
                build={e.build}
                level={statLevel}
                noEvs={common.noEvs}
              />
            </div>
            <ItemExtras locId={locId} e={e} {...common} />
          </div>
        );
      })}
    </div>
  );
}

/** rows that minimize to a single line (sprite, name, meta, chevron) — like
 * the Routes screen's encounter list — and expand on click into the same
 * details the full card shows inline */
/** a collapsed section's contents: the same dense, borderless row style as
 * the Routes screen's encounter tables — for scanning a long box/graveyard
 * at a glance. Un-collapse the section (click its header) to edit again. */
function MiniTable({
  items,
  highlightStat,
}: {
  items: Entry[];
  highlightStat?: StatKey | "KOS" | "BST" | "";
}) {
  return (
    <div className="method-table team-mini-table">
      <table>
        <tbody>
          {items.map(([locId, e]) => {
            const bst = bstFor(e.species);
            return (
              <tr key={locId}>
                <td className="cell-sprite">
                  <Sprite species={e.species} size={32} />
                </td>
                <td className="cell-species">
                  {e.nickname || e.species}
                  {e.nickname && <span className="muted"> ({e.species})</span>}
                  {highlightStat &&
                    highlightStat !== "KOS" &&
                    highlightStat !== "BST" &&
                    statsFor(e.species)[highlightStat] !== undefined && (
                      <span className="stat-pill">
                        {highlightStat} {statsFor(e.species)[highlightStat]}
                      </span>
                    )}
                </td>
                <td>
                  <TypeBadges species={e.species} small />
                </td>
                <td className="cell-levels muted">
                  {e.build &&
                    [e.build.nature, e.build.ability, e.build.item]
                      .filter(Boolean)
                      .join(" · ")}
                </td>
                <td className="cell-rarity muted">
                  {e.kos ?? 0} KO{(e.kos ?? 0) === 1 ? "" : "s"}
                  {bst > 0 && ` · BST ${bst}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
