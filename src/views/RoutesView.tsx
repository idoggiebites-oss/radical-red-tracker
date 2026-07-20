import { useMemo, useState } from "react";
import encountersJson from "../data/encounters.json";
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
import { speciesRandomized } from "../lib/saveFile";
import { STARTER_ID } from "../lib/storage";
import { POSITION_LABELS, STARTER_REGIONS } from "../lib/starters";
import { groupLocations, type RouteGroup } from "../lib/routeGroups";
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

const STARTER_GROUP: RouteGroup = {
  id: STARTER_ID,
  name: STARTER_LOC.name,
  postgame: false,
  sections: [{ label: null, loc: STARTER_LOC }],
};

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

const data = encountersJson as unknown as EncountersData;

export function RoutesView({
  run,
  updateRun,
}: {
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
}) {
  const [showPostgame, setShowPostgame] = useState(false);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const randomized = speciesRandomized(run);

  const staticsMap = useMemo(() => staticsByLocation(data), []);
  // statics in areas without a route row (Seafoam, Navel Rock, postgame ...)
  const otherStatics = useMemo<LocatedStatic[]>(() => {
    const placed = new Set(
      Object.values(staticsMap).flatMap((list) => list.map((ls) => ls.static)),
    );
    return data.statics
      .filter((s) => !placed.has(s))
      .map((s) => ({ id: staticSlotId(s.species), static: s }));
  }, [staticsMap]);

  const groups = useMemo(() => groupLocations(data.locations), []);

  const q = filter.trim().toLowerCase();
  const matchesLoc = (loc: Location) => {
    if (loc.name.toLowerCase().includes(q)) return true;
    if (
      (staticsMap[loc.id] ?? []).some((ls) =>
        ls.static.species.toLowerCase().includes(q),
      )
    ) {
      return true;
    }
    if (
      Object.entries(run?.seenSpecies ?? {}).some(
        ([k, v]) =>
          k.startsWith(loc.id + "|") && v.toLowerCase().includes(q),
      )
    ) {
      return true;
    }
    return Object.values(loc.methods).some((slots) =>
      slots?.some((s) => s.species.toLowerCase().includes(q)),
    );
  };
  const visibleGroups = groups.filter((g) => {
    if (!showPostgame && g.postgame) return false;
    if (!q) return true;
    if (g.name.toLowerCase().includes(q)) return true;
    return g.sections.some(({ loc }) => matchesLoc(loc));
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
        {run && (
          <>
            <label
              className="checkbox"
              title="Species randomizer: record what each route slot became"
            >
              <input
                type="checkbox"
                checked={!!run.randomizer?.species}
                onChange={(e) =>
                  updateRun((r) => ({
                    ...r,
                    randomizer: { ...r.randomizer, species: e.target.checked },
                  }))
                }
              />
              🎲 Species
            </label>
            <label
              className="checkbox"
              title="Ability randomizer: builds and the calc accept any ability"
            >
              <input
                type="checkbox"
                checked={!!run.randomizer?.abilities}
                onChange={(e) =>
                  updateRun((r) => ({
                    ...r,
                    randomizer: { ...r.randomizer, abilities: e.target.checked },
                  }))
                }
              />
              🎲 Abilities
            </label>
          </>
        )}
        {run && <RouteStats run={run} />}
      </div>

      {randomized && (
        <div className="randomizer-banner">
          🎲 Species randomizer active — type whatever you actually caught in
          a route's species box (any species counts). If you want, click a
          slot's <span className="map-hint">→ record</span> cell to note what
          shows up in its place on that route.
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
          group={STARTER_GROUP}
          run={run}
          updateRun={updateRun}
          randomized={randomized}
          open={open === STARTER_ID}
          toggle={() => setOpen(open === STARTER_ID ? null : STARTER_ID)}
        />
      )}
      {visibleGroups.map((g) => {
        const groupStatics = g.sections.flatMap(
          ({ loc }) => staticsMap[loc.id] ?? [],
        );
        return (
          <RouteRow
            key={g.id}
            group={g}
            run={run}
            updateRun={updateRun}
            randomized={randomized}
            statics={groupStatics}
            staticsDefaultOpen={
              showPostgame ||
              (!!q &&
                groupStatics.some((ls) =>
                  ls.static.species.toLowerCase().includes(q),
                ))
            }
            open={open === g.id}
            toggle={() => setOpen(open === g.id ? null : g.id)}
          />
        );
      })}
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

/** lab balls in fixed left/middle/right order (grass/water/fire): pick a
 * region's trio from the dropdown, or type over a slot for randomized
 * starters — the picked POSITION is what drives rival boss variants */
function StarterPicker({
  run,
  updateRun,
}: {
  run: Run;
  updateRun: (fn: (run: Run) => Run) => void;
}) {
  const region =
    STARTER_REGIONS.find((r) => r.region === (run.starterRegion ?? "Kanto")) ??
    STARTER_REGIONS[0];
  // per-slot species overrides; prefill the picked slot so the recorded
  // species still shows after a reload
  const [overrides, setOverrides] = useState<string[]>(() => {
    const out = ["", "", ""];
    const recorded = run.encounters[STARTER_ID]?.species;
    if (
      run.starterPos != null &&
      recorded &&
      recorded !== region.trio[run.starterPos]
    ) {
      out[run.starterPos] = recorded;
    }
    return out;
  });

  const pick = (species: string, pos: 0 | 1 | 2) => {
    updateRun((r) => {
      const defaults: Run["encounters"][string] = {
        species,
        nickname: "",
        status: "caught",
        inParty: false,
      };
      return {
        ...r,
        starterPos: pos,
        encounters: {
          ...r.encounters,
          [STARTER_ID]: { ...defaults, ...r.encounters[STARTER_ID], species },
        },
      };
    });
  };

  const picked = run.encounters[STARTER_ID]?.species ? run.starterPos : undefined;

  return (
    <div className="starter-picker">
      <label className="starter-region muted">
        Starter region
        <select
          value={region.region}
          onChange={(e) =>
            updateRun((r) => ({ ...r, starterRegion: e.target.value }))
          }
        >
          {STARTER_REGIONS.map((r) => (
            <option key={r.region}>{r.region}</option>
          ))}
        </select>
      </label>
      <div className="starter-slots">
        {([0, 1, 2] as const).map((pos) => {
          const shown = overrides[pos].trim() || region.trio[pos];
          return (
            <div
              key={pos}
              className={"starter-slot" + (picked === pos ? " active" : "")}
            >
              <span className="slot-label">{POSITION_LABELS[pos]}</span>
              <button
                className="starter-choice"
                title={`Record the ${POSITION_LABELS[pos].toLowerCase()} ball as your starter`}
                onClick={() => pick(shown, pos)}
              >
                <Sprite species={shown} size={40} />
                <span className="starter-choice-name">{shown}</span>
                <TypeBadges species={shown} small />
              </button>
              <input
                placeholder="Randomized? type it…"
                list="starter-species"
                value={overrides[pos]}
                onChange={(e) => {
                  const next = [...overrides];
                  next[pos] = e.target.value;
                  setOverrides(next);
                  // retyping the already-picked slot fixes the record live
                  if (picked === pos) {
                    pick(e.target.value.trim() || region.trio[pos], pos);
                  }
                }}
              />
            </div>
          );
        })}
      </div>
      <datalist id="starter-species">
        {ALL_SPECIES.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
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
  group,
  run,
  updateRun,
  randomized,
  statics = [],
  staticsDefaultOpen = false,
  open,
  toggle,
}: {
  group: RouteGroup;
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
  randomized: boolean;
  statics?: LocatedStatic[];
  /** expand the statics section without a click (post-game shown / filter hit) */
  staticsDefaultOpen?: boolean;
  open: boolean;
  toggle: () => void;
}) {
  // one encounter slot per nuzlocke area: reuse whichever section id the run
  // already recorded on (pre-merge runs), else the group's canonical id
  const encId =
    group.sections.map((s) => s.loc.id).find((id) => run?.encounters[id]) ??
    group.id;
  const enc = run?.encounters[encId];
  // statics start collapsed (mostly post-game roamers); a manual toggle wins
  // over the default, and a tracked static keeps its status visible
  const [staticsOpen, setStaticsOpen] = useState<boolean | null>(null);
  const showStatics =
    staticsOpen ?? (staticsDefaultOpen || statics.some((ls) => run?.encounters[ls.id]));

  const seenFor = (locId: string, species: string) =>
    run?.seenSpecies?.[`${locId}|${species}`];
  const setSeen = (locId: string, species: string, seen: string) => {
    updateRun((r) => {
      const next = { ...(r.seenSpecies ?? {}) };
      const key = `${locId}|${species}`;
      if (seen.trim()) {
        next[key] = seen.trim();
      } else {
        delete next[key];
      }
      return { ...r, seenSpecies: next };
    });
  };

  const setEncounter = (patch: Partial<Run["encounters"][string]> | null) => {
    updateRun((r) => {
      const next = { ...r.encounters };
      if (patch === null) {
        delete next[encId];
      } else {
        const defaults: Run["encounters"][string] = {
          species: "",
          nickname: "",
          status: "caught",
          inParty: false,
        };
        next[encId] = { ...defaults, ...next[encId], ...patch };
      }
      return { ...r, encounters: next };
    });
  };

  return (
    <div className={`route-row ${enc ? `st-${enc.status}` : ""}`}>
      <button className="route-head" onClick={toggle}>
        <span className="route-name">
          {group.name}
          {group.postgame && <span className="badge postgame">post-game</span>}
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
                list={`species-${group.id}`}
              />
              <datalist id={`species-${group.id}`}>
                {(group.id === STARTER_ID || randomized
                  ? ALL_SPECIES
                  : [...new Set(
                      group.sections.flatMap(({ loc }) =>
                        Object.values(loc.methods).flatMap(
                          (slots) => slots?.map((s) => s.species) ?? [],
                        ),
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

          {(group.id === STARTER_ID || statics.length > 0) && (
            <div className="method-tables">
              {group.id === STARTER_ID && run && (
                <div className="method-table starter-table">
                  <h4>Oak's Lab · pick one</h4>
                  <StarterPicker run={run} updateRun={updateRun} />
                  <p className="muted starter-note">
                    The ball position decides the rival's counterpick (he takes
                    the one that beats yours), so his team variants on the
                    Bosses tab filter by position — even with another region's
                    trio or randomized starters. Randomized? Type what appeared
                    in a slot before picking it.
                  </p>
                </div>
              )}
              {statics.length > 0 && (
                <div className="method-table statics-table">
                  <button
                    className="statics-toggle"
                    onClick={() => setStaticsOpen(!showStatics)}
                  >
                    {showStatics ? "▾" : "▸"} Static / Legendary{" "}
                    <span className="count">({statics.length})</span>
                  </button>
                  {showStatics && (
                    <StaticsTable
                      statics={statics}
                      run={run}
                      updateRun={updateRun}
                      onPickRoute={
                        run ? (sp) => setEncounter({ species: sp }) : undefined
                      }
                    />
                  )}
                </div>
              )}
            </div>
          )}
          {group.sections.map(({ label, loc }) => {
            const methodKeys = (Object.keys(METHOD_LABELS) as MethodKey[]).filter(
              (m) => (loc.methods[m]?.length ?? 0) > 0,
            );
            if (methodKeys.length === 0) return null;
            return (
              <div key={loc.id} className="route-section">
                {label && (
                  <h5 className="route-section-label">
                    {label}
                    {loc.postgame && !group.postgame && (
                      <span className="badge postgame">post-game</span>
                    )}
                  </h5>
                )}
                <div className="method-tables">
                  {methodKeys.map((m) => (
                    <div key={m} className="method-table">
                      <h4>{METHOD_LABELS[m]}</h4>
                      <EncounterTable
                        slots={loc.methods[m]!}
                        seen={
                          randomized ? (sp) => seenFor(loc.id, sp) : undefined
                        }
                        onSee={
                          randomized
                            ? (sp, v) => setSeen(loc.id, sp, v)
                            : undefined
                        }
                        onPick={
                          run ? (sp) => setEncounter({ species: sp }) : undefined
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EncounterTable({
  slots,
  seen,
  onSee,
  onPick,
}: {
  slots: EncounterSlot[];
  /** when set, the species randomizer is active: per-route sighting notes */
  seen?: (species: string) => string | undefined;
  onSee?: (species: string, seen: string) => void;
  onPick?: (species: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const randomized = onSee !== undefined;
  return (
    <table>
      <tbody>
        {slots.map((s, i) => {
          const sighted = seen?.(s.species);
          const shown = sighted ?? s.species;
          return (
            <tr
              key={i}
              className={onPick ? "pickable" : ""}
              title={onPick ? `Set ${shown} as this route's encounter` : undefined}
              onClick={() => onPick?.(shown)}
            >
              <td className="cell-sprite">
                <Sprite species={s.species} size={32} />
              </td>
              <td className={"cell-species" + (sighted ? " orig-species" : "")}>
                {s.species}
              </td>
              {randomized && (
                <td className="cell-mapped" onClick={(e) => e.stopPropagation()}>
                  {editing === s.species ? (
                    <input
                      autoFocus
                      className="map-input"
                      list="all-species"
                      defaultValue={sighted ?? ""}
                      placeholder="Saw here…"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onSee?.(s.species, e.currentTarget.value);
                          setEditing(null);
                        } else if (e.key === "Escape") {
                          setEditing(null);
                        }
                      }}
                      onBlur={(e) => {
                        onSee?.(s.species, e.currentTarget.value);
                        setEditing(null);
                      }}
                    />
                  ) : sighted ? (
                    <button
                      className="map-value"
                      title="Edit sighting"
                      onClick={() => setEditing(s.species)}
                    >
                      → <Sprite species={sighted} size={26} /> {sighted}
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
