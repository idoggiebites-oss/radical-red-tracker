import { useState } from "react";
import type { Boss, BossMode, BossMon, MonBuild, Run } from "../types";
import { Sprite } from "../components/Sprite";
import { ItemSprite } from "../components/ItemSprite";
import { MonCard, SpeciesDefenses } from "../components/MonCard";
import { type CaughtMon } from "../components/CalcPanel";
import { TypeBadges, abilitiesFor, typesFor } from "../components/TypeBadges";
import { isNoItem } from "../lib/itemSprites";
import { nextLevelCap } from "../lib/levelCap";
import { bossMatchesStarter, rivalStarterFor } from "../lib/starters";
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
  buildBossPokemon,
  buildPlayerPokemon,
  calcMoveRange,
  defaultBossLevel,
  fieldFromBattleEffect,
  type MoveRange,
  type PlayerMonConfig,
} from "../lib/damagecalc";

const WEATHERS = ["Sun", "Rain", "Sand", "Hail", "Snow"];

const EMPTY_BUILD: MonBuild = {
  nature: "Serious",
  ability: "",
  item: "",
  moves: ["", "", "", ""],
};

type Entry = [string, Run["encounters"][string]];

export function TeamView({
  run,
  updateRun,
  modeData,
}: {
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
  modeData: BossMode;
}) {
  const [subtab, setSubtab] = useState<"roster" | "readiness">("roster");
  const [sortStat, setSortStat] = useState<StatKey | "KOS" | "">("");
  const [filterType, setFilterType] = useState("");
  const [buildOpen, setBuildOpen] = useState<string | null>(null);
  const [evolveOpen, setEvolveOpen] = useState<string | null>(null);

  if (!run) return <p className="muted">Create or select a run to see your team.</p>;

  const refine = (items: Entry[]): Entry[] => {
    let out = items;
    if (filterType) {
      out = out.filter(([, e]) => typesFor(e.species).includes(filterType));
    }
    if (sortStat === "KOS") {
      out = [...out].sort(([, a], [, b]) => (b.kos ?? 0) - (a.kos ?? 0));
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
  };

  const sectionShared = {
    buildOpen,
    setBuildOpen,
    setBuild,
    addKo,
    evolveOpen,
    setEvolveOpen,
    setSpecies,
  };

  const toolbar = (
    <div className="box-toolbar">
      <label>
        Sort by
        <select
          value={sortStat}
          onChange={(e) => setSortStat(e.target.value as StatKey | "KOS" | "")}
        >
          <option value="">Caught order</option>
          <option value="KOS">Most KOs</option>
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
          caught={caughtMons}
          setBuild={setBuild}
        />
      )}
      {subtab === "roster" && (
      <>
      <Section
        title="Party"
        items={party}
        empty={filteredEmpty("No Pokémon in the party — promote some from the box.")}
        highlightStat={sortStat}
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
        {...sectionShared}
        actions={(id) => (
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
        )}
      />
      </>
      )}
    </div>
  );
}

