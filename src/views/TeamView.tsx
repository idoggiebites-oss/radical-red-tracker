import { useState } from "react";
import type { Run } from "../types";
import { Sprite } from "../components/Sprite";
import { TypeBadges, typesFor } from "../components/TypeBadges";
import {
  ALL_TYPES,
  STAT_KEYS,
  statsFor,
  typeColor,
  type StatKey,
} from "../lib/effectiveness";

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

  const Section = ({
    title,
    items,
    empty,
    actions,
    toolbar,
    highlightStat,
  }: {
    title: string;
    items: Entry[];
    empty: string;
    actions: (locId: string) => React.ReactNode;
    toolbar?: React.ReactNode;
    highlightStat?: StatKey | "KOS" | "";
  }) => (
    <section className="team-section">
      <div className="team-section-head">
        <h3>
          {title} <span className="count">({items.length})</span>
        </h3>
        {toolbar}
      </div>
      {items.length === 0 && <p className="muted">{empty}</p>}
      <div className="team-grid">
        {items.map(([locId, e]) => (
          <div key={locId} className="team-card">
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
              <div className="team-loc muted">{locId.replace(/-/g, " ")}</div>
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
            <div className="team-actions">{actions(locId)}</div>
          </div>
        ))}
      </div>
    </section>
  );

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
      <Section
        title="Party"
        items={party}
        empty={filteredEmpty("No Pokémon in the party — promote some from the box.")}
        highlightStat={sortStat}
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
