import { useEffect, useMemo, useRef, useState } from "react";
import type { Boss, BossMode, BossMon, CalcTarget, CaughtMon, Run } from "../types";
import { ALL_SPECIES, abilitiesFor } from "./TypeBadges";
import { SpeciesCombobox } from "./SpeciesCombobox";
import { Combobox } from "./Combobox";
import { ModifierToggle } from "./ModifierToggle";
import { bossTeamFor } from "../lib/bossTarget";
import { nextRequiredIndex } from "../lib/routeChoice";
import { bossMatchesStarter, rivalStarterFor } from "../lib/starters";
import { nextLevelCap } from "../lib/levelCap";
import {
  ABILITY_NAMES,
  BOOST_STATS,
  ITEM_NAMES,
  MOVE_NAMES,
  NATURES,
  NATURE_EFFECTS,
  natureLabel,
  autoField,
  buildPlayerPokemon,
  calcBaseStats,
  calcMoves,
  computedStats,
  defaultBossLevel,
  effectiveSpeed,
  fieldFromBattleEffect,
  resolveSpecies,
  statTotals,
  STATUSES,
  terrainFromAbility,
  toEngineSide,
  weatherFromAbility,
  type MatchupLine,
  type PlayerMonConfig,
  type SideConditions,
} from "../lib/damagecalc";

// Harsh Sunshine/Heavy Rain/Strong Winds: same unblockable/type-nullifying
// effects as Desolate Land/Primordial Sea/Delta Stream — some hardcore-mode
// boss fights have one as a permanent field effect with no ability attached
// (fieldFromBattleEffect auto-detects these from the boss's battle-effect
// text), so they need to be manually selectable too, not just ability-only
const WEATHERS = [
  "Sun",
  "Rain",
  "Sand",
  "Hail",
  "Snow",
  "Harsh Sunshine",
  "Heavy Rain",
  "Strong Winds",
];
const TERRAINS = ["Electric", "Grassy", "Psychic", "Misty"];

const YOU_CFG_KEY = "rr-tracker.calcMon";
const CAUGHT_ONLY_KEY = "rr-tracker.calcCaughtOnly";

const DEFAULT_CFG: PlayerMonConfig = {
  species: "",
  level: 50,
  nature: "Serious",
  ability: "",
  item: "",
  evs: { HP: 0, ATK: 0, DEF: 0, SPA: 0, SPD: 0, SPE: 0 },
  ivs: { HP: 31, ATK: 31, DEF: 31, SPA: 31, SPD: 31, SPE: 31 },
  boosts: { ATK: 0, DEF: 0, SPA: 0, SPD: 0, SPE: 0 },
  status: "",
  moves: ["", "", "", ""],
};

/** HP-bar fill color class for a remaining/current HP percent — shared by
 * the result rows' remaining-HP bar and the Current HP indicator so both
 * read the same way (green/yellow/red at the same thresholds) */
function hpTone(pct: number): string {
  return pct < 25 ? " low" : pct < 55 ? " mid" : "";
}

/** pairs each non-empty move with its slot's pinned hit count (if any),
 * preserving index alignment with moveHits before the empty slots are
 * dropped */
function movesWithHits(
  cfg: PlayerMonConfig,
): { name: string; hits?: number; slotIndex: number }[] {
  return cfg.moves
    .map((name, i) => ({ name, hits: cfg.moveHits?.[i], slotIndex: i }))
    .filter((m) => m.name.trim());
}

function loadYouCfg(levelCap?: number): PlayerMonConfig {
  let cfg = DEFAULT_CFG;
  try {
    const raw = localStorage.getItem(YOU_CFG_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      cfg = {
        ...DEFAULT_CFG,
        ...saved,
        ivs: { ...DEFAULT_CFG.ivs, ...saved.ivs },
        boosts: { ...DEFAULT_CFG.boosts, ...saved.boosts },
      };
    }
  } catch {
    // fall through to defaults
  }
  // you're normally playing at the level cap
  if (levelCap) cfg = { ...cfg, level: levelCap };
  return cfg;
}

/** the Opponent card's config, built fresh from a boss Pokémon — this is
 * never persisted, so picking a different boss always starts clean and free
 * to edit (species, moves, item, anything) without a stale prior matchup
 * bleeding through */
function cfgFromBossMon(mon: BossMon, levelCap?: number): PlayerMonConfig {
  const evs: Record<string, number> = {};
  for (const [k, v] of Object.entries(mon.evs)) {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n)) evs[k] = n;
  }
  return {
    ...DEFAULT_CFG,
    species: mon.species,
    level: defaultBossLevel(mon.level, levelCap),
    nature: mon.nature || "Serious",
    ability: mon.ability,
    item: mon.item,
    evs: { ...DEFAULT_CFG.evs, ...evs },
    moves: [...mon.moves.map((m) => (m === "-" ? "" : m)), "", "", "", ""].slice(0, 4),
  };
}

/** which teammate is loaded as Opponent, remembered across tab switches —
 * `sourceNonce` ties it to a specific explicit Calc-button click (`null`
 * means it came from auto-loading the run's next boss instead), so a
 * revisit can tell "same boss, restore my pick" from "different boss,
 * start fresh" */
interface StoredOppSelection {
  sourceNonce: number | null;
  teamLabel: string;
  team: BossMon[];
  teamIdx: number;
  levelCap?: number;
}

const oppSelectionKey = (runId: string) => `rr-tracker.calcOppSelection.${runId}`;

