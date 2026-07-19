import { useMemo, useState } from "react";
import type { BossMon } from "../types";
import { Sprite } from "./Sprite";
import { ALL_SPECIES, abilitiesFor } from "./TypeBadges";
import {
  ABILITY_NAMES,
  ITEM_NAMES,
  MOVE_NAMES,
  NATURES,
  NATURE_EFFECTS,
  buildBossPokemon,
  buildPlayerPokemon,
  calcBaseStats,
  calcMoves,
  computedStats,
  fieldFromBattleEffect,
  resolveSpecies,
  type MatchupLine,
  type PlayerMonConfig,
} from "../lib/damagecalc";

const CFG_KEY = "rr-tracker.calcMon";

const DEFAULT_CFG: PlayerMonConfig = {
  species: "",
  level: 50,
  nature: "Serious",
  ability: "",
  item: "",
  evs: { HP: 0, ATK: 0, DEF: 0, SPA: 0, SPD: 0, SPE: 0 },
  ivs: { HP: 31, ATK: 31, DEF: 31, SPA: 31, SPD: 31, SPE: 31 },
  moves: ["", "", "", ""],
};

function loadCfg(levelCap?: number): PlayerMonConfig {
  let cfg = DEFAULT_CFG;
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      cfg = { ...DEFAULT_CFG, ...saved, ivs: { ...DEFAULT_CFG.ivs, ...saved.ivs } };
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
  onClose,
}: {
  mon: BossMon;
  battleEffect: string;
  levelCap?: number;
  onClose: () => void;
}) {
  const parsedLevel = parseInt(mon.level, 10);
  const [bossLevel, setBossLevel] = useState(
    Number.isNaN(parsedLevel) ? 50 : parsedLevel,
  );
  const [cfg, setCfg] = useState<PlayerMonConfig>(() => loadCfg(levelCap));
  const [applyField, setApplyField] = useState(true);

  const update = (patch: Partial<PlayerMonConfig>) => {
    setCfg((c) => {
      const next = { ...c, ...patch };
      // keep the ability legal for the chosen species
      if (patch.species !== undefined) {
        const legal = abilitiesFor(next.species);
        if (legal.length > 0 && !legal.includes(next.ability)) {
          next.ability = legal[0];
        }
      }
      localStorage.setItem(CFG_KEY, JSON.stringify(next));
      return next;
    });
  };

  const playerAbilities = abilitiesFor(cfg.species);
  const playerStats = cfg.species ? calcBaseStats(cfg.species) : null;

  const fieldOpts = useMemo(
    () => (applyField && battleEffect ? fieldFromBattleEffect(battleEffect) : {}),
    [applyField, battleEffect],
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
    return { incoming, outgoing, bossSpeed: boss.stats.spe, playerSpeed: player.stats.spe };
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
              {mon.nature} · {mon.ability} · {mon.item || "no item"}
              {mon.speedStat && ` · sheet speed ${mon.speedStat}`}
            </div>
            {battleEffect && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={applyField}
                  onChange={(e) => setApplyField(e.target.checked)}
                />
                Apply battle effect: {battleEffect.toLowerCase()}
              </label>
            )}
          </div>

          <div className="calc-side">
            <h3>Your Pokémon</h3>
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
