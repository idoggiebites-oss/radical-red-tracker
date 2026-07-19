import { useMemo, useState } from "react";
import type { BossMon, MonBuild } from "../types";
import { Sprite } from "./Sprite";
import { ItemSprite } from "./ItemSprite";
import { ALL_SPECIES, abilitiesFor } from "./TypeBadges";
import {
  ABILITY_NAMES,
  BOOST_STATS,
  ITEM_NAMES,
  MOVE_NAMES,
  NATURES,
  NATURE_EFFECTS,
  buildBossPokemon,
  buildPlayerPokemon,
  calcBaseStats,
  calcMoves,
  computedStats,
  defaultBossLevel,
  effectiveSpeed,
  fieldFromBattleEffect,
  resolveSpecies,
  statTotals,
  type MatchupLine,
  type PlayerMonConfig,
} from "../lib/damagecalc";

const WEATHERS = ["Sun", "Rain", "Sand", "Hail", "Snow"];
const TERRAINS = ["Electric", "Grassy", "Psychic", "Misty"];

const CFG_KEY = "rr-tracker.calcMon";
const CAUGHT_ONLY_KEY = "rr-tracker.calcCaughtOnly";

export interface CaughtMon {
  species: string;
  nickname: string;
  build?: MonBuild;
}

const DEFAULT_CFG: PlayerMonConfig = {
  species: "",
  level: 50,
  nature: "Serious",
  ability: "",
  item: "",
  evs: { HP: 0, ATK: 0, DEF: 0, SPA: 0, SPD: 0, SPE: 0 },
  ivs: { HP: 31, ATK: 31, DEF: 31, SPA: 31, SPD: 31, SPE: 31 },
  boosts: { ATK: 0, DEF: 0, SPA: 0, SPD: 0, SPE: 0 },
  moves: ["", "", "", ""],
};

