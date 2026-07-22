import { useState } from "react";
import type { BossMon } from "../types";
import { Sprite } from "./Sprite";
import { ItemSprite } from "./ItemSprite";
import { TypeBadges } from "./TypeBadges";
import { CalcPanel, type CaughtMon } from "./CalcPanel";
import { defensiveProfile, formatMult, typeColor } from "../lib/effectiveness";
import { bossStatTotals, defaultBossLevel } from "../lib/damagecalc";

/** weak/resist/immune type chips for a species (+ defensive ability) */
export function SpeciesDefenses({
  species,
  ability,
}: {
  species: string;
  ability?: string;
}) {
  const profile = defensiveProfile(species, ability);
  const entries = Object.entries(profile);
  if (entries.length === 0) return null;
  const groups: { label: string; test: (m: number) => boolean }[] = [
    { label: "Weak", test: (m) => m > 1 },
    { label: "Resist", test: (m) => m > 0 && m < 1 },
    { label: "Immune", test: (m) => m === 0 },
  ];
  return (
    <div className="mon-defenses">
      {groups.map(({ label, test }) => {
        const items = entries
          .filter(([, m]) => test(m))
          .sort(([, a], [, b]) => b - a);
        if (items.length === 0) return null;
        return (
          <div key={label} className="def-row">
            <span className="k">{label}</span>
            <span className="def-chips">
              {items.map(([t, m]) => (
                <span key={t} className="type-badge" style={{ background: typeColor(t) }}>
                  {t} {formatMult(m)}
                </span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const STAT_ORDER = ["HP", "ATK", "DEF", "SPA", "SPD", "SPE"];

/** full boss Pokémon card: set details, defensive profile, stats, Calc */
export function MonCard({
  mon,
  battleEffect,
  levelCap,
  caught,
  noEvs,
  anyAbility,
}: {
  mon: BossMon;
  battleEffect: string;
  levelCap?: number;
  caught?: CaughtMon[];
  /** hardcore/restricted run or a Minimal Grind start: the calc hides
   * player EV inputs */
  noEvs?: boolean;
  /** ability randomizer active: the calc accepts any player ability */
  anyAbility?: boolean;
}) {
  const [calcOpen, setCalcOpen] = useState(false);
  // the stats it actually fights with (level, nature, EVs, item/ability
  // multipliers); the sheet's base line only remains for unknown species
  const statLevel = defaultBossLevel(mon.level, levelCap);
  const totals = bossStatTotals(mon, statLevel);
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
          onClick={() => setCalcOpen(true)}
        >
          Calc
        </button>
      </div>
      {calcOpen && (
        <CalcPanel
          mon={mon}
          battleEffect={battleEffect}
          levelCap={levelCap}
          caught={caught}
          noEvs={noEvs}
          anyAbility={anyAbility}
          onClose={() => setCalcOpen(false)}
        />
      )}
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
            {Object.keys(mon.evs).length > 0 && (
              <tr>
                <td className="k">EVs</td>
                {STAT_ORDER.map((s) => (
                  <td key={s}>{mon.evs[s] || "–"}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
