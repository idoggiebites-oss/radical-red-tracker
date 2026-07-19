import { useMemo, useState } from "react";
import type {
  EncounterSlot,
  EncounterStatus,
  EncountersData,
  Location,
  MethodKey,
  Run,
} from "../types";
import { Sprite } from "../components/Sprite";
import { ALL_SPECIES, TypeBadges } from "../components/TypeBadges";
import { hasSpeciesRandomizer } from "../lib/saveFile";
import { SAVE_FILE_FEATURE } from "../lib/featureFlags";
import { STARTER_ID } from "../lib/storage";
import { STARTER_TRIO } from "../lib/starters";
import {
  staticSlotId,
  staticsByLocation,
  type LocatedStatic,
} from "../lib/statics";

const STARTER_LOC: Location = {
  id: STARTER_ID,
  name: "STARTER · OAK'S LAB",
  postgame: false,
  methods: {},
};

const STARTER_SLOTS: EncounterSlot[] = STARTER_TRIO.map((species) => ({
  species,
  rarity: "",
  levels: "5",
}));

const METHOD_LABELS: Record<MethodKey, string> = {
  grass_day: "Grass / Cave · Day",
  grass_night: "Grass / Cave · Night",
  old_rod: "Old Rod",
  good_rod: "Good Rod",
  super_rod: "Super Rod",
  surfing: "Surfing",
};

const STATUS_META: { id: EncounterStatus; label: string; icon: string }[] = [
  { id: "caught", label: "Caught", icon: "✓" },
  { id: "fainted", label: "Fainted", icon: "✝" },
  { id: "missed", label: "Missed", icon: "✗" },
  { id: "skipped", label: "Skipped", icon: "–" },
];

