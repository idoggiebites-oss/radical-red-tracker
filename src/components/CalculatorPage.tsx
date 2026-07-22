import { useEffect, useMemo, useState } from "react";
import type { BossMode, BossMon, CalcTarget, CaughtMon, Run } from "../types";
import { ALL_SPECIES, abilitiesFor } from "./TypeBadges";
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
  autoField,
  autoFieldNote,
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
  toEngineSide,
  type MatchupLine,
  type PlayerMonConfig,
  type SideConditions,
} from "../lib/damagecalc";

const WEATHERS = ["Sun", "Rain", "Sand", "Hail", "Snow"];
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

export function CalculatorPage({
  run,
  modeData,
  caught = [],
  noEvs = false,
  anyAbility = false,
  target,
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

  // a new boss Calc-button click always wins over whatever was there —
  // the Opponent card is intentionally never persisted
  useEffect(() => {
    if (!target) return;
    setOpp(cfgFromBossMon(target.mon, target.levelCap));
    const field = fieldFromBattleEffect(target.battleEffect);
    setWeather(field.weather ?? "");
    setTerrain(field.terrain ?? "");
    setDoubles(/DOUBLES/i.test(target.battleEffect));
    setOppSide({});
  }, [target]);

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
      }
      localStorage.setItem(YOU_CFG_KEY, JSON.stringify(next));
      return next;
    });
  };

  const updateOpp = (patch: Partial<PlayerMonConfig>) => {
    setOpp((c) => ({ ...c, ...patch }));
  };

  const resetYou = () => {
    localStorage.removeItem(YOU_CFG_KEY);
    setImportedFrom("");
    setYou(loadYouCfg(levelCap));
  };

  const resetOpp = () => {
    setOpp(DEFAULT_CFG);
    setOppSide({});
  };

  // convenience matching the boss-Calc-button prefill, for landing on this
  // page directly instead of clicking through a boss's own team card
  const loadNextBoss = () => {
    const idx = nextRequiredIndex(modeData.trainerOrder, run);
    if (idx < 0) return;
    const bt = bossTeamFor(modeData, idx);
    if (!bt) return;
    const cat = modeData.categories.find((c) => c.name === bt.category);
    const rivalStarter = rivalStarterFor(run);
    const boss = cat?.bosses.find(
      (b) => b.title === bt.title && bossMatchesStarter(b.subtitle, rivalStarter),
    );
    const mon = boss?.pokemon[0];
    if (!boss || !mon) return;
    setOpp(cfgFromBossMon(mon, levelCap));
    const field = fieldFromBattleEffect(boss.battleEffect);
    setWeather(field.weather ?? "");
    setTerrain(field.terrain ?? "");
    setDoubles(/DOUBLES/i.test(boss.battleEffect));
    setOppSide({});
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
  const autoBits = useMemo(
    () => autoFieldNote(fieldOpts, [calcYou.ability, opp.ability]),
    [fieldOpts, calcYou.ability, opp.ability],
  );

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
      opp.moves.filter((m) => m.trim()),
      incomingField,
      crit,
    );
    const outgoing = calcMoves(
      youPoke,
      oppPoke,
      calcYou.moves.filter((m) => m.trim()),
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
            speciesListId="you-species-calc"
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
            terrain={terrain}
            setTerrain={setTerrain}
            crit={crit}
            setCrit={setCrit}
            doubles={doubles}
            setDoubles={setDoubles}
            autoBits={autoBits}
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
            speciesListId="opp-species-calc"
            headExtra={
              <button className="st-btn" onClick={loadNextBoss}>
                Load this run's next boss
              </button>
            }
          />
        </div>

        {results && (
          <div className="col-res-you">
            <ResultBlock
              title={`Your moves vs them${doubles ? " · doubles" : ""}${crit ? " · crit" : ""}`}
              lines={results.outgoing}
              tone="outgoing"
            />
          </div>
        )}
        {results && (
          <div className="col-res-opp">
            <ResultBlock
              title={`${opp.species || "Opponent"}'s moves vs you${doubles ? " · doubles" : ""}${crit ? " · crit" : ""}`}
              lines={results.incoming}
              tone="incoming"
            />
          </div>
        )}
      </div>
      {!results && <p className="muted">Enter both Pokémon's species to calculate.</p>}

      <datalist id="you-species-calc">
        {youSpeciesOptions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="opp-species-calc">
        {ALL_SPECIES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="all-moves-calc">
        {MOVE_NAMES.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="all-items-calc">
        {ITEM_NAMES.map((i) => (
          <option key={i} value={i} />
        ))}
      </datalist>
      <datalist id="all-abilities-calc">
        {ABILITY_NAMES.map((a) => (
          <option key={a} value={a} />
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
  speciesListId,
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
  speciesListId: string;
  importedFrom?: string;
  headExtra?: React.ReactNode;
}) {
  const abilities = abilitiesFor(cfg.species);
  const baseStats = cfg.species ? calcBaseStats(cfg.species) : null;
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
        <input
          placeholder="Species"
          list={speciesListId}
          value={cfg.species}
          onChange={(e) => update({ species: e.target.value })}
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
            <option key={n}>{n}</option>
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
          <input
            placeholder="Ability"
            list="all-abilities-calc"
            value={cfg.ability}
            onChange={(e) => update({ ability: e.target.value })}
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
          <input
            key={i}
            className="calc-move"
            placeholder={`Move ${i + 1}`}
            list="all-moves-calc"
            value={m}
            onChange={(e) => {
              const moves = [...cfg.moves];
              moves[i] = e.target.value;
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
  terrain,
  setTerrain,
  crit,
  setCrit,
  doubles,
  setDoubles,
  autoBits,
  show,
  setShow,
  yourSide,
  setYourSide,
  oppSide,
  setOppSide,
}: {
  weather: string;
  setWeather: (w: string) => void;
  terrain: string;
  setTerrain: (t: string) => void;
  crit: boolean;
  setCrit: (fn: (c: boolean) => boolean) => void;
  doubles: boolean;
  setDoubles: (fn: (d: boolean) => boolean) => void;
  autoBits: string[];
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
          <select value={weather} onChange={(e) => setWeather(e.target.value)}>
            <option value="">None</option>
            {WEATHERS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="field-select">
          Terrain
          <select value={terrain} onChange={(e) => setTerrain(e.target.value)}>
            <option value="">None</option>
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
      </div>
      {autoBits.length > 0 && (
        <div className="muted auto-bits">Auto: {autoBits.join(" · ")}</div>
      )}
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

/** who moves first, surfaced above the damage rows instead of left for the
 * reader to derive by comparing two numbers — a favorable damage % is
 * meaningless if the opponent outspeeds and KOs first */
function SpeedBanner({
  opponentName,
  opponentSpeed,
  yourSpeed,
}: {
  opponentName: string;
  opponentSpeed: number;
  yourSpeed: number;
}) {
  const tone =
    yourSpeed === opponentSpeed ? "tie" : yourSpeed > opponentSpeed ? "safe" : "danger";
  const headline =
    tone === "tie"
      ? "Speed tie"
      : tone === "safe"
        ? "You move first"
        : `${opponentName} moves first`;
  return (
    <div className={"speed-banner " + tone}>
      <span className="speed-headline">{headline}</span>
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
}: {
  title: string;
  lines: MatchupLine[];
  tone: "incoming" | "outgoing";
}) {
  return (
    <div className="result-block">
      <h4>{title}</h4>
      {lines.length === 0 && <p className="muted">No damaging moves.</p>}
      <div className="result-rows">
        {lines.map((l, i) => (
          <ResultRow key={i} line={l} tone={tone} />
        ))}
      </div>
    </div>
  );
}

/** matrix-style row: move name, remaining-HP bar, compact damage range */
function ResultRow({
  line: l,
  tone,
}: {
  line: MatchupLine;
  tone: "incoming" | "outgoing";
}) {
  const ok = !l.error;
  // non-numeric outcomes render their label instead of a 0–0% range
  const status = ok && (l.desc === "status move" || l.desc === "no damage (immune)");
  const ko = ok && !l.guard && l.minPercent >= 100;
  const maybeKo = ok && !l.guard && !ko && l.maxPercent >= 100;
  // remaining HP range: sure = survives even max damage, maybe = roll-dependent;
  // a Sturdy/Focus Sash holder always keeps at least a 1 HP sliver
  let lo = ok ? Math.max(0, 100 - l.maxPercent) : 100;
  let hi = ok ? Math.max(0, 100 - l.minPercent) : 100;
  if (l.guard) {
    lo = Math.max(lo, 1);
    hi = Math.max(hi, lo);
  }
  const barTone = lo < 25 ? " low" : lo < 55 ? " mid" : "";
  // the engine desc's tail is its KO verdict ("guaranteed 2HKO", "43.8% chance to OHKO")
  const verdict = l.desc.split(" -- ")[1];
  const dmgClass =
    "target-dmg" +
    (ko
      ? tone === "incoming"
        ? " ohko"
        : " ohko-good"
      : maybeKo || l.guard
        ? " maybe-ko"
        : "");
  return (
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
                : l.guard
                  ? `${l.minPercent}–${l.maxPercent}% · 1 HP (${l.guard})`
                  : `${l.minPercent}–${l.maxPercent}%${verdict ? ` · ${verdict}` : ""}`}
        </span>
      </span>
    </div>
  );
}
