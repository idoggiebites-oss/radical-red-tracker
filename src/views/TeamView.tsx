import { useState } from "react";
import type { MonBuild, Run } from "../types";
import { Sprite } from "../components/Sprite";
import { TypeBadges, abilitiesFor, typesFor } from "../components/TypeBadges";
import {
  ALL_TYPES,
  STAT_KEYS,
  evolutionsFor,
  preEvolutionsFor,
  statsFor,
  typeColor,
  type StatKey,
} from "../lib/effectiveness";
import { ABILITY_NAMES, ITEM_NAMES, MOVE_NAMES, NATURES } from "../lib/damagecalc";

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
}: {
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
}) {
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
      <div className="toolbar">{toolbar}</div>
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
                    {e.build.item && ` · ${e.build.item}`}
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