export function RoutesView({
  data,
  run,
  updateRun,
}: {
  data: EncountersData;
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
}) {
  const [showPostgame, setShowPostgame] = useState(false);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const randomized =
    SAVE_FILE_FEATURE && run != null && hasSpeciesRandomizer(run.saveInfo);

  const staticsMap = useMemo(() => staticsByLocation(data), [data]);
  // statics in areas without a route row (Seafoam, Navel Rock, postgame ...)
  const otherStatics = useMemo<LocatedStatic[]>(() => {
    const placed = new Set(
      Object.values(staticsMap).flatMap((list) => list.map((ls) => ls.static)),
    );
    return data.statics
      .filter((s) => !placed.has(s))
      .map((s) => ({ id: staticSlotId(s.species), static: s }));
  }, [data, staticsMap]);

  const q = filter.trim().toLowerCase();
  const locations = data.locations.filter((loc) => {
    if (!showPostgame && loc.postgame) return false;
    if (!q) return true;
    if (loc.name.toLowerCase().includes(q)) return true;
    if (
      (staticsMap[loc.id] ?? []).some((ls) =>
        ls.static.species.toLowerCase().includes(q),
      )
    ) {
      return true;
    }
    return Object.values(loc.methods).some((slots) =>
      slots?.some((s) => s.species.toLowerCase().includes(q)),
    );
  });
  const otherFiltered = q
    ? otherStatics.filter(
        (ls) =>
          ls.static.species.toLowerCase().includes(q) ||
          ls.static.info.toLowerCase().includes(q),
      )
    : otherStatics;

  return (
    <div className="routes">
      <div className="toolbar">
        <input
          className="search"
          placeholder="Filter by route or Pokémon…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showPostgame}
            onChange={(e) => setShowPostgame(e.target.checked)}
          />
          Show post-game
        </label>
        {run && <RouteStats run={run} />}
      </div>

      {randomized && (
        <div className="randomizer-banner">
          🎲 Species randomizer active
          {run?.saveInfo?.random.scaledSpecies && " (scaled)"} for trainer{" "}
          <strong>{run?.saveInfo?.trainerName || "?"}</strong> —{" "}
          {Object.keys(run?.speciesMap ?? {}).length} mappings recorded. When
          you meet a randomized Pokémon, click its slot's{" "}
          <span className="map-hint">→ record</span> cell and enter what it
          became; the mapping applies to that species everywhere.
        </div>
      )}
      {randomized && (
        <datalist id="all-species">
          {ALL_SPECIES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}

      {run && !q && (
        <RouteRow
          loc={STARTER_LOC}
          run={run}
          updateRun={updateRun}
          randomized={randomized}
          open={open === STARTER_ID}
          toggle={() => setOpen(open === STARTER_ID ? null : STARTER_ID)}
        />
      )}
      {locations.map((loc) => (
        <RouteRow
          key={loc.id}
          loc={loc}
          run={run}
          updateRun={updateRun}
          randomized={randomized}
          statics={staticsMap[loc.id] ?? []}
          open={open === loc.id}
          toggle={() => setOpen(open === loc.id ? null : loc.id)}
        />
      ))}
      {otherFiltered.length > 0 && (
        <div className="route-row">
          <button
            className="route-head"
            onClick={() => setOpen(open === "statics-other" ? null : "statics-other")}
          >
            <span className="route-name">
              STATICS &amp; LEGENDARIES · OTHER AREAS
              <span className="badge postgame">many post-game</span>
            </span>
            <span className="chev">{open === "statics-other" ? "▾" : "▸"}</span>
          </button>
          {open === "statics-other" && (
            <div className="route-body">
              <div className="method-table statics-table">
                <StaticsTable
                  statics={otherFiltered}
                  run={run}
                  updateRun={updateRun}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StaticsTable({
  statics,
  run,
  updateRun,
  onPickRoute,
}: {
  statics: LocatedStatic[];
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
  /** when set, offers using the route's encounter slot for the catch */
  onPickRoute?: (species: string) => void;
}) {
  return (
    <table>
      <tbody>
        {statics.map((ls) => (
          <StaticRow
            key={ls.id}
            ls={ls}
            run={run}
            updateRun={updateRun}
            onPickRoute={onPickRoute}
          />
        ))}
      </tbody>
    </table>
  );
}

function StaticRow({
  ls,
  run,
  updateRun,
  onPickRoute,
}: {
  ls: LocatedStatic;
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
  onPickRoute?: (species: string) => void;
}) {
  const entry = run?.encounters[ls.id];

  const setStatic = (patch: Partial<Run["encounters"][string]> | null) => {
    updateRun((r) => {
      const next = { ...r.encounters };
      if (patch === null) {
        delete next[ls.id];
      } else {
        const defaults: Run["encounters"][string] = {
          species: ls.static.species,
          nickname: "",
          status: "caught",
          inParty: false,
        };
        next[ls.id] = { ...defaults, ...next[ls.id], ...patch };
      }
      return { ...r, encounters: next };
    });
  };

  return (
    <tr className={entry ? `st-${entry.status}` : ""}>
      <td className="cell-sprite">
        <Sprite species={ls.static.species} size={32} />
      </td>
      <td className="cell-species">{ls.static.species}</td>
      <td>
        <TypeBadges species={ls.static.species} small />
      </td>
      <td className="static-info muted">{ls.static.info}</td>
      {run && (
        <td className="static-actions">
          {entry ? (
            <>
              {STATUS_META.map((s) => (
                <button
                  key={s.id}
                  className={
                    entry.status === s.id ? `st-btn ${s.id} active` : "st-btn"
                  }
                  title={s.label}
                  onClick={() => setStatic({ status: s.id })}
                >
                  {s.icon}
                </button>
              ))}
              <button className="st-btn clear" onClick={() => setStatic(null)}>
                Clear
              </button>
            </>
          ) : (
            <>
              {onPickRoute && (
                <button
                  className="st-btn"
                  title="Record it in this route's encounter slot"
                  onClick={() => onPickRoute(ls.static.species)}
                >
                  → route slot
                </button>
              )}
              <button
                className="st-btn"
                title="Track as an extra catch — keeps the route's encounter slot free"
                onClick={() => setStatic({ status: "caught" })}
              >
                + extra catch
              </button>
            </>
          )}
        </td>
      )}
    </tr>
  );
}

function RouteStats({ run }: { run: Run }) {
  const all = Object.values(run.encounters);
  const n = (s: EncounterStatus) => all.filter((e) => e.status === s).length;
  return (
    <span className="route-stats">
      ✓ {n("caught")} · ✝ {n("fainted")} · ✗ {n("missed")}
    </span>
  );
}

function RouteRow({
  loc,
  run,
  updateRun,
  randomized,
  statics = [],
  open,
  toggle,
}: {
  loc: Location;
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
  randomized: boolean;
  statics?: LocatedStatic[];
  open: boolean;
  toggle: () => void;
}) {
  const enc = run?.encounters[loc.id];
  const speciesMap = run?.speciesMap ?? {};

  const setMapping = (original: string, mapped: string) => {
    updateRun((r) => {
      const next = { ...(r.speciesMap ?? {}) };
      if (mapped.trim()) {
        next[original] = mapped.trim();
      } else {
        delete next[original];
      }
      return { ...r, speciesMap: next };
    });
  };

  const setEncounter = (patch: Partial<Run["encounters"][string]> | null) => {
    updateRun((r) => {
      const next = { ...r.encounters };
      if (patch === null) {
        delete next[loc.id];
      } else {
        const defaults: Run["encounters"][string] = {
          species: "",
          nickname: "",
          status: "caught",
          inParty: false,
        };
        next[loc.id] = { ...defaults, ...next[loc.id], ...patch };
      }
      return { ...r, encounters: next };
    });
  };

  return (
    <div className={`route-row ${enc ? `st-${enc.status}` : ""}`}>
      <button className="route-head" onClick={toggle}>
        <span className="route-name">
          {loc.name}
          {loc.postgame && <span className="badge postgame">post-game</span>}
        </span>
        {enc && (
          <span className="route-enc">
            <Sprite species={enc.species} size={28} />
            <span>
              {enc.nickname
                ? `${enc.nickname}${enc.species ? ` (${enc.species})` : ""}`
                : enc.species || "—"}
            </span>
            <span className={`badge ${enc.status}`}>
              {STATUS_META.find((s) => s.id === enc.status)?.label}
            </span>
          </span>
        )}
        <span className="chev">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="route-body">
          {run && (
            <div className="enc-editor">
              <input
                placeholder="Species caught here…"
                value={enc?.species ?? ""}
                onChange={(e) => setEncounter({ species: e.target.value })}
                list={`species-${loc.id}`}
              />
              <datalist id={`species-${loc.id}`}>
                {(loc.id === STARTER_ID
                  ? ALL_SPECIES
                  : [...new Set(
                      Object.values(loc.methods).flatMap(
                        (slots) => slots?.map((s) => s.species) ?? [],
                      ),
                    )]
                ).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <input
                placeholder="Nickname"
                value={enc?.nickname ?? ""}
                onChange={(e) => setEncounter({ nickname: e.target.value })}
              />
              <div className="status-buttons">
                {STATUS_META.map((s) => (
                  <button
                    key={s.id}
                    className={enc?.status === s.id ? `st-btn ${s.id} active` : "st-btn"}
                    title={s.label}
                    onClick={() => setEncounter({ status: s.id })}
                  >
                    {s.icon} {s.label}
                  </button>
                ))}
                {enc && (
                  <button className="st-btn clear" onClick={() => setEncounter(null)}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="method-tables">
            {loc.id === STARTER_ID && (
              <div className="method-table">
                <h4>Oak's Lab · pick one</h4>
                <EncounterTable
                  slots={STARTER_SLOTS}
                  speciesMap={randomized ? speciesMap : undefined}
                  onMap={randomized ? setMapping : undefined}
                  onPick={
                    run
                      ? (sp) =>
                          setEncounter({
                            species: randomized ? (speciesMap[sp] ?? sp) : sp,
                          })
                      : undefined
                  }
                />
                <p className="muted starter-note">
                  Your pick decides the rival's starter — his team variants on
                  the Bosses tab filter accordingly.
                </p>
              </div>
            )}
            {statics.length > 0 && (
              <div className="method-table statics-table">
                <h4>Static / Legendary</h4>
                <StaticsTable
                  statics={statics}
                  run={run}
                  updateRun={updateRun}
                  onPickRoute={
                    run
                      ? (sp) =>
                          setEncounter({
                            species: randomized ? (speciesMap[sp] ?? sp) : sp,
                          })
                      : undefined
                  }
                />
              </div>
            )}
            {(Object.keys(METHOD_LABELS) as MethodKey[]).map((m) => {
              const slots = loc.methods[m];
              if (!slots || slots.length === 0) return null;
              return (
                <div key={m} className="method-table">
                  <h4>{METHOD_LABELS[m]}</h4>
                  <EncounterTable
                    slots={slots}
                    speciesMap={randomized ? speciesMap : undefined}
                    onMap={randomized ? setMapping : undefined}
                    onPick={
                      run
                        ? (sp) =>
                            setEncounter({
                              species: randomized ? (speciesMap[sp] ?? sp) : sp,
                            })
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EncounterTable({
  slots,
  speciesMap,
  onMap,
  onPick,
}: {
  slots: EncounterSlot[];
  /** when set, the species randomizer is active for this run */
  speciesMap?: Record<string, string>;
  onMap?: (original: string, mapped: string) => void;
  onPick?: (species: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const randomized = speciesMap !== undefined;
  return (
    <table>
      <tbody>
        {slots.map((s, i) => {
          const mapped = speciesMap?.[s.species];
          const shown = randomized ? (mapped ?? s.species) : s.species;
          return (
            <tr
              key={i}
              className={onPick ? "pickable" : ""}
              title={onPick ? `Set ${shown} as this route's encounter` : undefined}
              onClick={() => onPick?.(s.species)}
            >
              <td className="cell-sprite">
                <Sprite species={s.species} size={32} />
              </td>
              <td className={"cell-species" + (mapped ? " orig-species" : "")}>
                {s.species}
              </td>
              {randomized && (
                <td className="cell-mapped" onClick={(e) => e.stopPropagation()}>
                  {editing === s.species ? (
                    <input
                      autoFocus
                      className="map-input"
                      list="all-species"
                      defaultValue={mapped ?? ""}
                      placeholder="Became…"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onMap?.(s.species, e.currentTarget.value);
                          setEditing(null);
                        } else if (e.key === "Escape") {
                          setEditing(null);
                        }
                      }}
                      onBlur={(e) => {
                        onMap?.(s.species, e.currentTarget.value);
                        setEditing(null);
                      }}
                    />
                  ) : mapped ? (
                    <button
                      className="map-value"
                      title="Edit mapping"
                      onClick={() => setEditing(s.species)}
                    >
                      → <Sprite species={mapped} size={26} /> {mapped}
                    </button>
                  ) : (
                    <button
                      className="map-hint"
                      onClick={() => setEditing(s.species)}
                    >
                      → record
                    </button>
                  )}
                </td>
              )}
              <td>
                <TypeBadges species={shown} small />
              </td>
              <td className="cell-rarity">{s.rarity}</td>
              <td className="cell-levels">{s.levels && `Lv. ${s.levels}`}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