function loadCfg(levelCap?: number): PlayerMonConfig {
  let cfg = DEFAULT_CFG;
  try {
    const raw = localStorage.getItem(CFG_KEY);
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

export function CalcPanel({
  mon,
  battleEffect,
  levelCap,
  caught = [],
  onClose,
}: {
  mon: BossMon;
  battleEffect: string;
  levelCap?: number;
  caught?: CaughtMon[];
  onClose: () => void;
}) {
  const parsedLevel = parseInt(mon.level, 10);
  const [bossLevel, setBossLevel] = useState(() =>
    defaultBossLevel(mon.level, levelCap),
  );
  const [cfg, setCfg] = useState<PlayerMonConfig>(() => loadCfg(levelCap));
  const bossField = useMemo(
    () => (battleEffect ? fieldFromBattleEffect(battleEffect) : {}),
    [battleEffect],
  );
  const [weather, setWeather] = useState(bossField.weather ?? "");
  const [terrain, setTerrain] = useState(bossField.terrain ?? "");
  const [caughtOnly, setCaughtOnly] = useState(
    () => localStorage.getItem(CAUGHT_ONLY_KEY) === "1",
  );
  const [importedFrom, setImportedFrom] = useState("");

  const update = (patch: Partial<PlayerMonConfig>) => {
    setCfg((c) => {
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
          next.moves = [...b.moves, "", "", "", ""].slice(0, 4);
          setImportedFrom(owned.nickname || owned.species);
        } else {
          setImportedFrom("");
        }
        // keep the ability legal for the chosen species
        const legal = abilitiesFor(next.species);
        if (legal.length > 0 && !legal.includes(next.ability)) {
          next.ability = legal[0];
        }
      }
      localStorage.setItem(CFG_KEY, JSON.stringify(next));
      return next;
    });
  };

  const resetCfg = () => {
    localStorage.removeItem(CFG_KEY);
    setImportedFrom("");
    setCfg(loadCfg(levelCap));
  };

  const toggleCaughtOnly = (on: boolean) => {
    setCaughtOnly(on);
    localStorage.setItem(CAUGHT_ONLY_KEY, on ? "1" : "0");
  };

  const caughtSpecies = useMemo(
    () => [...new Set(caught.map((m) => m.species))].sort(),
    [caught],
  );
  const speciesOptions = caughtOnly && caught.length > 0 ? caughtSpecies : ALL_SPECIES;

  const playerAbilities = abilitiesFor(cfg.species);
  const playerStats = cfg.species ? calcBaseStats(cfg.species) : null;

  const fieldOpts = useMemo(
    () => ({
      weather: weather || undefined,
      terrain: terrain || undefined,
    }),
    [weather, terrain],
  );

  const bossUnknown = resolveSpecies(mon.species) === null;
  const results = useMemo(() => {
    const boss = buildBossPokemon(mon, bossLevel);
    const player = cfg.species ? buildPlayerPokemon(cfg) : null;
    if (!boss || !player) return null;
    const incoming = calcMoves(boss, player, mon.moves, fieldOpts);
    const outgoing = calcMoves(
      player,
      boss,
      cfg.moves.filter((m) => m.trim()),
      fieldOpts,
    );
    return {
      incoming,
      outgoing,
      bossSpeed: effectiveSpeed(boss, fieldOpts),
      playerSpeed: effectiveSpeed(player, fieldOpts),
    };
  }, [mon, bossLevel, cfg, fieldOpts]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog calc-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>
          <Sprite species={mon.species} size={34} /> {mon.species} · damage calc
        </h2>
        {bossUnknown && (
          <p className="save-error">
            The calc data doesn't know “{mon.species}” — can't calculate this one.
          </p>
        )}
        <div className="calc-grid">
          <div className="calc-side">
            <h3>Boss side</h3>
            <label>
              Level{" "}
              <input
                type="number"
                min={1}
                max={100}
                value={bossLevel}
                onChange={(e) => setBossLevel(parseInt(e.target.value, 10) || 1)}
              />
              {Number.isNaN(parsedLevel) && (
                <span className="muted"> ({mon.level})</span>
              )}
            </label>
            <div className="muted">
              {mon.nature} · {mon.ability} · <ItemSprite name={mon.item} size={18} />{" "}
              {mon.item || "no item"}
              {mon.speedStat && ` · sheet speed ${mon.speedStat}`}
            </div>
            {battleEffect && (
              <div className="muted">Battle effect: {battleEffect.toLowerCase()}</div>
            )}
            <div className="calc-row">
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
            </div>
          </div>

          <div className="calc-side">
            <div className="calc-side-head">
              <h3>Your Pokémon</h3>
              {caught.length > 0 && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={caughtOnly}
                    onChange={(e) => toggleCaughtOnly(e.target.checked)}
                  />
                  Caught only
                </label>
              )}
              <button className="st-btn clear" onClick={resetCfg}>
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
                list="all-species-calc"
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
              <select
                value={cfg.nature}
                onChange={(e) => update({ nature: e.target.value })}
              >
                {NATURES.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="calc-row">
              {playerAbilities.length > 0 ? (
                <select
                  title="Ability"
                  value={cfg.ability}
                  onChange={(e) => update({ ability: e.target.value })}
                >
                  {playerAbilities.map((a, i) => (
                    <option key={a} value={a}>
                      {a}
                      {i === playerAbilities.length - 1 && playerAbilities.length > 1
                        ? " (hidden)"
                        : ""}
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
            </div>
            {playerStats && (
              <div className="muted base-stats-line">
                Base:{" "}
                {Object.entries(playerStats)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(" · ")}
              </div>
            )}
            <NatureLine cfg={cfg} />
            <ModifierLine cfg={cfg} fieldOpts={fieldOpts} />
            <TotalsWithBoosts cfg={cfg} fieldOpts={fieldOpts} update={update} />
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
        </div>

        <datalist id="all-species-calc">
          {speciesOptions.map((s) => (
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

        {results && (
          <div className="calc-results">
            <div className="speed-line">
              Speed: boss <strong>{results.bossSpeed}</strong> vs yours{" "}
              <strong>{results.playerSpeed}</strong>{" "}
              {results.playerSpeed > results.bossSpeed
                ? "— you outspeed"
                : results.playerSpeed < results.bossSpeed
                  ? "— they outspeed"
                  : "— speed tie"}
            </div>
            <ResultBlock
              title={`${mon.species}'s moves vs you`}
              lines={results.incoming}
              tone="incoming"
            />
            <ResultBlock
              title="Your moves vs them"
              lines={results.outgoing}
              tone="outgoing"
            />
          </div>
        )}
        {!results && !bossUnknown && (
          <p className="muted">Enter your Pokémon's species to calculate.</p>
        )}

        <div className="dialog-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
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
  update,
}: {
  cfg: PlayerMonConfig;
  fieldOpts: Parameters<typeof statTotals>[1];
  update: (patch: Partial<PlayerMonConfig>) => void;
}) {
  if (!cfg.species || resolveSpecies(cfg.species) === null) return null;
  const t = statTotals(cfg, fieldOpts);
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

function ResultBlock({
  title,
  lines,
  tone,
}: {
  title: string;
  lines: MatchupLine[];
  tone: "incoming" | "outgoing";
}) {
  const ohkoClass = tone === "incoming" ? "result-desc ohko" : "result-desc ohko-good";
  return (
    <div className="result-block">
      <h4>{title}</h4>
      {lines.length === 0 && <p className="muted">No damaging moves.</p>}
      {lines.map((l, i) => (
        <div key={i} className="result-line">
          <span className="result-move">{l.move}</span>
          {l.error ? (
            <span className="muted">{l.error}</span>
          ) : (
            <span className={l.maxPercent >= 100 ? ohkoClass : "result-desc"}>
              {l.desc}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