function loadOppSelection(runId: string): StoredOppSelection | null {
  try {
    const raw = localStorage.getItem(oppSelectionKey(runId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveOppSelection(runId: string, sel: StoredOppSelection) {
  localStorage.setItem(oppSelectionKey(runId), JSON.stringify(sel));
}

/** this run's next required boss, the same resolution the Calc-button
 * deep link and Battle Readiness's auto-select already use */
function resolveNextBoss(modeData: BossMode, run: Run): { boss: Boss; mon: BossMon } | null {
  const idx = nextRequiredIndex(modeData.trainerOrder, run);
  if (idx < 0) return null;
  const bt = bossTeamFor(modeData, idx);
  if (!bt) return null;
  const cat = modeData.categories.find((c) => c.name === bt.category);
  const rivalStarter = rivalStarterFor(run);
  const boss = cat?.bosses.find(
    (b) => b.title === bt.title && bossMatchesStarter(b.subtitle, rivalStarter),
  );
  const mon = boss?.pokemon[0];
  return boss && mon ? { boss, mon } : null;
}

export function CalculatorPage({
  run,
  modeData,
  caught = [],
  noEvs = false,
  anyAbility = false,
  target,
  onClearTarget,
}: {
  run: Run;
  modeData: BossMode;
  caught?: CaughtMon[];
  /** hardcore/restricted mode or a Minimal Grind start — EVs don't apply to
   * "Your Pokémon" (the Opponent side always allows full EVs) */
  noEvs?: boolean;
  /** ability randomizer active: accept any ability for "Your Pokémon" too */
  anyAbility?: boolean;
  /** a boss Pokémon's Calc button was clicked elsewhere: prefill Opponent */
  target?: (CalcTarget & { nonce: number }) | null;
  /** tells the parent to forget `target` when the Opponent is cleared, so a
   * revisit auto-loads the next boss instead of re-applying the old one */
  onClearTarget?: () => void;
}) {
  const levelCap = nextLevelCap(modeData, run) ?? 50;
  const [you, setYou] = useState<PlayerMonConfig>(() => loadYouCfg(levelCap));
  const [opp, setOpp] = useState<PlayerMonConfig>(() =>
    target ? cfgFromBossMon(target.mon, target.levelCap) : DEFAULT_CFG,
  );
  const [weather, setWeather] = useState(
    () => (target ? fieldFromBattleEffect(target.battleEffect).weather : undefined) ?? "",
  );
  const [terrain, setTerrain] = useState(
    () => (target ? fieldFromBattleEffect(target.battleEffect).terrain : undefined) ?? "",
  );
  const [doubles, setDoubles] = useState(() =>
    target ? /DOUBLES/i.test(target.battleEffect) : false,
  );
  const [trickRoom, setTrickRoom] = useState(() =>
    target ? /TRICK ROOM/i.test(target.battleEffect) : false,
  );
  const [caughtOnly, setCaughtOnly] = useState(
    () => localStorage.getItem(CAUGHT_ONLY_KEY) === "1",
  );
  const [importedFrom, setImportedFrom] = useState("");
  const [showYouSpreads, setShowYouSpreads] = useState(false);
  const [showOppSpreads, setShowOppSpreads] = useState(false);
  const [crit, setCrit] = useState(false);
  // hazards/screens/Leech Seed/Tailwind, tracked per side since they only
  // ever apply to whichever Pokémon is standing on that side of the field
  const [yourSide, setYourSide] = useState<SideConditions>({});
  const [oppSide, setOppSide] = useState<SideConditions>({});
  const [showField, setShowField] = useState(false);
  // the Opponent's full boss team + which member is loaded, so the "vs"
  // dropdown can switch teammates without leaving the page
  const [oppTeam, setOppTeam] = useState<BossMon[]>(() => target?.team ?? []);
  const [oppTeamLabel, setOppTeamLabel] = useState(() => target?.teamLabel ?? "");
  const [oppTeamIdx, setOppTeamIdx] = useState(0);
  const [oppLevelCap, setOppLevelCap] = useState(() => target?.levelCap);

  const applyOpponent = (
    mon: BossMon,
    monLevelCap: number | undefined,
    battleEffect: string,
    team: BossMon[],
    teamLabel: string,
    idx: number,
  ) => {
    setOpp(cfgFromBossMon(mon, monLevelCap));
    const field = fieldFromBattleEffect(battleEffect);
    setWeather(field.weather ?? "");
    setTerrain(field.terrain ?? "");
    setDoubles(/DOUBLES/i.test(battleEffect));
    setTrickRoom(/TRICK ROOM/i.test(battleEffect));
    setOppSide({});
    setOppTeam(team);
    setOppTeamLabel(teamLabel);
    setOppTeamIdx(idx);
    setOppLevelCap(monLevelCap);
  };

  // resolve the Opponent exactly once per mount: restore a remembered
  // teammate pick if we're looking at the same boss as last visit (either
  // the same explicit Calc-button target, or the same auto-loaded next
  // boss), otherwise apply fresh — a new explicit click or genuine
  // progress (a different boss is now "next") always wins over any stale
  // pick, same as before
  const resolvedOnMount = useRef(false);
  useEffect(() => {
    if (resolvedOnMount.current) return;
    resolvedOnMount.current = true;
    const stored = loadOppSelection(run.id);

    if (target) {
      if (stored && stored.sourceNonce === target.nonce && stored.team.length > 0) {
        const mon = stored.team[stored.teamIdx] ?? target.mon;
        applyOpponent(mon, stored.levelCap, target.battleEffect, stored.team, stored.teamLabel, stored.teamIdx);
      } else {
        const idx = Math.max(0, target.team.indexOf(target.mon));
        applyOpponent(target.mon, target.levelCap, target.battleEffect, target.team, target.teamLabel, idx);
        saveOppSelection(run.id, {
          sourceNonce: target.nonce,
          teamLabel: target.teamLabel,
          team: target.team,
          teamIdx: idx,
          levelCap: target.levelCap,
        });
      }
      return;
    }

    // no explicit target — default to this run's next required boss,
    // restoring a remembered pick if that's still the same boss
    const next = resolveNextBoss(modeData, run);
    if (!next) return;
    const teamLabel =
      next.boss.title + (next.boss.subtitle ? ` — ${next.boss.subtitle}` : "");
    if (stored && stored.sourceNonce === null && stored.teamLabel === teamLabel && stored.team.length > 0) {
      const mon = stored.team[stored.teamIdx] ?? next.mon;
      applyOpponent(mon, stored.levelCap, next.boss.battleEffect, stored.team, teamLabel, stored.teamIdx);
    } else {
      applyOpponent(next.mon, levelCap, next.boss.battleEffect, next.boss.pokemon, teamLabel, 0);
      saveOppSelection(run.id, {
        sourceNonce: null,
        teamLabel,
        team: next.boss.pokemon,
        teamIdx: 0,
        levelCap,
      });
    }
    // deliberately once-per-mount: `target` doesn't change while this page
    // stays mounted (it's only ever set by navigating here fresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchOppTeammate = (idx: number) => {
    const mon = oppTeam[idx];
    if (!mon) return;
    setOpp(cfgFromBossMon(mon, oppLevelCap));
    setOppTeamIdx(idx);
    saveOppSelection(run.id, {
      sourceNonce: target?.nonce ?? null,
      teamLabel: oppTeamLabel,
      team: oppTeam,
      teamIdx: idx,
      levelCap: oppLevelCap,
    });
  };

  const updateYou = (patch: Partial<PlayerMonConfig>) => {
    setYou((c) => {
      const next = { ...c, ...patch };
      if (patch.species !== undefined) {
        // pull in the build configured on the Team tab for this Pokémon
        const owned = caught.find(
          (m) => m.species.toLowerCase() === next.species.toLowerCase().trim(),
        );
        if (owned?.build) {
          const b = owned.build;
          next.nature = b.nature || next.nature;
          next.ability = b.ability || next.ability;
          next.item = b.item;
          next.evs = { ...DEFAULT_CFG.evs, ...b.evs };
          next.moves = [...b.moves, "", "", "", ""].slice(0, 4);
          setImportedFrom(owned.nickname || owned.species);
        } else {
          setImportedFrom("");
        }
        // keep the ability legal for the chosen species (unless randomized)
        if (!anyAbility) {
          const legal = abilitiesFor(next.species);
          if (legal.length > 0 && !legal.includes(next.ability)) {
            next.ability = legal[0];
          }
        }
        // stage boosts/status/pinned hits/current HP describe a specific
        // in-progress matchup, not the Pokémon's build — a new species
        // shouldn't inherit the last one's +2 Attack or burn (reported by
        // a playtester: switching species kept the previous mon's boosts)
        next.boosts = {};
        next.status = "";
        next.moveHits = undefined;
        next.currentHpPercent = undefined;
      }
      localStorage.setItem(YOU_CFG_KEY, JSON.stringify(next));
      return next;
    });
  };

  const updateOpp = (patch: Partial<PlayerMonConfig>) => {
    setOpp((c) => {
      const next = { ...c, ...patch };
      if (patch.species !== undefined) {
        // default to the new species' first known ability so a species
        // change doesn't leave the previous mon's ability stuck (e.g. a
        // weather-setter's auto field never engaging) — anyAbility keeps
        // this a free-text field, so it's still fully overridable after
        const legal = abilitiesFor(next.species);
        if (legal.length > 0 && !legal.includes(next.ability)) {
          next.ability = legal[0];
        }
        // see updateYou — a new species shouldn't inherit the last one's
        // in-battle state
        next.boosts = {};
        next.status = "";
        next.moveHits = undefined;
        next.currentHpPercent = undefined;
      }
      return next;
    });
  };

  const resetYou = () => {
    localStorage.removeItem(YOU_CFG_KEY);
    setImportedFrom("");
    setYou(loadYouCfg(levelCap));
  };

  const resetOpp = () => {
    setOpp(DEFAULT_CFG);
    setOppSide({});
    setOppTeam([]);
    setOppTeamLabel("");
    setOppTeamIdx(0);
    localStorage.removeItem(oppSelectionKey(run.id));
    // forget the explicit target too, so a revisit auto-loads the next
    // boss instead of re-applying the one this page was opened with
    onClearTarget?.();
  };

  const toggleCaughtOnly = (on: boolean) => {
    setCaughtOnly(on);
    localStorage.setItem(CAUGHT_ONLY_KEY, on ? "1" : "0");
  };

  const caughtSpecies = useMemo(
    () => [...new Set(caught.map((m) => m.species))].sort(),
    [caught],
  );
  const youSpeciesOptions = caughtOnly && caught.length > 0 ? caughtSpecies : ALL_SPECIES;

  // ignore any saved EV spread when EVs don't apply, without clearing cfg
  const calcYou = useMemo(() => (noEvs ? { ...you, evs: {} } : you), [you, noEvs]);

  const fieldOpts = useMemo(
    () => ({
      weather: weather || undefined,
      terrain: terrain || undefined,
      gameType: doubles ? "Doubles" : "Singles",
    }),
    [weather, terrain, doubles],
  );
  // weather/terrain summoned by either side's switch-in ability (Drought,
  // Orichalcum Pulse, …) applies unless the selects above override it
  const resolvedField = useMemo(
    () => autoField(fieldOpts, [calcYou.ability, opp.ability]),
    [fieldOpts, calcYou.ability, opp.ability],
  );
  // labels for the Weather/Terrain selects' blank option, so a switch-in
  // ability's auto-detected field is visible in the control itself
  // instead of only in the "Auto: …" caption underneath — same pattern as
  // the multi-hit picker's auto-detected blank-option label
  const autoWeatherLabel =
    !weather && resolvedField.weather
      ? `${resolvedField.weather} (${weatherFromAbility(calcYou.ability) ? calcYou.ability : opp.ability})`
      : undefined;
  const autoTerrainLabel =
    !terrain && resolvedField.terrain
      ? `${resolvedField.terrain} Terrain (${terrainFromAbility(calcYou.ability) ? calcYou.ability : opp.ability})`
      : undefined;

  // each direction needs its own attacker/defender side pairing — screens
  // and Sturdy/Multiscale-relevant hazards only ever apply to the defender
  const incomingField = useMemo(
    () => ({
      ...resolvedField,
      attackerSide: toEngineSide(oppSide),
      defenderSide: toEngineSide(yourSide),
    }),
    [resolvedField, oppSide, yourSide],
  );
  const outgoingField = useMemo(
    () => ({
      ...resolvedField,
      attackerSide: toEngineSide(yourSide),
      defenderSide: toEngineSide(oppSide),
    }),
    [resolvedField, yourSide, oppSide],
  );

  const results = useMemo(() => {
    const oppPoke = opp.species ? buildPlayerPokemon(opp) : null;
    const youPoke = calcYou.species ? buildPlayerPokemon(calcYou) : null;
    if (!oppPoke || !youPoke) return null;
    const incoming = calcMoves(
      oppPoke,
      youPoke,
      movesWithHits(opp),
      incomingField,
      crit,
    );
    const outgoing = calcMoves(
      youPoke,
      oppPoke,
      movesWithHits(calcYou),
      outgoingField,
      crit,
    );
    return {
      incoming,
      outgoing,
      oppSpeed: effectiveSpeed(oppPoke, resolvedField, oppSide),
      youSpeed: effectiveSpeed(youPoke, resolvedField, yourSide),
    };
  }, [opp, calcYou, incomingField, outgoingField, resolvedField, oppSide, yourSide, crit]);

  return (
    <div className="calculator-page">
      {results && (
        <SpeedBanner
          opponentName={opp.species || "the opponent"}
          opponentSpeed={results.oppSpeed}
          yourSpeed={results.youSpeed}
          trickRoom={trickRoom}
        />
      )}

      <div className="calc-page-grid">
        <div className="col-you-card">
          <MonConfigCard
            title="Your Pokémon"
            cfg={you}
            calcCfg={calcYou}
            update={updateYou}
            onClear={resetYou}
            fieldOpts={resolvedField}
            side={yourSide}
            showSpreads={showYouSpreads}
            setShowSpreads={setShowYouSpreads}
            noEvs={noEvs}
            anyAbility={anyAbility}
            speciesOptions={youSpeciesOptions}
            importedFrom={importedFrom}
            headExtra={
              caught.length > 0 ? (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={caughtOnly}
                    onChange={(e) => toggleCaughtOnly(e.target.checked)}
                  />
                  Caught only
                </label>
              ) : null
            }
          />
        </div>

        <div className="col-field-card">
          <FieldConditionsPanel
            weather={weather}
            setWeather={setWeather}
            autoWeatherLabel={autoWeatherLabel}
            terrain={terrain}
            setTerrain={setTerrain}
            autoTerrainLabel={autoTerrainLabel}
            crit={crit}
            setCrit={setCrit}
            doubles={doubles}
            setDoubles={setDoubles}
            trickRoom={trickRoom}
            setTrickRoom={setTrickRoom}
            show={showField}
            setShow={setShowField}
            yourSide={yourSide}
            setYourSide={setYourSide}
            oppSide={oppSide}
            setOppSide={setOppSide}
          />
        </div>

        <div className="col-opp-card">
          <MonConfigCard
            title="Opponent"
            cfg={opp}
            calcCfg={opp}
            update={updateOpp}
            onClear={resetOpp}
            fieldOpts={resolvedField}
            side={oppSide}
            showSpreads={showOppSpreads}
            setShowSpreads={setShowOppSpreads}
            noEvs={false}
            anyAbility
            speciesOptions={ALL_SPECIES}
            headExtra={
              oppTeam.length > 1 ? (
                <select
                  className="opp-team-switch"
                  title={oppTeamLabel}
                  value={oppTeamIdx}
                  onChange={(e) => switchOppTeammate(parseInt(e.target.value, 10))}
                >
                  {oppTeam.map((m, i) => (
                    <option key={i} value={i}>
                      {m.species}
                    </option>
                  ))}
                </select>
              ) : null
            }
          />
        </div>

        {results && (
          <div className="col-res-you">
            <ResultBlock
              title={`Your moves vs them${doubles ? " · doubles" : ""}${crit ? " · crit" : ""}`}
              lines={results.outgoing}
              tone="outgoing"
              targetHpPercent={opp.currentHpPercent ?? 100}
              onSetHits={(i, hits) => {
                const moveHits = [...(you.moveHits ?? [])];
                moveHits[i] = hits;
                updateYou({ moveHits });
              }}
            />
          </div>
        )}
        {results && (
          <div className="col-res-opp">
            <ResultBlock
              title={`${opp.species || "Opponent"}'s moves vs you${doubles ? " · doubles" : ""}${crit ? " · crit" : ""}`}
              lines={results.incoming}
              tone="incoming"
              targetHpPercent={you.currentHpPercent ?? 100}
              onSetHits={(i, hits) => {
                const moveHits = [...(opp.moveHits ?? [])];
                moveHits[i] = hits;
                updateOpp({ moveHits });
              }}
            />
          </div>
        )}
      </div>
      {!results && <p className="muted">Enter both Pokémon's species to calculate.</p>}

      <datalist id="all-items-calc">
        {ITEM_NAMES.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
    </div>
  );
}

/** one side's full editable set: species/level/nature/ability/item/status,
 * base stats, totals grid with stage boosts, a combined IV+EV editor, and 4
 * move slots. Shared by "Your Pokémon" and "Opponent" — the only real
 * difference between the two is which flags/lists get passed in. */
function MonConfigCard({
  title,
  cfg,
  calcCfg,
  update,
  onClear,
  fieldOpts,
  side,
  showSpreads,
  setShowSpreads,
  noEvs,
  anyAbility,
  speciesOptions,
  importedFrom,
  headExtra,
}: {
  title: string;
  cfg: PlayerMonConfig;
  /** cfg with EVs stripped when noEvs applies, for the calc/totals to use */
  calcCfg: PlayerMonConfig;
  update: (patch: Partial<PlayerMonConfig>) => void;
  onClear: () => void;
  fieldOpts: Parameters<typeof statTotals>[1];
  side?: SideConditions;
  showSpreads: boolean;
  setShowSpreads: (fn: (s: boolean) => boolean) => void;
  noEvs: boolean;
  anyAbility: boolean;
  speciesOptions: string[];
  importedFrom?: string;
  headExtra?: React.ReactNode;
}) {
  const abilities = abilitiesFor(cfg.species);
  const baseStats = cfg.species ? calcBaseStats(cfg.species) : null;
  const speciesInvalid = !!cfg.species && resolveSpecies(cfg.species) === null;
  return (
    <div className="calc-side">
      <div className="calc-side-head">
        <h3>{title}</h3>
        {headExtra}
        <button className="st-btn clear" onClick={onClear}>
          Clear
        </button>
      </div>
      {importedFrom && (
        <div className="muted import-note">
          Imported build from <strong>{importedFrom}</strong> (Team tab)
        </div>
      )}
      <div className="calc-row">
        <SpeciesCombobox
          placeholder="Species"
          value={cfg.species}
          options={speciesOptions}
          invalid={speciesInvalid}
          onChange={(v) => update({ species: v })}
        />
        <input
          type="number"
          title="Level"
          min={1}
          max={100}
          value={cfg.level}
          onChange={(e) => update({ level: parseInt(e.target.value, 10) || 1 })}
        />
        <select value={cfg.nature} onChange={(e) => update({ nature: e.target.value })}>
          {NATURES.map((n) => (
            <option key={n} value={n}>
              {natureLabel(n)}
            </option>
          ))}
        </select>
      </div>
      <div className="calc-row">
        {abilities.length > 0 && !anyAbility ? (
          <select
            title="Ability"
            value={cfg.ability}
            onChange={(e) => update({ ability: e.target.value })}
          >
            {abilities.map((a, i) => (
              <option key={a} value={a}>
                {a}
                {i === abilities.length - 1 && abilities.length > 1 ? " (hidden)" : ""}
              </option>
            ))}
          </select>
        ) : (
          <Combobox
            placeholder="Ability"
            options={ABILITY_NAMES}
            value={cfg.ability}
            onChange={(ability) => update({ ability })}
          />
        )}
        <input
          placeholder="Item"
          list="all-items-calc"
          value={cfg.item}
          onChange={(e) => update({ item: e.target.value })}
        />
        <select
          title="Status condition"
          value={cfg.status ?? ""}
          onChange={(e) => update({ status: e.target.value })}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {baseStats && (
        <div className="muted base-stats-line">
          Base:{" "}
          {Object.entries(baseStats)
            .map(([k, v]) => `${k} ${v}`)
            .join(" · ")}
        </div>
      )}
      <NatureLine cfg={cfg} />
      <ModifierLine cfg={calcCfg} fieldOpts={fieldOpts} />
      <TotalsWithBoosts cfg={calcCfg} fieldOpts={fieldOpts} side={side} update={update} />
      <CurrentHpRow cfg={calcCfg} fieldOpts={fieldOpts} side={side} update={update} />
      <div className="calc-row spread-row">
        <button
          className="st-btn spread-toggle"
          onClick={() => setShowSpreads((s) => !s)}
        >
          {showSpreads ? "▾" : "▸"} {noEvs ? "IVs" : "IVs / EVs"}
        </button>
        {!showSpreads && (
          <span className="muted spread-summary">
            <SpreadSummary cfg={cfg} noEvs={noEvs} />
          </span>
        )}
      </div>
      {showSpreads && (
        <div className="calc-row evs">
          {Object.keys(cfg.ivs ?? {}).map((k) => (
            <label key={k}>
              {k} IV
              <input
                type="number"
                min={0}
                max={31}
                value={cfg.ivs?.[k] ?? 31}
                onChange={(e) =>
                  update({
                    ivs: {
                      ...(cfg.ivs ?? {}),
                      [k]: Math.max(0, Math.min(31, parseInt(e.target.value, 10) || 0)),
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      )}
      {showSpreads && !noEvs && (
        <div className="calc-row evs">
          {Object.keys(cfg.evs).map((k) => (
            <label key={k}>
              {k} EV
              <input
                type="number"
                min={0}
                max={252}
                step={4}
                value={cfg.evs[k]}
                onChange={(e) =>
                  update({
                    evs: {
                      ...cfg.evs,
                      [k]: Math.max(0, Math.min(252, parseInt(e.target.value, 10) || 0)),
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      )}
      <div className="calc-row">
        {cfg.moves.map((m, i) => (
          <Combobox
            key={i}
            className="calc-move"
            placeholder={`Move ${i + 1}`}
            options={MOVE_NAMES}
            value={m}
            onChange={(v) => {
              const moves = [...cfg.moves];
              moves[i] = v;
              update({ moves });
            }}
          />
        ))}
      </div>
      {cfg.species && resolveSpecies(cfg.species) === null && (
        <p className="save-error">Unknown species “{cfg.species}”.</p>
      )}
    </div>
  );
}

const SIDE_PILLS: { key: keyof SideConditions; label: string; title: string }[] = [
  { key: "stealthRock", label: "Stealth Rock", title: "Stealth Rock is set on this side" },
  {
    key: "reflect",
    label: "Reflect",
    title: "Reflect is up on this side — halves incoming physical damage",
  },
  {
    key: "lightScreen",
    label: "Light Screen",
    title: "Light Screen is up on this side — halves incoming special damage",
  },
  {
    key: "auroraVeil",
    label: "Aurora Veil",
    title: "Aurora Veil is up on this side — halves incoming physical & special damage",
  },
  { key: "tailwind", label: "Tailwind", title: "Tailwind doubles this side's Speed" },
  { key: "leechSeed", label: "Leech Seed", title: "This side is seeded" },
];

function sideSummary(s: SideConditions): string {
  const parts: string[] = [];
  if (s.stealthRock) parts.push("SR");
  if (s.spikes) parts.push(`${s.spikes} Spikes`);
  for (const { key, label } of SIDE_PILLS) {
    if (key !== "stealthRock" && s[key]) parts.push(label);
  }
  return parts.join(", ");
}

/** hazards/screens/Leech Seed/Tailwind, split "Your side" / "Opponent's
 * side" — only Tailwind changes a stat total (Speed); the rest only affect
 * move damage inside the engine, so they don't touch the totals grids */
function FieldConditionsPanel({
  weather,
  setWeather,
  autoWeatherLabel,
  terrain,
  setTerrain,
  autoTerrainLabel,
  crit,
  setCrit,
  doubles,
  setDoubles,
  trickRoom,
  setTrickRoom,
  show,
  setShow,
  yourSide,
  setYourSide,
  oppSide,
  setOppSide,
}: {
  weather: string;
  setWeather: (w: string) => void;
  /** the switch-in-ability-detected weather's display label ("Sun
   * (Drought)"), shown in place of "None" so the auto-fill is visible in
   * the select itself — undefined when nothing's auto-detected or the
   * user has already picked one explicitly */
  autoWeatherLabel?: string;
  terrain: string;
  setTerrain: (t: string) => void;
  autoTerrainLabel?: string;
  crit: boolean;
  setCrit: (fn: (c: boolean) => boolean) => void;
  doubles: boolean;
  setDoubles: (fn: (d: boolean) => boolean) => void;
  trickRoom: boolean;
  setTrickRoom: (fn: (t: boolean) => boolean) => void;
  show: boolean;
  setShow: (fn: (s: boolean) => boolean) => void;
  yourSide: SideConditions;
  setYourSide: (fn: (s: SideConditions) => SideConditions) => void;
  oppSide: SideConditions;
  setOppSide: (fn: (s: SideConditions) => SideConditions) => void;
}) {
  const yourSummary = sideSummary(yourSide);
  const oppSummary = sideSummary(oppSide);
  return (
    <div className="calc-side field-conditions">
      <h3>Field</h3>
      <div className="field-quick-row">
        <label className="field-select">
          Weather
          <select
            className={autoWeatherLabel ? "auto-detected" : undefined}
            value={weather}
            onChange={(e) => setWeather(e.target.value)}
          >
            <option value="">{autoWeatherLabel ?? "None"}</option>
            {WEATHERS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="field-select">
          Terrain
          <select
            className={autoTerrainLabel ? "auto-detected" : undefined}
            value={terrain}
            onChange={(e) => setTerrain(e.target.value)}
          >
            <option value="">{autoTerrainLabel ?? "None"}</option>
            {TERRAINS.map((t) => (
              <option key={t} value={t}>
                {t}
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
        <ModifierToggle
          active={trickRoom}
          title="Trick Room is active — lower Speed moves first instead of higher"
          onClick={() => setTrickRoom((t) => !t)}
        >
          Trick Room
        </ModifierToggle>
      </div>
      <div className="calc-row spread-row">
        <button className="st-btn spread-toggle" onClick={() => setShow((s) => !s)}>
          {show ? "▾" : "▸"} Hazards &amp; screens
        </button>
        {!show && (
          <span className="muted spread-summary">
            {yourSummary || oppSummary
              ? [yourSummary && `you: ${yourSummary}`, oppSummary && `opponent: ${oppSummary}`]
                  .filter(Boolean)
                  .join(" · ")
              : "none set"}
          </span>
        )}
      </div>
      {show && (
        <>
          <SideEditor label="Your side" side={yourSide} setSide={setYourSide} />
          <SideEditor label="Opponent's side" side={oppSide} setSide={setOppSide} />
        </>
      )}
    </div>
  );
}

function SideEditor({
  label,
  side,
  setSide,
}: {
  label: string;
  side: SideConditions;
  setSide: (fn: (s: SideConditions) => SideConditions) => void;
}) {
  return (
    <div className="side-editor">
      <span className="side-editor-label muted">{label}</span>
      <span className="side-editor-pills">
        {SIDE_PILLS.map(({ key, label: pillLabel, title }) => (
          <ModifierToggle
            key={key}
            active={!!side[key]}
            title={title}
            onClick={() => setSide((s) => ({ ...s, [key]: !s[key] }))}
          >
            {pillLabel}
          </ModifierToggle>
        ))}
        <label className="side-spikes" title="Spikes layers on this side">
          Spikes
          <select
            value={side.spikes ?? 0}
            onChange={(e) =>
              setSide((s) => ({ ...s, spikes: parseInt(e.target.value, 10) }))
            }
          >
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </span>
    </div>
  );
}

function SpreadSummary({
  cfg,
  noEvs,
}: {
  cfg: PlayerMonConfig;
  noEvs: boolean;
}) {
  const ivs = Object.entries(cfg.ivs ?? {})
    .filter(([, v]) => v !== 31)
    .map(([k, v]) => `${v} ${k}`);
  const evs = noEvs
    ? []
    : Object.entries(cfg.evs)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${v} ${k}`);
  const parts: string[] = [];
  if (ivs.length > 0) parts.push(`IV ${ivs.join(", ")}`);
  if (evs.length > 0) parts.push(`EV ${evs.join(", ")}`);
  return <>{parts.length > 0 ? parts.join(" · ") : "default spread"}</>;
}

function NatureLine({ cfg }: { cfg: PlayerMonConfig }) {
  const effect = NATURE_EFFECTS[cfg.nature];
  if (!cfg.species || resolveSpecies(cfg.species) === null) return null;
  if (!effect) {
    return (
      <div className="muted nature-line">
        {cfg.nature}: neutral nature — no stat changes
      </div>
    );
  }
  const withNature = computedStats(cfg);
  const neutral = computedStats({ ...cfg, nature: "Serious" });
  if (!withNature || !neutral) return null;
  return (
    <div className="nature-line">
      {cfg.nature}:{" "}
      <span className="nature-plus">
        +{effect.plus} ({neutral[effect.plus]} → {withNature[effect.plus]})
      </span>{" "}
      <span className="nature-minus">
        −{effect.minus} ({neutral[effect.minus]} → {withNature[effect.minus]})
      </span>
    </div>
  );
}

function ModifierLine({
  cfg,
  fieldOpts,
}: {
  cfg: PlayerMonConfig;
  fieldOpts: Parameters<typeof statTotals>[1];
}) {
  if (!cfg.species || resolveSpecies(cfg.species) === null) return null;
  const t = statTotals(cfg, fieldOpts);
  if (!t) return null;
  const parts: string[] = [];
  const fmt = (mods: Partial<Record<string, number>>, source: string) => {
    const entries = Object.entries(mods);
    if (entries.length > 0) {
      parts.push(
        `${source}: ${entries.map(([k, v]) => `${k} ×${v}`).join(", ")}`,
      );
    }
  };
  if (cfg.item) fmt(t.itemMods, cfg.item);
  if (cfg.ability) fmt(t.abilityMods, cfg.ability);
  return (
    <div className="modifier-line">
      {parts.length > 0 ? (
        <span className="nature-plus">{parts.join(" · ")}</span>
      ) : (
        <span className="muted">Item/ability: no stat modifiers</span>
      )}
    </div>
  );
}

function TotalsWithBoosts({
  cfg,
  fieldOpts,
  side,
  update,
}: {
  cfg: PlayerMonConfig;
  fieldOpts: Parameters<typeof statTotals>[1];
  side?: SideConditions;
  update: (patch: Partial<PlayerMonConfig>) => void;
}) {
  if (!cfg.species || resolveSpecies(cfg.species) === null) return null;
  const t = statTotals(cfg, fieldOpts, side);
  if (!t) return null;
  return (
    <div className="totals-grid">
      <div className="totals-cell">
        <span className="k">HP</span>
        <span className="total-val">{t.totals.HP}</span>
      </div>
      {BOOST_STATS.map((k) => {
        const boost = cfg.boosts?.[k] ?? 0;
        return (
          <div key={k} className="totals-cell">
            <span className="k">{k}</span>
            <span className={"total-val" + (boost > 0 ? " nature-plus" : boost < 0 ? " nature-minus" : "")}>
              {t.totals[k]}
            </span>
            <select
              title={`${k} stage`}
              value={boost}
              onChange={(e) =>
                update({
                  boosts: { ...(cfg.boosts ?? {}), [k]: parseInt(e.target.value, 10) },
                })
              }
            >
              {Array.from({ length: 13 }, (_, i) => 6 - i).map((n) => (
                <option key={n} value={n}>
                  {n > 0 ? `+${n}` : n}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

/** lets a matchup be checked from less than full HP (a mon that's already
 * taken a hit this turn, entry hazard chip damage, …) instead of only ever
 * from 100% — feeds ResultRow's KO/remaining-HP math via
 * PlayerMonConfig.currentHpPercent. Percent and points stay in sync off
 * this mon's own computed max HP; editing either updates the same field. */
function CurrentHpRow({
  cfg,
  fieldOpts,
  side,
  update,
}: {
  cfg: PlayerMonConfig;
  fieldOpts: Parameters<typeof statTotals>[1];
  side?: SideConditions;
  update: (patch: Partial<PlayerMonConfig>) => void;
}) {
  if (!cfg.species || resolveSpecies(cfg.species) === null) return null;
  const t = statTotals(cfg, fieldOpts, side);
  if (!t) return null;
  const maxHp = t.totals.HP;
  const percent = cfg.currentHpPercent ?? 100;
  const points = Math.round((percent / 100) * maxHp);
  const setPercent = (pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    update({ currentHpPercent: clamped === 100 ? undefined : clamped });
  };
  const setPoints = (pts: number) => {
    const clamped = Math.max(0, Math.min(maxHp, pts));
    setPercent(maxHp > 0 ? Math.round((clamped / maxHp) * 100) : 100);
  };
  return (
    <div className="calc-row current-hp-row">
      <span className="current-hp-label">Current HP</span>
      <span className="hp-bar current-hp-bar">
        <span className={"hp-sure" + hpTone(percent)} style={{ width: `${percent}%` }} />
      </span>
      <input
        type="number"
        min={0}
        max={100}
        title="Current HP, as a percent of max"
        value={percent}
        onChange={(e) => setPercent(parseInt(e.target.value, 10) || 0)}
      />
      <span className="current-hp-unit">%</span>
      <input
        type="number"
        min={0}
        max={maxHp}
        title="Current HP, in points"
        value={points}
        onChange={(e) => setPoints(parseInt(e.target.value, 10) || 0)}
      />
      <span className="current-hp-unit">/ {maxHp} HP</span>
      {percent !== 100 && (
        <button
          className="st-btn current-hp-reset"
          title="Reset to full HP"
          onClick={() => update({ currentHpPercent: undefined })}
        >
          Full
        </button>
      )}
    </div>
  );
}

/** who moves first, surfaced above the damage rows instead of left for the
 * reader to derive by comparing two numbers — a favorable damage % is
 * meaningless if the opponent outspeeds and KOs first */
function SpeedBanner({
  opponentName,
  opponentSpeed,
  yourSpeed,
  trickRoom,
}: {
  opponentName: string;
  opponentSpeed: number;
  yourSpeed: number;
  trickRoom?: boolean;
}) {
  // Trick Room reverses move order (lower Speed acts first) — it doesn't
  // change anyone's Speed stat, just who that comparison favors
  const youFirst = trickRoom ? yourSpeed < opponentSpeed : yourSpeed > opponentSpeed;
  const tone = yourSpeed === opponentSpeed ? "tie" : youFirst ? "safe" : "danger";
  const headline =
    tone === "tie"
      ? "Speed tie"
      : tone === "safe"
        ? "You move first"
        : `${opponentName} moves first`;
  return (
    <div className={"speed-banner " + tone}>
      <span className="speed-headline">
        {headline}
        {trickRoom && tone !== "tie" && <span className="trick-room-note"> (Trick Room)</span>}
      </span>
      <span className="speed-nums">
        {yourSpeed} vs {opponentSpeed} Speed
      </span>
    </div>
  );
}

function ResultBlock({
  title,
  lines,
  tone,
  onSetHits,
  targetHpPercent,
}: {
  title: string;
  lines: MatchupLine[];
  tone: "incoming" | "outgoing";
  onSetHits?: (slotIndex: number, hits: number | undefined) => void;
  /** the defending side's HP going into this matchup, as a % of its max —
   * from that side's PlayerMonConfig.currentHpPercent */
  targetHpPercent: number;
}) {
  return (
    <div className="result-block">
      <h4>{title}</h4>
      {lines.length === 0 && <p className="muted">No damaging moves.</p>}
      <div className="result-rows">
        {lines.map((l, i) => (
          <ResultRow
            key={i}
            line={l}
            tone={tone}
            onSetHits={onSetHits}
            targetHpPercent={targetHpPercent}
          />
        ))}
      </div>
    </div>
  );
}

/** matrix-style row: move name, remaining-HP bar, compact damage range */
function ResultRow({
  line: l,
  tone,
  onSetHits,
  targetHpPercent,
}: {
  line: MatchupLine;
  tone: "incoming" | "outgoing";
  onSetHits?: (slotIndex: number, hits: number | undefined) => void;
  targetHpPercent: number;
}) {
  const ok = !l.error;
  // non-numeric outcomes render their label instead of a 0–0% range
  const status = ok && (l.desc === "status move" || l.desc === "no damage (immune)");
  // Sturdy/Focus Sash only ever protects a defender that's still at full
  // HP — ignore the engine's guard note for a matchup starting below it
  const guard = targetHpPercent >= 100 ? l.guard : undefined;
  const ko = ok && !guard && l.minPercent >= targetHpPercent;
  const maybeKo = ok && !guard && !ko && l.maxPercent >= targetHpPercent;
  // remaining HP range, off the defender's starting HP (not always 100):
  // sure = survives even max damage, maybe = roll-dependent; a Sturdy/Focus
  // Sash holder always keeps at least a 1 HP sliver
  let lo = ok ? Math.max(0, targetHpPercent - l.maxPercent) : targetHpPercent;
  let hi = ok ? Math.max(0, targetHpPercent - l.minPercent) : targetHpPercent;
  if (guard) {
    lo = Math.max(lo, 1);
    hi = Math.max(hi, lo);
  }
  const barTone = hpTone(lo);
  // the engine desc's tail is its KO verdict ("guaranteed 2HKO", "43.8% chance to OHKO")
  const verdict = l.desc.split(" -- ")[1];
  const dmgClass =
    "target-dmg" +
    (ko
      ? tone === "incoming"
        ? " ohko"
        : " ohko-good"
      : maybeKo || guard
        ? " maybe-ko"
        : "");
  const hasHits = l.hitsRange && l.slotIndex !== undefined && onSetHits;
  return (
    <div className={"result-row-wrap " + tone}>
      <div className="result-row" title={l.desc || undefined}>
        <span className="result-move">{l.move}</span>
        <span className="result-fill">
          <span className="hp-bar">
            <span className={"hp-sure" + barTone} style={{ width: `${lo}%` }} />
            <span className="hp-maybe" style={{ width: `${hi - lo}%` }} />
          </span>
          <span className={dmgClass}>
            {l.error
              ? l.error
              : status
                ? l.desc
                : ko
                  ? `KO · ${l.minPercent}%+`
                  : guard
                    ? `${l.minPercent}–${l.maxPercent}% · 1 HP (${guard})`
                    : `${l.minPercent}–${l.maxPercent}%${verdict ? ` · ${verdict}` : ""}`}
          </span>
        </span>
      </div>
      <div className="result-hits-slot">
        {hasHits ? (
          <select
            className={l.autoNote ? "result-hits auto-detected" : "result-hits"}
            title={
              l.autoNote
                ? `Auto-detected from ${l.autoNote} — pick a different count to override`
                : "Pin a hit count to check items like Loaded Dice or Skill Link — otherwise shows the full possible range"
            }
            value={l.pinnedHits ?? ""}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) =>
              onSetHits!(l.slotIndex!, e.target.value ? parseInt(e.target.value, 10) : undefined)
            }
          >
            <option value="">
              {l.autoRange
                ? `${l.autoRange[0] === l.autoRange[1] ? `${l.autoRange[0]}` : `${l.autoRange[0]}-${l.autoRange[1]}`}× (${l.autoNote})`
                : `${l.hitsRange![0]}-${l.hitsRange![1]}×`}
            </option>
            {Array.from(
              { length: l.hitsRange![1] - l.hitsRange![0] + 1 },
              (_, k) => l.hitsRange![0] + k,
            ).map((n) => (
              <option key={n} value={n}>
                {n}×
              </option>
            ))}
          </select>
        ) : (
          <span className="result-hits-spacer" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
