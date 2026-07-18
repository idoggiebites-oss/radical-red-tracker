import { useState } from "react";
import type {
  EncounterSlot,
  EncounterStatus,
  EncountersData,
  Location,
  MethodKey,
  Run,
} from "../types";
import { Sprite } from "../components/Sprite";
import { TypeBadges } from "../components/TypeBadges";

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

  const q = filter.trim().toLowerCase();
  const locations = data.locations.filter((loc) => {
    if (!showPostgame && loc.postgame) return false;
    if (!q) return true;
    if (loc.name.toLowerCase().includes(q)) return true;
    return Object.values(loc.methods).some((slots) =>
      slots?.some((s) => s.species.toLowerCase().includes(q)),
    );
  });

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

      {locations.map((loc) => (
        <RouteRow
          key={loc.id}
          loc={loc}
          run={run}
          updateRun={updateRun}
          open={open === loc.id}
          toggle={() => setOpen(open === loc.id ? null : loc.id)}
        />
      ))}
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
  loc,
  run,
  updateRun,
  open,
  toggle,
}: {
  loc: Location;
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
  open: boolean;
  toggle: () => void;
}) {
  const enc = run?.encounters[loc.id];

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
              {enc.nickname ? `${enc.nickname} (${enc.species})` : enc.species}
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
                {[...new Set(
                  Object.values(loc.methods).flatMap(
                    (slots) => slots?.map((s) => s.species) ?? [],
                  ),
                )].map((s) => (
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
            {(Object.keys(METHOD_LABELS) as MethodKey[]).map((m) => {
              const slots = loc.methods[m];
              if (!slots || slots.length === 0) return null;
              return (
                <div key={m} className="method-table">
                  <h4>{METHOD_LABELS[m]}</h4>
                  <EncounterTable
                    slots={slots}
                    onPick={run ? (sp) => setEncounter({ species: sp }) : undefined}
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
  onPick,
}: {
  slots: EncounterSlot[];
  onPick?: (species: string) => void;
}) {
  return (
    <table>
      <tbody>
        {slots.map((s, i) => (
          <tr
            key={i}
            className={onPick ? "pickable" : ""}
            title={onPick ? `Set ${s.species} as this route's encounter` : undefined}
            onClick={() => onPick?.(s.species)}
          >
            <td className="cell-sprite">
              <Sprite species={s.species} size={32} />
            </td>
            <td className="cell-species">{s.species}</td>
            <td>
              <TypeBadges species={s.species} small />
            </td>
            <td className="cell-rarity">{s.rarity}</td>
            <td className="cell-levels">{s.levels && `Lv. ${s.levels}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