function PartyStats({ species }: { species: string }) {
  const stats = statsFor(species);
  if (Object.keys(stats).length === 0) return null;
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
          <td className="k">Base</td>
          {STAT_KEYS.map((s) => (
            <td key={s}>{stats[s] ?? "–"}</td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** party in the boss-preview compact style: rows that expand into base
 * stats, defensive profile and the build editor */
function PartyPreview({
  party,
  setBuild,
}: {
  party: Entry[];
  setBuild: (locId: string, build: MonBuild | undefined) => void;
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
              <PartyStats species={e.species} />
              <SpeciesDefenses
                species={e.species}
                ability={e.build?.ability || abilitiesFor(e.species)[0]}
              />
              <BuildEditor
                species={e.species}
                build={e.build ?? EMPTY_BUILD}
                onChange={(b) => setBuild(locId, b)}
                onClear={() => setBuild(locId, undefined)}
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
  caught,
  setBuild,
}: {
  run: Run;
  modeData: BossMode;
  party: Entry[];
  caught: CaughtMon[];
  setBuild: (locId: string, build: MonBuild | undefined) => void;
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
        <PartyPreview party={party} setBuild={setBuild} />
      </div>
      <div className="readiness-col col-boss">
        {boss ? (
          <BossPreview
            key={selected}
            boss={boss}
            levelCap={levelCap}
            caught={caught}
          />
        ) : (
          <p className="muted">Pick a boss team to check your party against.</p>
        )}
      </div>
      {boss && party.length > 0 && (
        <MoveMatchup
          party={party}
          boss={boss}
          levelCap={levelCap}
          weather={weather}
          terrain={terrain}
        />
      )}
    </div>
  );
}

/** one row per move of the chosen party mon; each row previews the damage
 * against every Pokémon of the selected boss as an HP bar */
function MoveMatchup({
  party,
  boss,
  levelCap,
  weather,
  terrain,
}: {
  party: Entry[];
  boss: Boss;
  levelCap?: number;
  weather: string;
  terrain: string;
}) {
  const [sel, setSel] = useState("");
  const active = party.find(([id]) => id === sel) ?? party[0];
  if (!active) return null;
  const [activeId, mon] = active;
  const level = levelCap ?? 50;
  const cfg: PlayerMonConfig = {
    species: mon.species,
    level,
    nature: mon.build?.nature || "Serious",
    ability: mon.build?.ability || abilitiesFor(mon.species)[0] || "",
    item: mon.build?.item ?? "",
    evs: {},
    moves: mon.build?.moves ?? [],
  };
  const attacker = buildPlayerPokemon(cfg);
  const fieldOpts = {
    weather: weather || undefined,
    terrain: terrain || undefined,
  };
  const moves = (mon.build?.moves ?? []).filter((m) => m.trim());
  const defenders = boss.pokemon.map((bm) => ({
    bm,
    poke: buildBossPokemon(bm, defaultBossLevel(bm.level, levelCap)),
  }));
  return (
    <div className="matchup">
      <div className="matchup-toolbar">
        <label className="boss-picker-label attacker-label">
          Attacker
          <select value={activeId} onChange={(e) => setSel(e.target.value)}>
            {party.map(([id, e]) => (
              <option key={id} value={id}>
                {e.nickname ? `${e.nickname} (${e.species})` : e.species}
              </option>
            ))}
          </select>
        </label>
        <span className="muted matchup-note">
          your moves vs {boss.title}
          {weather && ` · ${weather}`}
          {terrain && ` · ${terrain} Terrain`}
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
            Lv {level} · {cfg.nature}
            {cfg.ability && ` · ${cfg.ability}`}
          </div>
          {cfg.item && (
            <div className="muted matchup-attacker-meta">
              <ItemSprite name={cfg.item} size={18} /> {cfg.item}
            </div>
          )}
          {!attacker && (
            <div className="save-error">The calc doesn't know this species.</div>
          )}
        </div>
        <div className="matchup-rows">
          {moves.length === 0 && (
            <p className="muted">
              No moves set — expand this Pokémon in the party list above and
              fill in its build to preview damage.
            </p>
          )}
          {moves.map((move, mi) => (
            <div key={mi} className="matchup-row">
              <div className="matchup-move">{move}</div>
              <div className="matchup-targets">
                {defenders.map(({ bm, poke }, i) => (
                  <TargetCard
                    key={i}
                    bm={bm}
                    line={
                      attacker && poke
                        ? calcMoveRange(attacker, poke, move, fieldOpts)
                        : null
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TargetCard({ bm, line }: { bm: BossMon; line: MoveRange | null }) {
  const ok = line !== null && !line.error;
  const ko = ok && line.minPercent >= 100;
  const maybeKo = ok && !ko && line.maxPercent >= 100;
  // remaining HP range: sure = survives even max damage, maybe = roll-dependent
  const lo = ok ? Math.max(0, 100 - line.maxPercent) : 100;
  const hi = ok ? Math.max(0, 100 - line.minPercent) : 100;
  const tone = lo < 25 ? " low" : lo < 55 ? " mid" : "";
  return (
    <div className="target-card">
      <Sprite species={bm.species} size={30} />
      <span className="target-info">
        <span className="target-name">{bm.species}</span>
        <span className="hp-bar">
          <span className={"hp-sure" + tone} style={{ width: `${lo}%` }} />
          <span className="hp-maybe" style={{ width: `${hi - lo}%` }} />
        </span>
        <span className={"target-dmg" + (ko ? " ko" : maybeKo ? " maybe-ko" : "")}>
          {!line
            ? "—"
            : line.error
              ? line.error
              : ko
                ? `KO · ${line.minPercent}%+`
                : `${line.minPercent}–${line.maxPercent}%${maybeKo ? " · may KO" : ""}`}
        </span>
      </span>
    </div>
  );
}

function BossPreview({
  boss,
  levelCap,
  caught,
}: {
  boss: Boss;
  levelCap?: number;
  caught: CaughtMon[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="readiness-preview">
      {boss.battleEffect && (
        <div className="battle-effect">⚡ {boss.battleEffect}</div>
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
              caught={caught}
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
}: {
  species: string;
  build: MonBuild;
  onChange: (build: MonBuild) => void;
  onClear: () => void;
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
        {legalAbilities.length > 0 ? (
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

function EvolvePanel({
  species,
  onPick,
}: {
  species: string;
  onPick: (species: string) => void;
}) {
  const evos = evolutionsFor(species);
  const pres = preEvolutionsFor(species);
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
      {evos.length === 0 && (
        <span className="muted">{species} doesn't evolve further.</span>
      )}
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
function Section({
  title,
  items,
  empty,
  actions,
  highlightStat,
  buildOpen,
  setBuildOpen,
  setBuild,
  addKo,
  evolveOpen,
  setEvolveOpen,
  setSpecies,
  canEvolve = true,
}: {
  title: string;
  items: Entry[];
  empty: string;
  actions: (locId: string) => React.ReactNode;
  highlightStat?: StatKey | "KOS" | "";
  buildOpen: string | null;
  setBuildOpen: (locId: string | null) => void;
  setBuild: (locId: string, build: MonBuild | undefined) => void;
  addKo: (locId: string, delta: number) => void;
  evolveOpen: string | null;
  setEvolveOpen: (locId: string | null) => void;
  setSpecies: (locId: string, species: string) => void;
  canEvolve?: boolean;
}) {
  return (
    <section className="team-section">
      <div className="team-section-head">
        <h3>
          {title} <span className="count">({items.length})</span>
        </h3>
      </div>
      {items.length === 0 && <p className="muted">{empty}</p>}
      <div className="team-grid">
        {items.map(([locId, e]) => (
          <div key={locId} className="team-card-wrap">
            <div className="team-card">
              <Sprite species={e.species} size={48} />
              <div className="team-info">
                <div className="team-name">
                  {e.nickname || e.species}
                  {e.nickname && <span className="muted"> · {e.species}</span>}
                  {highlightStat &&
                    highlightStat !== "KOS" &&
                    statsFor(e.species)[highlightStat] !== undefined && (
                      <span className="stat-pill">
                        {highlightStat} {statsFor(e.species)[highlightStat]}
                      </span>
                    )}
                </div>
                <TypeBadges species={e.species} small />
                <div className="team-loc muted">
                  {locId === "starter" ? "starter · oak's lab" : locId.replace(/-/g, " ")}
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
                  <button className="ko-btn" onClick={() => addKo(locId, -1)} aria-label="Remove KO">
                    −
                  </button>
                  <span className="ko-count">{e.kos ?? 0}</span>
                  <button className="ko-btn" onClick={() => addKo(locId, 1)} aria-label="Add KO">
                    +
                  </button>
                </div>
              </div>
              <div className="team-actions">
                {actions(locId)}
                <button onClick={() => setBuildOpen(buildOpen === locId ? null : locId)}>
                  {e.build ? "Edit build" : "Build"}
                </button>
                {canEvolve &&
                  (evolutionsFor(e.species).length > 0 ||
                    preEvolutionsFor(e.species).length > 0) && (
                    <button
                      onClick={() =>
                        setEvolveOpen(evolveOpen === locId ? null : locId)
                      }
                    >
                      Evolve
                    </button>
                  )}
              </div>
            </div>
            {buildOpen === locId && (
              <BuildEditor
                species={e.species}
                build={e.build ?? EMPTY_BUILD}
                onChange={(b) => setBuild(locId, b)}
                onClear={() => setBuild(locId, undefined)}
              />
            )}
            {evolveOpen === locId && (
              <EvolvePanel
                species={e.species}
                onPick={(sp) => setSpecies(locId, sp)}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
