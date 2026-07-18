import { useMemo, useState } from "react";
import type { Boss, BossMode, BossMon, GameMode, Run } from "../types";
import { Sprite } from "../components/Sprite";
import { TypeBadges } from "../components/TypeBadges";
import {
  ALL_TYPES,
  defensiveProfile,
  formatMult,
  typeColor,
} from "../lib/effectiveness";

export function BossesView({
  modeData,
  mode,
  run,
  updateRun,
}: {
  modeData: BossMode;
  mode: GameMode;
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
}) {
  const [view, setView] = useState<"order" | "teams">("order");
  const [filter, setFilter] = useState("");
  const [category, setCategory] = useState(modeData.categories[0]?.name ?? "");

  return (
    <div className="bosses">
      <div className="toolbar">
        <div className="segmented">
          <button
            className={view === "order" ? "active" : ""}
            onClick={() => setView("order")}
          >
            Trainer order &amp; level caps
          </button>
          <button
            className={view === "teams" ? "active" : ""}
            onClick={() => setView("teams")}
          >
            Boss teams
          </button>
        </div>
        <span className="mode-badge">{mode === "hardcore" ? "Hardcore" : "Default"} mode</span>
        {view === "teams" && (
          <>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {modeData.categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              className="search"
              placeholder="Filter bosses or Pokémon…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </>
        )}
      </div>

      {view === "order" ? (
        <TrainerOrder modeData={modeData} run={run} updateRun={updateRun} />
      ) : (
        <BossTeams modeData={modeData} category={category} filter={filter} />
      )}
    </div>
  );
}

function TrainerOrder({
  modeData,
  run,
  updateRun,
}: {
  modeData: BossMode;
  run: Run | null;
  updateRun: (fn: (run: Run) => Run) => void;
}) {
  const order = modeData.trainerOrder;
  const nextIdx = useMemo(() => {
    if (!run) return -1;
    for (let i = 0; i < order.length; i++) {
      if (!run.defeated[i] && !order[i].optional) return i;
    }
    return -1;
  }, [run, order]);

  return (
    <div className="trainer-order">
      {order.map((t, i) => {
        const done = !!run?.defeated[i];
        return (
          <div
            key={i}
            className={
              "order-row" +
              (done ? " done" : "") +
              (i === nextIdx ? " next" : "") +
              (t.optional ? " optional" : "")
            }
          >
            {run && (
              <input
                type="checkbox"
                checked={done}
                onChange={(e) =>
                  updateRun((r) => ({
                    ...r,
                    defeated: { ...r.defeated, [i]: e.target.checked },
                  }))
                }
              />
            )}
            <span className="order-name">
              {t.name}
              {t.optional && <span className="badge optional">optional</span>}
            </span>
            <span className="order-loc">{t.location}</span>
            <span className="order-rewards">
              {t.rewards.map((rw) => (
                <span key={rw.label} className="reward-chip" title={rw.text}>
                  🎁 {rw.label}
                </span>
              ))}
            </span>
            <span className="order-cap">{t.levelCap && `cap ${t.levelCap}`}</span>
          </div>
        );
      })}
    </div>
  );
}

function BossTeams({
  modeData,
  category,
  filter,
}: {
  modeData: BossMode;
  category: string;
  filter: string;
}) {
  const q = filter.trim().toLowerCase();
  const cat = modeData.categories.find((c) => c.name === category);
  if (!cat) return null;
  const bosses = cat.bosses.filter((b) => {
    if (!q) return true;
    return (
      b.title.toLowerCase().includes(q) ||
      b.subtitle.toLowerCase().includes(q) ||
      b.pokemon.some((m) => m.species.toLowerCase().includes(q))
    );
  });
  return (
    <div className="boss-list">
      {bosses.map((b, i) => (
        <BossCard key={i} boss={b} />
      ))}
      {bosses.length === 0 && <p className="muted">No bosses match.</p>}
    </div>
  );
}

function BossCard({ boss }: { boss: Boss }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="boss-card">
      <button className="boss-head" onClick={() => setOpen(!open)}>
        <span className="boss-title">
          {boss.title}
          {boss.subtitle && <span className="boss-subtitle">{boss.subtitle}</span>}
        </span>
        <span className="boss-preview">
          {boss.pokemon.map((m, i) => (
            <Sprite key={i} species={m.species} size={30} />
          ))}
        </span>
        <span className="chev">{open ? "▾" : "▸"}</span>
      </button>
      {boss.battleEffect && (
        <div className="battle-effect">⚡ {boss.battleEffect}</div>
      )}
      {boss.rewards.length > 0 && (
        <div className="boss-rewards">
          {boss.rewards.map((r) => (
            <span key={r.label} className="reward-chip" title={r.text}>
              🎁 {r.label}
            </span>
          ))}
        </div>
      )}
      {open && (
        <>
          {boss.rewards.map((r) => (
            <div key={r.label} className="boss-notes">
              🎁 {r.label} — {r.text}
            </div>
          ))}
          {boss.notes && <div className="boss-notes">{boss.notes}</div>}
          <TeamWeaknesses boss={boss} />
          <div className="mon-grid">
            {boss.pokemon.map((m, i) => (
              <MonCard key={i} mon={m} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TeamWeaknesses({ boss }: { boss: Boss }) {
  const profiles = boss.pokemon.map((m) => defensiveProfile(m.species, m.ability));
  if (profiles.every((p) => Object.keys(p).length === 0)) return null;
  const rows = ALL_TYPES.map((atk) => {
    const weak = profiles.filter((p) => (p[atk] ?? 1) > 1).length;
    const immune = profiles.filter((p) => p[atk] === 0).length;
    const resist = profiles.filter((p) => {
      const m = p[atk] ?? 1;
      return m > 0 && m < 1;
    }).length;
    return { atk, weak, resist, immune };
  })
    .filter((r) => r.weak > 0)
    .sort((a, b) => b.weak - a.weak || a.immune + a.resist - (b.immune + b.resist));
  if (rows.length === 0) return null;
  return (
    <div className="team-weak">
      <span className="team-weak-label">Team is weak to:</span>
      {rows.map((r) => (
        <span key={r.atk} className="team-weak-chip">
          <span className="type-badge" style={{ background: typeColor(r.atk) }}>
            {r.atk}
          </span>
          <span className="team-weak-counts">
            {r.weak}/{boss.pokemon.length} weak
            {r.resist > 0 && ` · ${r.resist} resist`}
            {r.immune > 0 && ` · ${r.immune} immune`}
          </span>
        </span>
      ))}
    </div>
  );
}

function MonDefenses({ mon }: { mon: BossMon }) {
  const profile = defensiveProfile(mon.species, mon.ability);
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

function MonCard({ mon }: { mon: BossMon }) {
  return (
    <div className="mon-card">
      <div className="mon-head">
        <Sprite species={mon.species} size={44} />
        <div>
          <div className="mon-name">{mon.species}</div>
          <div className="mon-level">Lv. {mon.level || "?"}</div>
          <TypeBadges species={mon.species} small />
        </div>
      </div>
      <div className="mon-meta">
        <div>
          <span className="k">Ability</span> {mon.ability || "—"}
        </div>
        <div>
          <span className="k">Item</span> {mon.item || "—"}
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
      <MonDefenses mon={mon} />
      {STAT_ORDER.some((s) => mon.baseStats[s]) && (
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
              <td className="k">Base</td>
              {STAT_ORDER.map((s) => (
                <td key={s}>{mon.baseStats[s] || "–"}</td>
              ))}
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
