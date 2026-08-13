import type { BossMon, CalcTarget } from "../types";
import { Sprite } from "./Sprite";
import { ItemSprite } from "./ItemSprite";
import { TypeBadges } from "./TypeBadges";
import { SpeciesDefenses } from "./SpeciesDefenses";
import { applyNoEvs, bossStatTotals, defaultBossLevel } from "../lib/damagecalc";

const STAT_ORDER = ["HP", "ATK", "DEF", "SPA", "SPD", "SPE"];

/** full boss Pokémon card: set details, defensive profile, stats, Calc */
export function MonCard({
  mon,
  battleEffect,
  levelCap,
  team,
  teamLabel,
  onCalc,
  noEvs = false,
}: {
  mon: BossMon;
  battleEffect: string;
  levelCap?: number;
  /** this Pokémon's full boss team + a display label, passed straight
   * through to onCalc so the Calculator page can offer a team switcher */
  team?: BossMon[];
  teamLabel?: string;
  /** opens the dedicated Team → Calculator page with this Pokémon prefilled
   * as the Opponent, instead of a popup */
  onCalc?: (target: CalcTarget) => void;
  /** hardcore/restricted run or a Minimal Grind start: EVs apply to nobody,
   * trainers included — so the stat table must not include them and the EV
   * row has nothing to show */
  noEvs?: boolean;
}) {
  // the stats it actually fights with (level, nature, EVs, item/ability
  // multipliers); the sheet's base line only remains for unknown species
  const statLevel = defaultBossLevel(mon.level, levelCap);
  const shown = applyNoEvs(mon, noEvs);
  const totals = bossStatTotals(shown, statLevel);
  return (
    <div className="mon-card">
      <div className="mon-head">
        <Sprite species={mon.species} size={44} />
        <div>
          <div className="mon-name">{mon.species}</div>
          <div className="mon-level">Lv. {mon.level || "?"}</div>
          <TypeBadges species={mon.species} small />
        </div>
        <button
          className="calc-btn"
          title="Damage calculator"
          onClick={() =>
            onCalc?.({
              mon,
              battleEffect,
              levelCap,
              team: team ?? [mon],
              teamLabel: teamLabel ?? mon.species,
            })
          }
        >
          Calc
        </button>
      </div>
      <div className="mon-meta">
        <div>
          <span className="k">Ability</span> {mon.ability || "—"}
        </div>
        <div>
          <span className="k">Item</span> <ItemSprite name={mon.item} />{" "}
          {mon.item || "—"}
        </div>
        <div>
          <span className="k">Nature</span> {mon.nature || "—"}
        </div>
        {mon.speedStat && (
          <div>
            <span className="k">Speed</span> {mon.speedStat}
            {Object.entries(mon.altSpeeds).map(([k, v]) => (
              <span key={k} className="alt-speed">
                {" "}
                · {k}: {v}
              </span>
            ))}
          </div>
        )}
      </div>
      <ul className="mon-moves">
        {mon.moves.map((mv) => (
          <li key={mv}>{mv}</li>
        ))}
      </ul>
      <SpeciesDefenses species={mon.species} ability={mon.ability} />
      {(totals || STAT_ORDER.some((s) => mon.baseStats[s])) && (
        <table className="stat-table">
          <thead>
            <tr>
              <th></th>
              {STAT_ORDER.map((s) => (
                <th key={s}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {totals ? (
                <>
                  <td className="k">Lv {statLevel}</td>
                  {STAT_ORDER.map((s) => (
                    <td key={s}>{totals[s]}</td>
                  ))}
                </>
              ) : (
                <>
                  <td className="k">Base</td>
                  {STAT_ORDER.map((s) => (
                    <td key={s}>{mon.baseStats[s] || "–"}</td>
                  ))}
                </>
              )}
            </tr>
            {Object.keys(shown.evs).length > 0 && (
              <tr>
                <td className="k">EVs</td>
                {STAT_ORDER.map((s) => (
                  <td key={s}>{shown.evs[s] || "–"}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
